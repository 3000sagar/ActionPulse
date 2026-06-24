export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Auth ──
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized: Missing token' });

  const token = authHeader.split(' ')[1];
  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
  const GROQ_KEY      = process.env.GROQ_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return res.status(500).json({ error: 'Server misconfigured: Supabase variables missing' });
  }
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: AI key missing' });
  }

  let user;
  try {
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON }
    });
    if (!authRes.ok) return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    user = await authRes.json();
  } catch {
    return res.status(500).json({ error: 'Auth validation failed' });
  }

  // ── 2. Input ──
  const { notes, meetingName, attendees } = req.body || {};
  if (!notes || notes.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide meeting notes (at least 10 characters).' });
  }

  const context = [
    meetingName ? `Meeting: ${meetingName}` : '',
    attendees   ? `Attendees: ${attendees}` : ''
  ].filter(Boolean).join('\n');

  const safeName = meetingName?.trim() || 'Untitled Meeting';

  // ── 3. Prompt ──
  const prompt = `You are an expert meeting assistant and execution strategist.
Extract ALL action items from the meeting notes below and return ONLY valid JSON — no markdown, no backticks, no explanation.

${context ? context + '\n\n' : ''}Meeting Notes:
${notes}

Return this exact JSON structure:
{
  "summary": "2-3 sentence executive summary of the meeting",
  "action_items": [
    {
      "task": "Clear action starting with a verb",
      "owner": "Person responsible or 'Unassigned'",
      "deadline": "Specific date, relative date, or 'Not specified'",
      "priority": "high | medium | low",
      "category": "engineering | design | marketing | product | operations | research | other",
      "impact": "Why this task matters in one sentence",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "ai_prompt": "A complete, copy-paste-ready AI prompt to accomplish this task. Include role, context, goal, constraints, and expected output format.",
      "ai_platform": "Best AI tool for this task (e.g. Claude, ChatGPT, Perplexity, Midjourney, GitHub Copilot)"
    }
  ]
}

Rules: Extract EVERY action item. Start tasks with a verb. Return ONLY valid JSON.`;

  // ── 4. Groq call ──
  let parsed;
  try {
    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 3000
      })
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error('Groq API error: ' + err);
    }

    const data = await aiRes.json();
    let raw = data.choices?.[0]?.message?.content || '';
    raw = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('AI returned invalid format');

    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    console.error('Extract error:', e.message);
    return res.status(500).json({ error: 'Failed to process notes. Please try again.' });
  }

  // ── 5. Normalize ──
  if (!Array.isArray(parsed.action_items)) parsed.action_items = [];
  parsed.action_items = parsed.action_items.map(item => ({
    task:        item.task        || 'Undefined task',
    owner:       item.owner       || 'Unassigned',
    deadline:    item.deadline    || 'Not specified',
    priority:    ['high','medium','low'].includes(item.priority) ? item.priority : 'medium',
    category:    item.category    || 'other',
    impact:      item.impact      || '',
    steps:       Array.isArray(item.steps) ? item.steps : [],
    ai_prompt:   item.ai_prompt   || '',
    ai_platform: item.ai_platform || 'ChatGPT'
  }));

  // ── 6. Save to Supabase ──
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/meetings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        user_id:      user.id,
        meeting_name: safeName,
        source:       'text',
        summary:      parsed.summary,
        action_items: parsed.action_items
      })
    });
  } catch (err) {
    console.error('DB save error:', err.message);
    // Don't block response if save fails
  }

  return res.status(200).json(parsed);
}
