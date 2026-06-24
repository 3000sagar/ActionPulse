import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Extract } from "./endpoints/extract";
import { createOrder } from "./endpoints/create-order";
import { verifyPayment } from "./endpoints/verify-payment";
import { BestAI } from "./endpoints/best-ai";
import { authRoutes } from "./endpoints/auth";
import { meetingsRoutes } from "./endpoints/meetings";
import { authMiddleware } from "./middleware/auth";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("/*", cors({
	origin: (origin) => origin || "*",
	allowMethods: ["GET", "POST", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization", "Cookie"],
	credentials: true,
	maxAge: 86400,
}));

app.route("/api/auth", authRoutes);
app.route("/api/meetings", meetingsRoutes);

// Apply auth middleware to protect API routes
app.use("/api/extract", authMiddleware);
app.use("/api/best-ai", authMiddleware);

const openapi = fromHono(app);

openapi.post("/api/extract", Extract);
openapi.post("/api/best-ai", BestAI);

// Payment routes (plain Hono handlers, no OpenAPI schema needed)
app.post("/api/create-order", createOrder);
app.post("/api/verify-payment", verifyPayment);

// Static asset routing
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
