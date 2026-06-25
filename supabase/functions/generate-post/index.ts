// supabase/functions/generate-post/index.ts
// The "Generate post" button. Reads the manager's photo + rough line and returns
// polished, on-brand copy. GUARDRAIL: it never invents a price.
//
// Secret to set:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Body: { postType: string, photoBase64?: string, photoMediaType?: string, rawText?: string }
// Returns: { headline, subhead, body, price, price_found }
//
// NOTE: image cleanup (cutout + branded template) is a SEPARATE step done client-side
// or via an image service — this function produces the words only. Do NOT ask the model
// to re-render the product.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-sonnet-4-6'; // vision-capable; swap to haiku for lower cost if quality allows

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { postType = 'Member Special', photoBase64, photoMediaType = 'image/jpeg', rawText = '' } =
      await req.json();

    const sys = [
      'You write short, premium, on-brand copy for the TOPS Cellar Selection Club, a luxury wine-magazine-style members club in South Africa.',
      'Voice: elegant, warm, confident, never salesy or shouty. South African English. Rand prices as "R89.99".',
      'CRITICAL RULES:',
      '- NEVER invent or guess a price. Use only a price the manager typed or one clearly legible in the photo.',
      '- If no price is available, set price to null and price_found to false.',
      '- No health claims. Age-appropriate (18+ liquor).',
      'Return STRICT JSON only, no markdown, no preamble, with keys: headline, subhead, body, price, price_found.',
      'headline: 2-4 words. subhead: a short kicker like "This weekend only". body: 1-2 sentences. price: string like "R89.99" or null.',
    ].join('\n');

    const content: any[] = [];
    if (photoBase64) {
      content.push({ type: 'image', source: { type: 'base64', media_type: photoMediaType, data: photoBase64 } });
    }
    content.push({
      type: 'text',
      text: `Post type: ${postType}\nManager note (may be blank or rough): "${rawText}"\nWrite the post.`,
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: sys,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await res.json();
    const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { headline: '', subhead: '', body: clean, price: null, price_found: false }; }

    return json(parsed);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
