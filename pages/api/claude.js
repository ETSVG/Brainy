export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const messages = (req.body.messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: "You are a professional trading analyst. ALWAYS respond with valid JSON only. No text outside the JSON object. Start with { end with }.",
        messages,
      }),
    });

    const data = await r.json();

    // Extract JSON from response text
    if (data.content && data.content[0] && data.content[0].text) {
      let text = data.content[0].text.replace(/```json|```/g, '').trim();
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        data.content[0].text = text.substring(start, end + 1);
      }
    }

    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
