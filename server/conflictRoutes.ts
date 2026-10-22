import type { Express } from "express";
import { eventStore } from "./eventStore";

export function registerConflictRoutes(app: Express) {
  /**
   * GET /api/conflicts?at=<offset>
   * Returns the conflict set as it existed at the specified offset by replaying events up to that offset.
   */
  app.get("/api/conflicts", async (req, res) => {
    try {
      const atParam = req.query.at;
      let targetOffset: number | undefined;

      if (atParam !== undefined) {
        targetOffset = Number(atParam);
        if (!Number.isInteger(targetOffset) || targetOffset < 1) {
          return res.status(400).json({ error: "Query parameter 'at' must be a positive integer" });
        }
      }

      const result = await eventStore.getConflictsAt(targetOffset);
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to retrieve conflicts" });
    }
  });

  /**
   * GET /api/events?upTo=<offset>
   * Returns event log entries up to specified offset or latest.
   */
  app.get("/api/events", async (req, res) => {
    try {
      const upToParam = req.query.upTo;
      let upToOffset: number | undefined;

      if (upToParam !== undefined) {
        upToOffset = Number(upToParam);
        if (!Number.isInteger(upToOffset) || upToOffset < 1) {
          return res.status(400).json({ error: "Query parameter 'upTo' must be a positive integer" });
        }
      }

      const events = await eventStore.getEvents(upToOffset);
      return res.json({
        events,
        latestOffset: eventStore.getLatestOffset(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to retrieve events" });
    }
  });

  /**
   * POST /api/events
   * Appends an event to the append-only event store and triggers incremental checks.
   */
  app.post("/api/events", async (req, res) => {
    try {
      const { eventType, resourceId, payload } = req.body;
      if (!eventType || typeof eventType !== "string") {
        return res.status(400).json({ error: "Field 'eventType' is required and must be a string" });
      }
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "Field 'payload' is required and must be an object" });
      }

      const result = await eventStore.appendEvent(eventType, resourceId ?? null, payload);
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to append event" });
    }
  });
}
