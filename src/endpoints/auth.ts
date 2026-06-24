import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { authMiddleware } from "../middleware/auth";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

// Helper to generate a random session ID
const generateSessionId = () => crypto.randomUUID();

// 1. Google OAuth - Redirect to Consent Screen
authRoutes.get("/google", (c) => {
	const clientId = c.env.GOOGLE_CLIENT_ID;
	const redirectUri = new URL("/api/auth/google/callback", c.req.url).toString();
	
	const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&access_type=online`;
	
	return c.redirect(googleAuthUrl);
});

// 2. Google OAuth - Callback
authRoutes.get("/google/callback", async (c) => {
	const code = c.req.query("code");
	if (!code) {
		return c.text("No code provided", 400);
	}

	const clientId = c.env.GOOGLE_CLIENT_ID;
	const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
	const redirectUri = new URL("/api/auth/google/callback", c.req.url).toString();

	// Exchange code for token
	const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}),
	});

	if (!tokenResponse.ok) {
		return c.text("Failed to exchange token", 400);
	}

	const tokenData = await tokenResponse.json() as { access_token: string };

	// Fetch user profile
	const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
		headers: { Authorization: `Bearer ${tokenData.access_token}` },
	});

	if (!profileResponse.ok) {
		return c.text("Failed to fetch user profile", 400);
	}

	const profile = await profileResponse.json() as { id: string; email: string; name: string; picture: string };

	// Upsert user in D1
	let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(profile.email).first();
	
	if (!user) {
		const newId = crypto.randomUUID();
		await c.env.DB.prepare(
			"INSERT INTO users (id, email, name, avatar_url) VALUES (?, ?, ?, ?)"
		).bind(newId, profile.email, profile.name, profile.picture).run();
		
		user = { id: newId, email: profile.email, name: profile.name, avatar_url: profile.picture };
	}

	// Create session
	const sessionId = generateSessionId();
	// Set expiration to 30 days
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 30);

	await c.env.DB.prepare(
		"INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
	).bind(sessionId, user.id, expiresAt.toISOString()).run();

	// Set cookie
	setCookie(c, "session_id", sessionId, {
		path: "/",
		httpOnly: true,
		secure: new URL(c.req.url).protocol === "https:",
		sameSite: "Lax",
		expires: expiresAt,
	});

	// Redirect to app
	return c.redirect("/app.html");
});

// 3. Email Magic Link - Send
authRoutes.post("/email/send", async (c) => {
	const { email } = await c.req.json();
	if (!email) return c.json({ error: "Email required" }, 400);

	const token = crypto.randomUUID();
	const expiresAt = new Date();
	expiresAt.setHours(expiresAt.getHours() + 1); // Valid for 1 hour

	await c.env.DB.prepare(
		"INSERT INTO email_tokens (token, email, expires_at) VALUES (?, ?, ?)"
	).bind(token, email, expiresAt.toISOString()).run();

	const magicLink = new URL(`/api/auth/email/verify?token=${token}`, c.req.url).toString();

	// Send email via Resend
	if (c.env.RESEND_API_KEY) {
		const resResponse = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${c.env.RESEND_API_KEY}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				from: "ActionPulse <onboarding@resend.dev>",
				to: [email],
				subject: "Your Magic Login Link",
				html: `<p>Click the link below to sign in:</p><p><a href="${magicLink}">${magicLink}</a></p>`,
			})
		});
		if (!resResponse.ok) {
			console.error("Failed to send email", await resResponse.text());
			return c.json({ error: "Failed to send email. Check API key and domain." }, 500);
		}
	} else {
		// Fallback for local testing if no API key is provided
		console.log(`[DEV] Magic Link for ${email}: ${magicLink}`);
	}

	return c.json({ success: true, message: "Check your email for the login link." });
});

// 4. Email Magic Link - Verify
authRoutes.get("/email/verify", async (c) => {
	const token = c.req.query("token");
	if (!token) return c.text("Invalid token", 400);

	const tokenRecord = await c.env.DB.prepare("SELECT * FROM email_tokens WHERE token = ?").bind(token).first();
	
	if (!tokenRecord) {
		return c.text("Invalid or expired token", 400);
	}

	const expiresAt = new Date(tokenRecord.expires_at as string);
	if (expiresAt < new Date()) {
		await c.env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();
		return c.text("Token expired", 400);
	}

	const email = tokenRecord.email as string;
	
	// Create or find user
	let user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
	if (!user) {
		const newId = crypto.randomUUID();
		await c.env.DB.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(newId, email).run();
		user = { id: newId, email };
	}

	// Create session
	const sessionId = generateSessionId();
	const sessionExpiresAt = new Date();
	sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30);

	await c.env.DB.prepare(
		"INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)"
	).bind(sessionId, user.id, sessionExpiresAt.toISOString()).run();

	// Delete used token
	await c.env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(token).run();

	// Set cookie
	setCookie(c, "session_id", sessionId, {
		path: "/",
		httpOnly: true,
		secure: new URL(c.req.url).protocol === "https:",
		sameSite: "Lax",
		expires: sessionExpiresAt,
	});

	return c.redirect("/app.html");
});

// 5. Logout
authRoutes.post("/logout", async (c) => {
	const sessionId = getCookie(c, "session_id");
	
	if (sessionId) {
		await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
	}
	
	deleteCookie(c, "session_id", { 
		path: "/",
		secure: new URL(c.req.url).protocol === "https:",
		sameSite: "Lax"
	});
	return c.json({ success: true });
});

// 6. Get Current User (Protected by middleware)
authRoutes.get("/me", authMiddleware, async (c) => {
	const user = c.get("user");
	return c.json({ user });
});
