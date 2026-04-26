# ActionPulse — Complete Deploy Guide

## Project structure
```
actionpulse/
├── public/
│   ├── index.html        ← Landing page
│   ├── app.html          ← The tool users use
│   └── checkout.html     ← Payment page (Razorpay)
├── api/
│   ├── extract.js        ← Gemini AI (secret key here)
│   ├── create-order.js   ← Creates Razorpay order
│   └── verify-payment.js ← Verifies payment signature
├── package.json
└── vercel.json
```

## Step 1 — Get free API keys

### Gemini (AI)
→ aistudio.google.com/app/apikey → Create API key

### Razorpay (payments)
→ razorpay.com → Sign up → Settings → API Keys → Generate
You get: Key ID (rzp_live_...) + Key Secret

## Step 2 — Deploy
```bash
npm install
vercel --prod
```

## Step 3 — Add env vars in Vercel dashboard
```
GEMINI_API_KEY       = AIzaSy...
RAZORPAY_KEY_ID      = rzp_live_...
RAZORPAY_KEY_SECRET  = ...
```

## Step 4 — Test payment
Card: 4111 1111 1111 1111 | Any expiry | Any CVV

## Money flow
User pays ₹799 → Razorpay fee ~2% (~₹16) → You get ~₹783
Transfers to your bank every 2 days automatically.

## Your URLs when live
/             → Landing page
/app          → The tool
/checkout     → Payment
/api/extract  → AI backend
