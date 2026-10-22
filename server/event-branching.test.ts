import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { demoPlan } from "../client/src/features/doorsopen/demo-data";
import { runChecks } from "../client/src/features/doorsopen/checks";
import type { EventPlan } from "../client/src/features/doorsopen/types";
import {
  foldEvents,
  applyEvent,
  getAffectedResourceIds,
  runIncrementalChecks,
  type EventLogEntry,
} from "../shared/events";
import { eventStore } from "./eventStore";

describe("Event Log Branching and Folding Engine", () => {
  it("folds initial plan event into exact starting state", () => {
    const initEvent: EventLogEntry = {
      offset: 1,
      eventType: "PLAN_INITIALIZED",
      resourceId: demoPlan.event.id,
      payload: { plan: demoPlan },
      createdAt: new Date().toISOString(),
    };

    const folded = foldEvents([initEvent]);
    expect(folded.event.id).toBe(demoPlan.event.id);
    expect(folded.sessions).toHaveLength(demoPlan.sessions.length);
    expect(folded.venues).toHaveLength(demoPlan.venues.length);
  });

  it("applies sequential events in ascending offset order to compute current state", () => {
    const initEvent: EventLogEntry = {
      offset: 1,
      eventType: "PLAN_INITIALIZED",
      resourceId: demoPlan.event.id,
      payload: { plan: demoPlan },
      createdAt: new Date().toISOString(),
    };

    // Move Robotics Workshop (session-robotics) to Room C (venue-room-c)
    const moveEvent: EventLogEntry = {
      offset: 2,
      eventType: "SESSION_MOVED",
      resourceId: "session-robotics",
      payload: {
        sessionId: "session-robotics",
        venueId: "venue-room-c",
        start: "10:00",
        end: "11:00",
        equipmentIds: ["item-projector-p1"],
        oldVenueId: "venue-room-a",
      },
      createdAt: new Date().toISOString(),
    };

    // Complete a task (task-checkin)
    const taskEvent: EventLogEntry = {
      offset: 3,
      eventType: "TASK_UPDATED",
      resourceId: "task-checkin",
      payload: {
        taskId: "task-checkin",
        completed: true,
      },
      createdAt: new Date().toISOString(),
    };

    const foldedAt2 = foldEvents([initEvent, moveEvent]);
    const roboticsAt2 = foldedAt2.sessions.find((s) => s.id === "session-robotics");
    expect(roboticsAt2?.venueId).toBe("venue-room-c");
    const checkinAt2 = foldedAt2.tasks.find((t) => t.id === "task-checkin");
    expect(checkinAt2?.completed).toBe(false);

    const foldedAt3 = foldEvents([initEvent, moveEvent, taskEvent]);
    const checkinAt3 = foldedAt3.tasks.find((t) => t.id === "task-checkin");
    expect(checkinAt3?.completed).toBe(true);
  });
});

describe("Incremental Conflict Checks", () => {
  it("determines affected resources for session moves and re-checks only affected connections", () => {
    const moveEvent = {
      eventType: "SESSION_MOVED",
      resourceId: "session-robotics",
      payload: {
        sessionId: "session-robotics",
        venueId: "venue-room-c",
        start: "10:00",
        end: "11:00",
        equipmentIds: ["item-projector-p1"],
        oldVenueId: "venue-room-a",
      },
    };

    const affected = getAffectedResourceIds(moveEvent, demoPlan);
    expect(affected).toContain("session-robotics");
    expect(affected).toContain("venue-room-c");
    expect(affected).toContain("venue-room-a");
    expect(affected).toContain("item-projector-p1");

    const proposedPlan: EventPlan = {
      ...demoPlan,
      sessions: demoPlan.sessions.map((s) =>
        s.id === "session-robotics" ? { ...s, venueId: "venue-room-c" } : s
      ),
    };

    const fullOriginalIssues = runChecks(demoPlan);
    const incrementalIssues = runIncrementalChecks(proposedPlan, affected, fullOriginalIssues);
    const fullRecheckIssues = runChecks(proposedPlan);

    // Incremental checks must yield the exact same issues as a full recheck
    expect(incrementalIssues.map((i) => i.id).sort()).toEqual(
      fullRecheckIssues.map((i) => i.id).sort()
    );

    // Room A collision is cleared
    expect(incrementalIssues.some((i) => i.id.startsWith("room:") && i.links.some((l) => l.id === "session-robotics"))).toBe(false);

    // Projector P1 double-booking is retained
    expect(incrementalIssues.some((i) => i.kind === "equipment" && i.title.includes("Projector P1"))).toBe(true);
  });
});

describe("Historical Offset Replay (EventStore)", () => {
  beforeEach(() => {
    eventStore.seed(demoPlan);
  });

  it("replays conflict sets at any historical offset", async () => {
    const baselineConflict = await eventStore.getConflictsAt(1);
    expect(baselineConflict.offset).toBe(1);
    expect(baselineConflict.latestOffset).toBe(1);
    const baselineRoomCollision = baselineConflict.issues.find(
      (i) => i.kind === "room" && i.links.some((l) => l.id === "session-robotics")
    );
    expect(baselineRoomCollision).toBeDefined();

    // Append move event at offset 2
    await eventStore.appendEvent("SESSION_MOVED", "session-robotics", {
      sessionId: "session-robotics",
      venueId: "venue-room-c",
      start: "10:00",
      end: "11:00",
      equipmentIds: ["item-projector-p1"],
      oldVenueId: "venue-room-a",
    });

    expect(eventStore.getLatestOffset()).toBe(2);

    // Conflicts at offset 2: Room collision is resolved
    const offset2Conflict = await eventStore.getConflictsAt(2);
    expect(offset2Conflict.offset).toBe(2);
    expect(offset2Conflict.latestOffset).toBe(2);
    expect(
      offset2Conflict.issues.some(
        (i) => i.kind === "room" && i.links.some((l) => l.id === "session-robotics")
      )
    ).toBe(false);

    // Time-travel replay back to offset 1: Room collision still exists at offset 1!
    const replayAt1 = await eventStore.getConflictsAt(1);
    expect(replayAt1.offset).toBe(1);
    expect(replayAt1.latestOffset).toBe(2);
    expect(
      replayAt1.issues.some(
        (i) => i.kind === "room" && i.links.some((l) => l.id === "session-robotics")
      )
    ).toBe(true);
  });
});

import express from "express";
import { registerConflictRoutes } from "./conflictRoutes";
import type { Server } from "http";

describe("REST API: /api/conflicts and /api/events", () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    eventStore.seed(demoPlan);
    app = express();
    app.use(express.json());
    registerConflictRoutes(app);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /api/conflicts returns baseline conflicts at offset 1", async () => {
    const res = await fetch(`${baseUrl}/api/conflicts?at=1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.offset).toBe(1);
    expect(data.issues.length).toBeGreaterThan(0);
    expect(data.readinessScore).toBeDefined();
  });

  it("POST /api/events appends event, increments offset, and recomputes conflicts", async () => {
    const postRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "SESSION_MOVED",
        resourceId: "session-robotics",
        payload: {
          sessionId: "session-robotics",
          venueId: "venue-room-c",
          start: "10:00",
          end: "11:00",
          equipmentIds: ["item-projector-p1"],
        },
      }),
    });

    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.entry.offset).toBe(2);
    expect(postData.affectedResourceIds).toContain("session-robotics");

    // Query historical offset 1
    const histRes = await fetch(`${baseUrl}/api/conflicts?at=1`);
    const histData = await histRes.json();
    expect(histData.offset).toBe(1);
    expect(histData.latestOffset).toBe(2);

    // Query latest offset (offset 2)
    const latestRes = await fetch(`${baseUrl}/api/conflicts`);
    const latestData = await latestRes.json();
    expect(latestData.offset).toBe(2);
  });
});
