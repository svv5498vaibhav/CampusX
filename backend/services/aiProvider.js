import { ApiError as GeminiApiError, FinishReason, GoogleGenAI } from '@google/genai';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/*
 * The server-side AI provider behind optional assistant features (today: the Resume Builder): Google Gemini
 * through the official `@google/genai` SDK. One small interface, so the provider can change here without
 * touching the features:
 *
 *   getAiProvider() → null when no provider is configured, else
 *     { name, model, generateJson({ system, prompt, schema, maxTokens }) → parsed JSON object }
 *
 * The API key lives only in the backend environment (GEMINI_API_KEY, read by config/env.js) and is never sent
 * to the browser. Prompts, answers and the key are never logged; failures are logged by status only.
 */

let cached;

const unavailable = (message) => ApiError.serviceUnavailable(message);
const MISCONFIGURED = 'The AI assistant isn’t available right now (it isn’t set up correctly on this server).';

// Gemini stops for these when an answer would break its safety or recitation rules.
const DECLINED = new Set([FinishReason.SAFETY, FinishReason.RECITATION, FinishReason.BLOCKLIST, FinishReason.PROHIBITED_CONTENT, FinishReason.SPII, FinishReason.IMAGE_SAFETY].filter(Boolean));

/**
 * A quota error (HTTP 429 RESOURCE_EXHAUSTED: the free tier's per-minute or per-day request or token limits)
 * as a message students can act on. The error body names the quota that ran out.
 */
function quotaError(error) {
  const details = String(error?.message ?? '');
  const daily = /per ?day|PerDay|daily/i.test(details);
  return new ApiError(
    429,
    daily
      ? 'The AI assistant has used up today’s free Gemini quota on this server. Please try again tomorrow; everything else in the Resume Builder still works.'
      : 'The AI assistant has reached its free Gemini usage limit for the moment. Please wait a minute and try again.',
  );
}

/** Maps a failed request to an error the student can understand; never passes provider details through. */
function translateError(error) {
  const status = error instanceof GeminiApiError ? error.status : null;
  const details = String(error?.message ?? '');
  logger.warn('AI provider request failed', { provider: 'gemini', status, type: error?.name ?? 'Error' });
  if (status === 429) return quotaError(error);
  if (status === 401 || status === 403 || (status === 400 && /API key|API_KEY_INVALID|PERMISSION_DENIED/i.test(details))) return unavailable(MISCONFIGURED);
  if (status === 400 && /location is not supported|FAILED_PRECONDITION/i.test(details)) return unavailable('The AI assistant isn’t available from this server’s region.');
  if (status === 404) return unavailable('The AI model set up on this server isn’t available. Ask the administrator to check RESUME_AI_MODEL.');
  if (status >= 500) return unavailable('The AI assistant is busy right now. Please try again in a minute.');
  if (status === null) return unavailable('The AI assistant couldn’t be reached. Please try again shortly.');
  return unavailable('The AI assistant couldn’t answer this time. Please try again.');
}

function geminiProvider({ apiKey, model, baseUrl }) {
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(baseUrl && { baseUrl }),
      timeout: 45_000,
      // One retry for a passing server error. Never for 429: retrying a used-up quota only burns more of it.
      retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 4, httpStatusCodes: [500, 502, 503, 504] },
    },
  });
  return {
    name: 'gemini',
    model,
    async generateJson({ system, prompt, schema, maxTokens = 8192 }) {
      let response;
      try {
        response = await client.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: system,
            // Answers come back as JSON that follows the task's schema.
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            maxOutputTokens: maxTokens,
          },
        });
      } catch (error) {
        throw translateError(error);
      }
      const finish = response.candidates?.[0]?.finishReason;
      if (response.promptFeedback?.blockReason || DECLINED.has(finish)) {
        throw ApiError.unprocessable('The AI assistant couldn’t help with this text. You can still edit it yourself.');
      }
      if (finish === FinishReason.MAX_TOKENS) throw unavailable('The AI assistant’s answer was too long. Try a shorter piece of text.');
      try {
        return JSON.parse(response.text ?? '');
      } catch {
        logger.warn('AI provider returned an unreadable answer', { provider: 'gemini', finishReason: finish ?? null });
        throw unavailable('The AI assistant’s answer couldn’t be read. Please try again.');
      }
    },
  };
}

/** The configured provider, or null (AI features then report themselves unavailable). */
export function getAiProvider() {
  if (cached !== undefined) return cached;
  const config = env.resumeAi;
  cached = config.enabled && config.apiKey ? geminiProvider(config) : null;
  return cached;
}
