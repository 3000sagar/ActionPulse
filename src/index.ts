import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Extract } from "./endpoints/extract";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors({
	origin: "*",
	allowMethods: ["GET", "POST", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization"],
	maxAge: 86400,
}));

const openapi = fromHono(app);

openapi.post("/api/extract", Extract);

app.get("*", async (c) => {
	const path = c.req.path;

	if (path.startsWith("/api")) {
		return c.text("Not found", 404);
	}

	const assetPath =
		path === "/"
			? "/index.html"
			: path === "/app"
				? "/app.html"
				: path === "/login"
					? "/login.html"
					: path === "/checkout"
						? "/checkout.html"
						: path;

	return c.env.ASSETS.fetch(new Request(new URL(assetPath, c.req.url), c.req.raw));
});

export default app;
