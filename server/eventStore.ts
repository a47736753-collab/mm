import { demoPlan } from "../client/src/features/doorsopen/demo-data";
import { runChecks, readinessScore } from "../client/src/features/doorsopen/checks";
import type { EventPlan, ReadinessIssue } from "../client/src/features/doorsopen/types";
import { EventLogEntry, foldEvents, getAffectedResourceIds, runIncrementalChecks } from "../shared/events";
import { getPgDb } from "./pgDb";
import { events as eventsTable } from "../drizzle/schema";
import { lte, asc } from "drizzle-orm";

class EventStore {
  private log: EventLogEntry[] = [];
  private latestOffset = 0;
  private currentPlan: EventPlan = structuredClone(demoPlan);
  private currentIssues: ReadinessIssue[] = [];

  constructor() {
    this.seed(demoPlan);
  }

  public seed(initialPlan: EventPlan = demoPlan) {
    this.log = [];
    this.latestOffset = 0;
    this.currentPlan = structuredClone(initialPlan);

    const initEntry: EventLogEntry = {
      offset: 1,
      eventType: "PLAN_INITIALIZED",
      resourceId: initialPlan.event.id,
      payload: { plan: initialPlan },
      createdAt: new Date().toISOString(),
    };
    this.log.push(initEntry);
    this.latestOffset = 1;
    this.currentIssues = runChecks(this.currentPlan);
  }

  public getLatestOffset(): number {
    return this.latestOffset;
  }

  public getCurrentPlan(): EventPlan {
    return structuredClone(this.currentPlan);
  }

  public getCurrentIssues(): ReadinessIssue[] {
    return [...this.currentIssues];
  }

  public async appendEvent(
    eventType: string,
    resourceId: string | null,
    payload: Record<string, any>
  ): Promise<{ entry: EventLogEntry; affectedResourceIds: string[]; issues: ReadinessIssue[] }> {
    const nextOffset = this.latestOffset + 1;
    const entry: EventLogEntry = {
      offset: nextOffset,
      eventType,
      resourceId,
      payload,
      createdAt: new Date().toISOString(),
    };

    // Calculate affected resources before updating plan
    const affectedResourceIds = getAffectedResourceIds(entry, this.currentPlan);

    // Apply event into in-memory state via fold
    this.log.push(entry);
    this.latestOffset = nextOffset;
    this.currentPlan = foldEvents(this.log);

    // Run incremental conflict checks
    this.currentIssues = runIncrementalChecks(this.currentPlan, affectedResourceIds, this.currentIssues);

    // Persist to Postgres if available
    try {
      const db = await getPgDb();
      if (db) {
        await db.insert(eventsTable).values({
          offset: entry.offset,
          eventType: entry.eventType,
          resourceId: entry.resourceId,
          payload: entry.payload,
          createdAt: new Date(entry.createdAt),
        });
      }
    } catch (err) {
      // If DB is not configured or in local test mode, in-memory log remains active
      // console.warn("[EventStore] Note: DB persistence skipped:", (err as Error).message);
    }

    return {
      entry,
      affectedResourceIds,
      issues: this.currentIssues,
    };
  }

  public async getEvents(upToOffset?: number): Promise<EventLogEntry[]> {
    const target = upToOffset !== undefined ? upToOffset : this.latestOffset;

    // Check DB first if available
    try {
      const db = await getPgDb();
      if (db) {
        const rows = await db
          .select()
          .from(eventsTable)
          .where(lte(eventsTable.offset, target))
          .orderBy(asc(eventsTable.offset));

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            offset: Number(r.offset),
            eventType: r.eventType,
            resourceId: r.resourceId,
            payload: r.payload as Record<string, any>,
            createdAt: r.createdAt.toISOString(),
          }));
        }
      }
    } catch {
      // Fallback to in-memory log
    }

    return this.log.filter((e) => e.offset <= target);
  }

  /**
   * Replays events up to target offset and returns the conflict set as it existed at that offset.
   */
  public async getConflictsAt(targetOffset?: number): Promise<{
    offset: number;
    latestOffset: number;
    issues: ReadinessIssue[];
    readinessScore: number;
    plan: EventPlan;
  }> {
    const offset = targetOffset !== undefined ? targetOffset : this.latestOffset;
    if (offset < 1) {
      throw new Error(`Offset must be >= 1, received ${offset}`);
    }

    const eventsToReplay = await this.getEvents(offset);
    if (eventsToReplay.length === 0) {
      throw new Error(`No events found up to offset ${offset}`);
    }

    const historicalPlan = foldEvents(eventsToReplay);
    const issues = runChecks(historicalPlan);
    const score = readinessScore(issues);

    return {
      offset,
      latestOffset: this.latestOffset,
      issues,
      readinessScore: score,
      plan: historicalPlan,
    };
  }
}

export const eventStore = new EventStore();
