export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized: Missing token' });

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnon = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return res.status(500).json({ error: 'Server misconfigured: Supabase variables missing' });
  }

  try {
    const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnon }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  } catch(e) {
    return res.status(500).json({ error: 'Auth validation failed' });
  }


  const { notes, meetingName, attendees } = req.body;

  if (!notes || notes.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide meeting notes.' });
  }

  // YOUR API KEY LIVES HERE — in Vercel environment variables
  // User never sees this. Ever.
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'Server misconfigured. Contact support.' });
  }

  const context = [
    meetingName ? `Meeting: ${meetingName}` : '',
    attendees   ? `Attendees: ${attendees}` : ''
  ].filter(Boolean).join('\n');

  const prompt = `You are an expert meeting assistant. Extract all action items from these meeting notes and return ONLY a valid JSON object — no markdown, no backticks, no explanation.

${context ? context + '\n\n' : ''}Meeting Notes:
${notes}

Return this exact JSON shape:
{
  "summary": "2-3 sentence summary of the meeting",
  "action_items": [
    {
      "task": "Clear description of what needs to be done (start with a verb)",
      "owner": "Person responsible or 'Unassigned'",
      "deadline": "Specific date or relative (Friday, End of month) or 'Not specified'",
      "priority": "high | medium | low",
      "ai_prompt": "A ready-to-use prompt that the user can copy and paste into an AI to accomplish this exact task (e.g., 'Write a professional email...'). Provide full context from the meeting.",
      "ai_platform": "The best AI platform for this specific task (e.g., 'Claude', 'ChatGPT', 'Perplexity', 'Midjourney')"
    }
  ]
}

Rules: Extract EVERY action item. Start tasks with a verb. Return ONLY valid JSON.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      throw new Error(err.error?.message || 'Gemini API error');
    }

    const data = await geminiRes.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);

  } catch (e) {
    console.error('Extract error:', e.message);
    return res.status(500).json({ error: 'Failed to process notes. Please try again.' });
  }
}
