import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import type { AppEnv } from "../types";

export const authMiddleware = async (c: Context<AppEnv>, next: Next) => {
	const sessionId = getCookie(c, "session_id");
	
	if (!sessionId) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	// Lookup session in D1
	const session = await c.env.DB.prepare(
		"SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
	).bind(sessionId).first();

	if (!session) {
		// Session expired or invalid
		return c.json({ error: "Unauthorized" }, 401);
	}

	// Lookup user
	const user = await c.env.DB.prepare(
		"SELECT id, email, name, avatar_url FROM users WHERE id = ?"
	).bind(session.user_id).first();

	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	// Set user in context variables
	c.set("user", user as any);

	await next();
};
