import type { Context } from "hono";
import type { AppEnv } from "../types";

export async function verifyPayment(c: Context<AppEnv>) {
	const body = await c.req.json<{
		razorpay_order_id?:   string;
		razorpay_payment_id?: string;
		razorpay_signature?:  string;
		plan?:  string;
		name?:  string;
		email?: string;
	}>();

	const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, name, email } = body;

	if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
		return c.json({ error: "Missing payment details" }, 400);
	}

	const secret = c.env.RAZORPAY_KEY_SECRET;
	if (!secret) {
		return c.json({ error: "Payment not configured" }, 500);
	}

	// HMAC-SHA256 verification using Web Crypto API
	const message = `${razorpay_order_id}|${razorpay_payment_id}`;
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
	const expected = Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	if (expected !== razorpay_signature) {
		return c.json({ error: "Invalid payment signature" }, 400);
	}

	// Payment verified — log it
	console.log("Payment verified:", { razorpay_payment_id, plan, name, email });

	return c.json({
		success: true,
		message: `Payment verified! Your ${plan || "Pro"} plan is now active.`,
		payment_id: razorpay_payment_id,
	});
}
