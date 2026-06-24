import type { Context } from "hono";
import type { AppEnv } from "../types";

const PLANS: Record<string, { name: string; base: number }> = {
	pro:  { name: "Pro",  base: 799 },
	team: { name: "Team", base: 2499 },
};

export async function createOrder(c: Context<AppEnv>) {
	const { plan, name, email } = await c.req.json<{
		plan?: string;
		name?: string;
		email?: string;
	}>();

	if (!plan || !PLANS[plan]) {
		return c.json({ error: "Invalid plan" }, 400);
	}
	if (!name || !email) {
		return c.json({ error: "Name and email are required" }, 400);
	}

	const keyId     = c.env.RAZORPAY_KEY_ID;
	const keySecret = c.env.RAZORPAY_KEY_SECRET;

	if (!keyId || !keySecret) {
		return c.json({ error: "Payment not configured" }, 500);
	}

	const { base } = PLANS[plan];
	const gst   = Math.round(base * 0.18);
	const total = base + gst;

	const res = await fetch("https://api.razorpay.com/v1/orders", {
		method: "POST",
		headers: {
			Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			amount:   total * 100, // paise
			currency: "INR",
			receipt:  `ap_${plan}_${Date.now()}`,
			notes:    { plan, name, email },
		}),
	});

	if (!res.ok) {
		const err = await res.text();
		console.error("Razorpay create order error:", err);
		return c.json({ error: "Failed to create order" }, 500);
	}

	const order = await res.json() as { id: string; amount: number };

	return c.json({
		key_id:            keyId,
		razorpay_order_id: order.id,
		amount:            order.amount,
		plan:              PLANS[plan].name,
	});
}
