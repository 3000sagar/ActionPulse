export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'Server misconfigured' });

  try {
    // Parse multipart form data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const bodyStr = buffer.toString();

    // Extract boundary from content-type
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return res.status(400).json({ error: 'Invalid form data' });

    const boundary = boundaryMatch[1];
    const parts = bodyStr.split('--' + boundary);

    let audioBase64 = '';
    let audioMime   = 'audio/webm';
    let meetingName = '';
    let attendees   = '';

    for (const part of parts) {
      if (part.includes('name="audio"')) {
        const headerEnd = part.indexOf('\r\n\r\n');
        const header    = part.substring(0, headerEnd);
        const mimeMatch = header.match(/Content-Type:\s*([^\r\n]+)/);
        if (mimeMatch) audioMime = mimeMatch[1].trim();
        const raw = buffer.slice(
          buffer.indexOf('\r\n\r\n', buffer.indexOf('name="audio"')) + 4
        );
        // Find end boundary
        const endIdx = raw.indexOf('--' + boundary);
        const audioBuffer = endIdx > 0 ? raw.slice(0, endIdx - 2) : raw;
        audioBase64 = audioBuffer.toString('base64');
      }
      if (part.includes('name="meetingName"')) {
        const val = part.split('\r\n\r\n')[1];
        meetingName = val ? val.replace(/\r\n--.*$/s, '').trim() : '';
      }
      if (part.includes('name="attendees"')) {
        const val = part.split('\r\n\r\n')[1];
        attendees = val ? val.replace(/\r\n--.*$/s, '').trim() : '';
      }
    }

    if (!audioBase64) return res.status(400).json({ error: 'No audio data received' });

    const context = [
      meetingName ? `Meeting: ${meetingName}` : '',
      attendees   ? `Attendees: ${attendees}` : ''
    ].filter(Boolean).join('\n');

    // Gemini 2.0 Flash supports audio natively
    const prompt = `You are an expert meeting assistant. 
${context ? context + '\n\n' : ''}
Listen to this audio recording of a meeting. Do TWO things:
1. Transcribe the audio into clean text
2. Extract all action items from it

Return ONLY this exact JSON:
{
  "transcript": "Full clean transcription of the audio",
  "summary": "2-3 sentence meeting summary",
  "action_items": [
    {
      "task": "Clear actionable task starting with a verb",
      "owner": "Person responsible or Unassigned",
      "deadline": "When it's due or Not specified",
      "priority": "high | medium | low",
      "ai_prompt": "A ready-to-use prompt that the user can copy and paste into an AI to accomplish this exact task. Provide full context from the meeting.",
      "ai_platform": "The best AI platform for this specific task (e.g., 'Claude', 'ChatGPT', 'Perplexity')"
    }
  ]
}

Return ONLY the JSON. No markdown, no backticks.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: audioMime, data: audioBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
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
    console.error('Transcribe error:', e.message);
    return res.status(500).json({ error: 'Transcription failed: ' + e.message });
  }
}
