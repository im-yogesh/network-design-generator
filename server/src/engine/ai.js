const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const fail = (msg) => Object.assign(new Error(`AI request failed: ${msg}`), { status: 502 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RETRYABLE = /high demand|try again|unavailable|resource.?exhausted|overloaded|rate.?limit|quota|timeout|aborted|429|503|500/i;
const SKIP_MODEL = /no longer available|not found|is not supported|not supported for/i;
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 120000;

function models() {
  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallbacks = (process.env.GEMINI_FALLBACKS || 'gemini-3-flash,gemini-flash-latest')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

async function callOnce(key, model, { system, prompt, schema }) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    const err = fail(e.message);
    err.retryable = RETRYABLE.test(e.message || '');
    throw err;
  });

  const body = await res.json().catch(() => ({}));
  const msg = body.error?.message || `HTTP ${res.status}`;
  if (!res.ok) {
    const err = fail(msg);
    err.skipModel = SKIP_MODEL.test(msg);
    err.retryable = !err.skipModel && (RETRYABLE.test(msg) || res.status === 429 || res.status >= 500);
    throw err;
  }
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw fail(`empty response (${candidate?.finishReason || body.promptFeedback?.blockReason || 'unknown'})`);
  try {
    return JSON.parse(text);
  } catch {
    throw fail('response is not valid JSON');
  }
}

// Calls Gemini in JSON mode; retries + falls back to other models on overload.
export async function askGemini({ system, prompt, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw fail('GEMINI_API_KEY is not set');

  const list = models();
  const attempts = Number(process.env.GEMINI_RETRIES) || 3;
  let last;

  for (const model of list) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await callOnce(key, model, { system, prompt, schema });
      } catch (e) {
        last = e;
        if (e.skipModel) break; // try next model
        if (!e.retryable) throw e;
        await sleep(1000 * 2 ** i);
      }
    }
  }
  throw last || fail('all models failed');
}
