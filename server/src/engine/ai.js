const fail = (msg) => Object.assign(new Error(`AI request failed: ${msg}`), { status: 502 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RETRYABLE = /high demand|try again|unavailable|resource.?exhausted|overloaded|rate.?limit|timeout|aborted|429|503|500/i;
const SKIP = /no longer available|not found|not supported|exceeded your current quota|quota exceeded|free.?tier|per day|insufficient.?quota|credit|billing|invalid.?api.?key|incorrect api key|authentication/i;
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS) || 90000;

function parseJson(text) {
  if (!text) throw fail('empty response');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw fail('response is not valid JSON');
  }
}

function classifyHttp(status, msg) {
  const err = fail(msg);
  err.skipProvider = SKIP.test(msg) || status === 401 || status === 403;
  err.retryable = !err.skipProvider && (RETRYABLE.test(msg) || status === 429 || status >= 500);
  return err;
}

async function geminiOnce(model, { system, prompt, schema }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(fail('GEMINI_API_KEY is not set'), { skipProvider: true });

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
  if (!res.ok) throw classifyHttp(res.status, body.error?.message || `HTTP ${res.status}`);
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return { ...parseJson(text), _engine: `gemini:${model}` };
}

async function openaiOnce(model, { system, prompt, schema }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(fail('OPENAI_API_KEY is not set'), { skipProvider: true });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${system}\n\nRespond with a single JSON object matching this schema:\n${JSON.stringify(schema)}` },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    const err = fail(e.message);
    err.retryable = RETRYABLE.test(e.message || '');
    throw err;
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw classifyHttp(res.status, body.error?.message || `HTTP ${res.status}`);
  return { ...parseJson(body.choices?.[0]?.message?.content), _engine: `openai:${model}` };
}

async function claudeOnce(model, { system, prompt, schema }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(fail('ANTHROPIC_API_KEY is not set'), { skipProvider: true });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: `${system}\n\nRespond with a single JSON object matching this schema:\n${JSON.stringify(schema)}`,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    const err = fail(e.message);
    err.retryable = RETRYABLE.test(e.message || '');
    throw err;
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw classifyHttp(res.status, body.error?.message || `HTTP ${res.status}`);
  const text = (body.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('');
  return { ...parseJson(text), _engine: `claude:${model}` };
}

function providerChain() {
  const order = (process.env.AI_PROVIDERS || 'gemini,openai,claude')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const map = {
    gemini: {
      models: [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...(process.env.GEMINI_FALLBACKS || '').split(',').map((m) => m.trim()).filter(Boolean)])],
      call: geminiOnce,
      enabled: !!process.env.GEMINI_API_KEY,
    },
    openai: {
      models: [...new Set([process.env.OPENAI_MODEL || 'gpt-4o-mini', ...(process.env.OPENAI_FALLBACKS || '').split(',').map((m) => m.trim()).filter(Boolean)])],
      call: openaiOnce,
      enabled: !!process.env.OPENAI_API_KEY,
    },
    claude: {
      models: [...new Set([process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', ...(process.env.ANTHROPIC_FALLBACKS || '').split(',').map((m) => m.trim()).filter(Boolean)])],
      call: claudeOnce,
      enabled: !!process.env.ANTHROPIC_API_KEY,
    },
  };

  return order.filter((name) => map[name]?.enabled).map((name) => ({ name, ...map[name] }));
}

/** Try Gemini → OpenAI → Claude (configurable). Throws if all configured providers fail. */
export async function askAI({ system, prompt, schema }) {
  const chain = providerChain();
  if (!chain.length) throw fail('No AI providers configured (set GEMINI_API_KEY, OPENAI_API_KEY, and/or ANTHROPIC_API_KEY)');

  const attempts = Number(process.env.AI_RETRIES || process.env.GEMINI_RETRIES) || 2;
  let last;

  for (const provider of chain) {
    for (const model of provider.models) {
      for (let i = 0; i < attempts; i++) {
        try {
          return await provider.call(model, { system, prompt, schema });
        } catch (e) {
          last = e;
          if (e.skipProvider) break; // next model / provider
          if (!e.retryable) break;
          await sleep(800 * 2 ** i);
        }
      }
      if (last?.skipProvider && /api.?key|authentication|credit|billing/i.test(last.message)) break; // next provider
    }
  }
  throw last || fail('all AI providers failed');
}

/** @deprecated use askAI */
export const askGemini = askAI;
