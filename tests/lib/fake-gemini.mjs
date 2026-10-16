// A stand-in for the Google Gemini API (generateContent), for suites that test the Resume Builder's AI assistant
// without a real key or network. The backend reaches it through GEMINI_BASE_URL (see backend/services/aiProvider.js).
//   const ai = await startFakeGemini(port);  ai.env → backend variables;  ai.requests → what was sent
//   ai.mode = 'ok' | 'blocked' | 'safety' | 'quota-minute' | 'quota-day' | 'unauthorized' | 'not-found' | 'error' | 'garbage'
//   ai.answers[task] → the JSON to return
import http from 'node:http';

/** Which assistant task a request is, from the answer shape it asks for. */
function taskOf(body) {
  const properties = Object.keys(body?.generationConfig?.responseJsonSchema?.properties ?? {});
  if (properties.includes('bullets')) return 'bullets';
  if (properties.includes('keywords')) return 'keywords';
  if (properties.includes('suggestions')) return 'review';
  return /Correct the grammar/.test(body?.contents?.[0]?.parts?.[0]?.text ?? '') ? 'grammar' : 'summary';
}

// Real Gemini quota errors name the quota that ran out (per minute or per day) in their details.
const quotaBody = (quotaId) => ({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' },
    ],
  },
});

export async function startFakeGemini(port) {
  const state = {
    mode: 'ok',
    requests: [],
    answers: {
      summary: { suggestion: 'Final-year Computer Science student who builds web apps with React and Node.js.', notes: ['Shortened and made it role-focused.'] },
      grammar: { suggestion: 'Built a campus bus tracker that shows live shuttle locations.', notes: ['Fixed tense.'] },
      bullets: { bullets: ['Built a live bus tracker with React and Node.js.', 'Stored GPS pings from the driver phone in MongoDB.'], notes: ['Split into two points.'] },
      keywords: { keywords: [{ term: 'React', inResume: true, evidence: 'Skills' }, { term: 'Docker', inResume: false, evidence: '' }], suggestions: ['Mention React in your project description, where you used it.'] },
      review: { suggestions: [{ section: 'Projects', issue: 'The second project has no description.', suggestion: 'Add two bullet points about what you built.' }] },
    },
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        /* not JSON */
      }
      const model = /\/models\/([^/:?]+):generateContent/.exec(req.url)?.[1] ?? null;
      const task = taskOf(body);
      state.requests.push({ method: req.method, url: req.url, headers: req.headers, body, task, model });
      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (!model || req.method !== 'POST') return send(404, { error: { code: 404, message: 'Not found', status: 'NOT_FOUND' } });
      switch (state.mode) {
        case 'unauthorized':
          return send(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } });
        case 'not-found':
          return send(404, { error: { code: 404, message: `models/${model} is not found for API version v1beta`, status: 'NOT_FOUND' } });
        case 'quota-minute':
          return send(429, quotaBody('GenerateRequestsPerMinutePerProjectPerModel-FreeTier'));
        case 'quota-day':
          return send(429, quotaBody('GenerateRequestsPerDayPerProjectPerModel-FreeTier'));
        case 'error':
          return send(500, { error: { code: 500, message: 'An internal error has occurred.', status: 'INTERNAL' } });
        case 'blocked':
          return send(200, { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 50 } });
        default:
          break;
      }
      const candidate = (text, finishReason) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason, index: 0 }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }, modelVersion: model });
      if (state.mode === 'safety') return send(200, candidate('', 'SAFETY'));
      if (state.mode === 'garbage') return send(200, candidate('not json at all', 'STOP'));
      return send(200, candidate(JSON.stringify(state.answers[task]), 'STOP'));
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return Object.assign(state, {
    url: `http://127.0.0.1:${port}`,
    // No RESUME_AI_MODEL: the suite checks the backend's default model.
    env: { GEMINI_API_KEY: 'test-gemini-key-not-real-0123456789', GEMINI_BASE_URL: `http://127.0.0.1:${port}` },
    stop: () => new Promise((resolve) => server.close(resolve)),
  });
}
