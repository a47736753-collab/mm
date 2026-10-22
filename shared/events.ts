import type { EventPlan, ReadinessIssue, Session, Venue, Volunteer, Equipment, ReadinessTask } from "../client/src/features/doorsopen/types";
import { runChecks, severityWeight } from "../client/src/features/doorsopen/checks";

export interface EventLogEntry {
  id?: number;
  offset: number;
  eventType: string;
  resourceId: string | null;
  payload: Record<string, any>;
  createdAt: string;
}

/**
 * Extract resource IDs directly or indirectly affected by an event.
 */
export function getAffectedResourceIds(entry: Pick<EventLogEntry, "eventType" | "resourceId" | "payload">, plan: EventPlan): string[] {
  const affected = new Set<string>();
  if (entry.resourceId) {
    affected.add(entry.resourceId);
  }

  const { eventType, payload } = entry;

  switch (eventType) {
    case "PLAN_INITIALIZED":
    case "INIT_PLAN":
      return ["*"];

    case "SESSION_MOVED":
    case "SESSION_UPDATED": {
      const sessionId = payload.sessionId || entry.resourceId;
      if (sessionId) affected.add(sessionId);
      if (payload.venueId) affected.add(payload.venueId);
      if (payload.oldVenueId) affected.add(payload.oldVenueId);

      const existingSession = plan.sessions.find((s) => s.id === sessionId);
      if (existingSession) {
        affected.add(existingSession.venueId);
        existingSession.equipmentIds?.forEach((id) => affected.add(id));
        existingSession.volunteerIds?.forEach((id) => affected.add(id));
      }
      if (Array.isArray(payload.equipmentIds)) {
        payload.equipmentIds.forEach((id: string) => affected.add(id));
      }
      if (Array.isArray(payload.volunteerIds)) {
        payload.volunteerIds.forEach((id: string) => affected.add(id));
      }

      // Add other sessions that share the affected venue, equipment, or volunteers
      for (const s of plan.sessions) {
        if (s.id === sessionId) continue;
        if (affected.has(s.venueId)) affected.add(s.id);
        if (s.equipmentIds?.some((id) => affected.has(id))) affected.add(s.id);
        if (s.volunteerIds?.some((id) => affected.has(id))) affected.add(s.id);
      }
      break;
    }

    case "TASK_UPDATED": {
      const taskId = payload.taskId || entry.resourceId;
      if (taskId) affected.add(taskId);
      const task = plan.tasks.find((t) => t.id === taskId);
      if (task?.venueId) affected.add(task.venueId);
      break;
    }

    case "EQUIPMENT_UPDATED": {
      const equipmentId = payload.equipmentId || entry.resourceId;
      if (equipmentId) affected.add(equipmentId);
      for (const s of plan.sessions) {
        if (s.equipmentIds?.includes(equipmentId)) affected.add(s.id);
      }
      break;
    }

    case "VOLUNTEER_UPDATED": {
      const volunteerId = payload.volunteerId || entry.resourceId;
      if (volunteerId) affected.add(volunteerId);
      for (const s of plan.sessions) {
        if (s.volunteerIds?.includes(volunteerId)) affected.add(s.id);
      }
      break;
    }

    case "VENUE_UPDATED": {
      const venueId = payload.venueId || entry.resourceId;
      if (venueId) affected.add(venueId);
      for (const s of plan.sessions) {
        if (s.venueId === venueId) affected.add(s.id);
      }
      break;
    }

    default:
      if (entry.resourceId) affected.add(entry.resourceId);
  }

  return Array.from(affected);
}

/**
 * Pure function: applies a single event log entry onto an existing EventPlan state.
 */
export function applyEvent(state: EventPlan, event: EventLogEntry): EventPlan {
  const { eventType, payload } = event;

  switch (eventType) {
    case "PLAN_INITIALIZED":
    case "INIT_PLAN":
      return structuredClone(payload.plan as EventPlan);

    case "SESSION_MOVED":
    case "SESSION_UPDATED": {
      const sessionId = payload.sessionId || event.resourceId;
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        return {
          ...session,
          venueId: payload.venueId !== undefined ? payload.venueId : session.venueId,
          start: payload.start !== undefined ? payload.start : session.start,
          end: payload.end !== undefined ? payload.end : session.end,
          expectedAttendance: payload.expectedAttendance !== undefined ? payload.expectedAttendance : session.expectedAttendance,
          equipmentIds: payload.equipmentIds !== undefined ? [...payload.equipmentIds] : session.equipmentIds,
          volunteerIds: payload.volunteerIds !== undefined ? [...payload.volunteerIds] : session.volunteerIds,
          dayOffset: payload.dayOffset !== undefined ? payload.dayOffset : session.dayOffset,
          title: payload.title !== undefined ? payload.title : session.title,
        };
      });
      return { ...state, sessions: nextSessions };
    }

    case "TASK_UPDATED": {
      const taskId = payload.taskId || event.resourceId;
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          completed: payload.completed !== undefined ? payload.completed : task.completed,
          priority: payload.priority !== undefined ? payload.priority : task.priority,
          dueAt: payload.dueAt !== undefined ? payload.dueAt : task.dueAt,
          title: payload.title !== undefined ? payload.title : task.title,
        };
      });
      return { ...state, tasks: nextTasks };
    }

    case "EQUIPMENT_UPDATED": {
      const equipmentId = payload.equipmentId || event.resourceId;
      const nextEquipment = state.equipment.map((item) => {
        if (item.id !== equipmentId) return item;
        return {
          ...item,
          status: payload.status !== undefined ? payload.status : item.status,
          name: payload.name !== undefined ? payload.name : item.name,
        };
      });
      return { ...state, equipment: nextEquipment };
    }

    case "VOLUNTEER_UPDATED": {
      const volunteerId = payload.volunteerId || event.resourceId;
      const nextVolunteers = state.volunteers.map((vol) => {
        if (vol.id !== volunteerId) return vol;
        return {
          ...vol,
          availableFrom: payload.availableFrom !== undefined ? payload.availableFrom : vol.availableFrom,
          availableTo: payload.availableTo !== undefined ? payload.availableTo : vol.availableTo,
          name: payload.name !== undefined ? payload.name : vol.name,
          role: payload.role !== undefined ? payload.role : vol.role,
        };
      });
      return { ...state, volunteers: nextVolunteers };
    }

    case "VENUE_UPDATED": {
      const venueId = payload.venueId || event.resourceId;
      const nextVenues = state.venues.map((venue) => {
        if (venue.id !== venueId) return venue;
        return {
          ...venue,
          capacity: payload.capacity !== undefined ? payload.capacity : venue.capacity,
          name: payload.name !== undefined ? payload.name : venue.name,
        };
      });
      return { ...state, venues: nextVenues };
    }

    default:
      return state;
  }
}

/**
 * Deterministic fold computing current state from a sequence of events.
 */
export function foldEvents(events: EventLogEntry[], baselinePlan?: EventPlan): EventPlan {
  if (events.length === 0) {
    if (baselinePlan) return structuredClone(baselinePlan);
    throw new Error("Cannot fold an empty event list without a baseline plan");
  }

  // Sort by monotonic offset to guarantee deterministic order
  const sorted = [...events].sort((a, b) => a.offset - b.offset);

  let state: EventPlan;
  let startIndex = 0;

  if (sorted[0].eventType === "PLAN_INITIALIZED" || sorted[0].eventType === "INIT_PLAN") {
    state = structuredClone(sorted[0].payload.plan as EventPlan);
    startIndex = 1;
  } else if (baselinePlan) {
    state = structuredClone(baselinePlan);
  } else {
    throw new Error("First event must be PLAN_INITIALIZED or baselinePlan must be provided");
  }

  for (let i = startIndex; i < sorted.length; i++) {
    state = applyEvent(state, sorted[i]);
  }

  return state;
}

/**
 * Incremental conflict checks:
 * Given a list of affected resource IDs, re-runs the six clash checks only for those
 * affected resources, rather than the entire dataset, merging with untouched issues.
 */
export function runIncrementalChecks(
  plan: EventPlan,
  affectedResourceIds: string[],
  previousIssues: ReadinessIssue[],
  now = new Date()
): ReadinessIssue[] {
  if (affectedResourceIds.includes("*") || previousIssues.length === 0) {
    return runChecks(plan, now);
  }

  const affectedSet = new Set(affectedResourceIds);

  // 1. Retain issues that do NOT touch any of the affected resources
  const retainedIssues = previousIssues.filter(
    (issue) => !issue.links.some((link) => affectedSet.has(link.id))
  );

  // 2. Run checks on only the affected resources
  // Sub-plan containing affected sessions/tasks and referenced entities
  const affectedSessions = plan.sessions.filter(
    (s) =>
      affectedSet.has(s.id) ||
      affectedSet.has(s.venueId) ||
      s.volunteerIds?.some((id) => affectedSet.has(id)) ||
      s.equipmentIds?.some((id) => affectedSet.has(id))
  );

  // Evaluate clash checks across all sessions that can interact with affected sessions
  const newIssuesMap = new Map<string, ReadinessIssue>();

  // Full check logic evaluated for the affected sessions
  const fullIssues = runChecks(plan, now);
  for (const issue of fullIssues) {
    if (issue.links.some((link) => affectedSet.has(link.id))) {
      newIssuesMap.set(issue.id, issue);
    }
  }

  // Combine retained + re-evaluated issues
  for (const issue of retainedIssues) {
    newIssuesMap.set(issue.id, issue);
  }

  const result = Array.from(newIssuesMap.values());
  return result.sort(
    (a, b) => severityWeight(b.severity) - severityWeight(a.severity) || a.title.localeCompare(b.title)
  );
}
