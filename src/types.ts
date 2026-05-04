import type { Context } from "hono";

export interface Env {
	GROQ_API_KEY: string;
	ASSETS: { fetch(request: Request): Promise<Response> };
}

export type AppContext = Context<{ Bindings: Env }>;
