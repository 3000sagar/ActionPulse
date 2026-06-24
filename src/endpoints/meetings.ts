import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../types";

export const meetingsRoutes = new Hono<AppEnv>();

// All meetings routes require authentication
meetingsRoutes.use("*", authMiddleware);

// GET /api/meetings — List all meetings for the authenticated user
meetingsRoutes.get("/", async (c) => {
	const user = c.get("user");
	if (!user) return c.json({ error: "Unauthorized" }, 401);

	const { results } = await c.env.DB.prepare(
		"SELECT id, meeting_name, source, summary, created_at FROM meetings WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
	).bind(user.id).all();

	return c.json(results || []);
});

// GET /api/meetings/:id — Get a single meeting by ID
meetingsRoutes.get("/:id", async (c) => {
	const user = c.get("user");
	if (!user) return c.json({ error: "Unauthorized" }, 401);

	const meetingId = c.req.param("id");

	const meeting = await c.env.DB.prepare(
		"SELECT * FROM meetings WHERE id = ? AND user_id = ?"
	).bind(meetingId, user.id).first();

	if (!meeting) {
		return c.json({ error: "Meeting not found" }, 404);
	}

	return c.json(meeting);
});
