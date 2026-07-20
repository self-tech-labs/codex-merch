import {setTimeout as delay} from 'node:timers/promises';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_OPENAI_TEXT_MODEL = 'gpt-5.6';
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

export function requireOpenAIResponsesEnv(env = process.env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing required env var: OPENAI_API_KEY');
  }

  return {apiKey: env.OPENAI_API_KEY};
}

export function requireGpt56TextModel(model) {
  const selected = String(model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  if (selected !== DEFAULT_OPENAI_TEXT_MODEL) {
    throw new Error(
      `Weekly merch requires ${DEFAULT_OPENAI_TEXT_MODEL}; refusing model override ${selected || '(empty)'}`,
    );
  }
  return selected;
}

export function buildStructuredResponseRequest({
  instructions,
  input,
  schema,
  schemaName,
  model = DEFAULT_OPENAI_TEXT_MODEL,
  reasoningEffort = 'medium',
  maxOutputTokens = 12_000,
  metadata = {},
} = {}) {
  const requiredModel = requireGpt56TextModel(model);
  if (!instructions || !String(instructions).trim()) {
    throw new Error('Structured response instructions are required');
  }
  if (input == null || input === '') {
    throw new Error('Structured response input is required');
  }
  if (!schema || schema.type !== 'object') {
    throw new Error('Structured response JSON Schema must have an object root');
  }
  if (!schemaName || !/^[A-Za-z0-9_-]{1,64}$/.test(schemaName)) {
    throw new Error('A short alphanumeric structured response schema name is required');
  }

  return {
    model: requiredModel,
    instructions: String(instructions).trim(),
    input,
    reasoning: {effort: reasoningEffort},
    max_output_tokens: maxOutputTokens,
    store: false,
    metadata: Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [key, String(value).slice(0, 512)]),
    ),
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema,
      },
    },
  };
}

export async function createStructuredResponse(input, env = process.env) {
  const {apiKey} = requireOpenAIResponsesEnv(env);
  const request = buildStructuredResponseRequest(input);
  const timeoutMs = positiveInteger(env.OPENAI_RESPONSES_TIMEOUT_MS, 180_000);
  const maxRetries = nonNegativeInteger(env.OPENAI_RESPONSES_MAX_RETRIES, 2);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        return parseStructuredResponse(await response.json());
      }

      const detail = (await response.text()).slice(0, 1_000);
      if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        await delay(retryDelayMs(response, attempt, env));
        continue;
      }

      throw new Error(`OpenAI Responses API failed (${response.status}): ${detail}`);
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (attempt < maxRetries) {
          await delay(retryDelayMs(null, attempt, env));
          continue;
        }
        throw new Error(`OpenAI Responses API timed out after ${timeoutMs}ms`);
      }
      if (isNetworkError(error) && attempt < maxRetries) {
        await delay(retryDelayMs(null, attempt, env));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('OpenAI Responses API exhausted retries');
}

export function parseStructuredResponse(response) {
  if (response?.status !== 'completed') {
    const reason = response?.error?.message || response?.incomplete_details?.reason;
    throw new Error(`OpenAI response was not completed${reason ? `: ${reason}` : ''}`);
  }

  const text = [];
  for (const output of response.output || []) {
    if (output.type !== 'message') continue;
    for (const content of output.content || []) {
      if (content.type === 'refusal') {
        throw new Error(`OpenAI response refused the request: ${content.refusal}`);
      }
      if (content.type === 'output_text' && content.text) text.push(content.text);
    }
  }

  if (!text.length) {
    throw new Error('OpenAI response did not contain structured output text');
  }

  let value;
  try {
    value = JSON.parse(text.join(''));
  } catch (error) {
    throw new Error(`OpenAI structured output was not valid JSON: ${error.message}`);
  }

  return {
    value,
    responseId: response.id || null,
    model: response.model || null,
    usage: response.usage || null,
  };
}

function retryDelayMs(response, attempt, env) {
  const retryAfterSeconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(30_000, retryAfterSeconds * 1_000);
  }
  const baseMs = positiveInteger(env.OPENAI_RESPONSES_RETRY_BASE_MS, 1_000);
  const exponential = Math.min(30_000, baseMs * 2 ** attempt);
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'].includes(
      error?.cause?.code,
    )
  );
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}
