const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const fail = (msg) => Object.assign(new Error(`AI request failed: ${msg}`), { status: 502 });

// Calls Gemini in JSON mode and returns the parsed object matching `schema`.
export async function askGemini({ system, prompt, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw fail('GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
    }),
    signal: AbortSignal.timeout(60000),
  }).catch((e) => {
    throw fail(e.message);
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(body.error?.message || `HTTP ${res.status}`);
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw fail(`empty response (${candidate?.finishReason || body.promptFeedback?.blockReason || 'unknown'})`);
  try {
    return JSON.parse(text);
  } catch {
    throw fail('response is not valid JSON');
  }
}
