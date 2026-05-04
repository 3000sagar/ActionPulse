import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    plan, name, email
  } = req.body;

  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!KEY_SECRET) return res.status(500).json({ error: 'Server misconfigured' });

  // ── 1. Verify signature (proves payment is real, not faked) ──
  const body      = razorpay_order_id + '|' + razorpay_payment_id;
  const expected  = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Invalid payment signature. Contact support.' });
  }

  // ── 2. Payment is verified ✓ ──
  // Here you would:
  //   a) Save user to your database (Supabase / Firebase / PlanetScale)
  //   b) Send welcome email (Resend / SendGrid)
  //   c) Create a session / JWT token

  // For now — log and confirm activation
  console.log(`✓ Payment verified — ${email} activated ${plan} plan (${razorpay_payment_id})`);

  // TODO: Add your DB call here, e.g.:
  // await supabase.from('users').upsert({ email, name, plan, payment_id: razorpay_payment_id, active: true });

  return res.status(200).json({
    success: true,
    message: `${plan} plan activated for ${email}`,
    payment_id: razorpay_payment_id
  });
}
