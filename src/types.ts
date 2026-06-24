export interface Env {
	GROQ_API_KEY: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	RESEND_API_KEY: string;
	TAVILY_API_KEY: string;
	RAZORPAY_KEY_ID: string;
	RAZORPAY_KEY_SECRET: string;
	ASSETS: { fetch(request: Request): Promise<Response> };
	DB: D1Database;
}

export interface User {
	id: string;
	email: string;
	name: string | null;
	avatar_url: string | null;
}

export type AppEnv = {
	Bindings: Env;
	Variables: {
		user: User | null;
	};
};
