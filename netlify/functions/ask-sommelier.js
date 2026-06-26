exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { question, prefs } = body;
  if (!question) return { statusCode: 400, headers, body: JSON.stringify({ error: 'question required' }) };

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ answer: 'API key not configured in Netlify environment variables.' }) };
  if (!apiKey.startsWith('sk-ant-')) return { statusCode: 200, headers, body: JSON.stringify({ answer: `Key format wrong — starts with: ${apiKey.slice(0, 10)}` }) };

  const sys = [
    'You are the TOPS Cellar Selection Club Sommelier — elegant, knowledgeable, warm.',
    'Voice: confident, approachable. South African English. Rand prices as "R89.99".',
    'Keep answers concise: 2–4 sentences. Recommend specific wines or styles with brief reasoning.',
    prefs ? `This member's preferences: ${prefs}.` : '',
  ].filter(Boolean).join('\n');

  let res, data;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: sys,
        messages: [{ role: 'user', content: question }],
      }),
    });
    data = await res.json();
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ answer: `Network error calling Anthropic: ${e.message}` }) };
  }

  if (data.type === 'error') {
    return { statusCode: 200, headers, body: JSON.stringify({ answer: `Anthropic error: ${data.error?.message || JSON.stringify(data.error)}` }) };
  }

  const answer = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { statusCode: 200, headers, body: JSON.stringify({ answer: answer || 'No response from Anthropic.' }) };
};
