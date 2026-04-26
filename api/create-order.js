import Razorpay from 'razorpay';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, name, email } = req.body;

  const PLANS = {
    pro:  { name: 'Pro',  baseINR: 799  },
    team: { name: 'Team', baseINR: 2499 }
  };

  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

  const KEY_ID     = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!KEY_ID || !KEY_SECRET) {
    return res.status(500).json({ error: 'Payment not configured. Contact support.' });
  }

  const rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

  const base  = PLANS[plan].baseINR;
  const gst   = Math.round(base * 0.18);
  const total = (base + gst) * 100; // Razorpay expects paise

  try {
    const order = await rzp.orders.create({
      amount:   total,
      currency: 'INR',
      receipt:  `ap_${plan}_${Date.now()}`,
      notes:    { plan, name, email }
    });

    return res.status(200).json({
      razorpay_order_id: order.id,
      key_id: KEY_ID,   // Safe to send to frontend — this is the public key
      amount: total,
      plan,
      name,
      email
    });

  } catch (e) {
    console.error('Razorpay order error:', e);
    return res.status(500).json({ error: 'Could not create payment order. Try again.' });
  }
}
