import {setTimeout as delay} from 'node:timers/promises';

const X_API_BASE = 'https://api.x.com/2';

const DEFAULT_X_TIMEOUT_MS = 20_000;
const RETRYABLE_X_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function requireXEnv(env = process.env) {
  if (!env.X_BEARER_TOKEN) {
    throw new Error('Missing required env var: X_BEARER_TOKEN');
  }

  return {bearerToken: env.X_BEARER_TOKEN};
}

export function buildRecentSearchParams({
  query,
  maxResults = 25,
  nextToken,
} = {}) {
  if (!query || !String(query).trim()) {
    throw new Error('X recent search query is required');
  }

  const params = new URLSearchParams({
    query: String(query).trim(),
    'tweet.fields': 'author_id,created_at,public_metrics,lang',
    expansions: 'author_id',
    'user.fields': 'username,name,verified',
    max_results: String(Math.max(10, Math.min(Number(maxResults) || 25, 100))),
  });

  if (nextToken) params.set('next_token', nextToken);

  return params;
}

export function buildRecentSearchUrl(input) {
  return `${X_API_BASE}/tweets/search/recent?${buildRecentSearchParams(input)}`;
}

export function buildListPostsParams({
  maxResults = 30,
  paginationToken,
} = {}) {
  const params = new URLSearchParams({
    'tweet.fields':
      'author_id,created_at,public_metrics,lang,attachments,referenced_tweets',
    expansions: 'author_id,attachments.media_keys',
    'user.fields': 'username,name,verified',
    'media.fields': 'type,url,preview_image_url,alt_text',
    max_results: String(Math.max(1, Math.min(Number(maxResults) || 30, 100))),
  });

  if (paginationToken) params.set('pagination_token', paginationToken);
  return params;
}

export function buildListPostsUrl({listId, ...options} = {}) {
  if (!listId || !/^\d+$/.test(String(listId))) {
    throw new Error('A numeric X list ID is required');
  }

  return `${X_API_BASE}/lists/${encodeURIComponent(String(listId))}/tweets?${buildListPostsParams(options)}`;
}

export async function searchRecentPosts(input, env = process.env) {
  const {bearerToken} = requireXEnv(env);
  const response = await fetch(buildRecentSearchUrl(input), {
    headers: {Authorization: `Bearer ${bearerToken}`},
  });

  if (!response.ok) {
    throw new Error(
      `X recent search failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json();
}

export async function getListPosts(input, env = process.env) {
  const {bearerToken} = requireXEnv(env);
  const timeoutMs = positiveInteger(env.X_API_TIMEOUT_MS, DEFAULT_X_TIMEOUT_MS);
  const maxRetries = nonNegativeInteger(env.X_API_MAX_RETRIES, 2);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(buildListPostsUrl(input), {
        signal: controller.signal,
        headers: {Authorization: `Bearer ${bearerToken}`},
      });

      if (response.ok) return response.json();

      const detail = await response.text();
      if (RETRYABLE_X_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        await delay(xRetryDelayMs(response, attempt, env));
        continue;
      }
      throw new Error(
        `X list posts failed (${response.status}): ${detail.slice(0, 500)}`,
      );
    } catch (error) {
      if (
        (error?.name === 'AbortError' || error instanceof TypeError) &&
        attempt < maxRetries
      ) {
        await delay(xRetryDelayMs(null, attempt, env));
        continue;
      }
      if (error?.name === 'AbortError') {
        throw new Error(`X list posts timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('X list posts exhausted retries');
}

export function summarizeRecentSearch(result, query) {
  const usersById = new Map(
    (result.includes?.users || []).map((user) => [user.id, user]),
  );

  return (result.data || []).map((post) => {
    const user = usersById.get(post.author_id);
    const username = user?.username || 'unknown';

    return {
      id: post.id,
      url: `https://x.com/${username}/status/${post.id}`,
      authorUsername: username,
      authorVerified: Boolean(user?.verified),
      createdAt: post.created_at || null,
      lang: post.lang || null,
      metrics: {
        replies: post.public_metrics?.reply_count || 0,
        reposts: post.public_metrics?.retweet_count || 0,
        likes: post.public_metrics?.like_count || 0,
        quotes: post.public_metrics?.quote_count || 0,
      },
      matchedQuery: query,
    };
  });
}

export function summarizeListPosts(result, listId) {
  const usersById = new Map(
    (result.includes?.users || []).map((user) => [String(user.id), user]),
  );

  return (result.data || [])
    .map((post) => {
      const user = usersById.get(String(post.author_id));
      const username = user?.username || null;
      return {
        id: String(post.id),
        text: sanitizePostText(post.text),
        authorId: String(post.author_id || 'unknown'),
        authorUsername: username,
        authorVerified: Boolean(user?.verified),
        createdAt: post.created_at || null,
        lang: post.lang || null,
        url: username ? `https://x.com/${username}/status/${post.id}` : null,
        metrics: {
          replies: post.public_metrics?.reply_count || 0,
          reposts: post.public_metrics?.retweet_count || 0,
          likes: post.public_metrics?.like_count || 0,
          quotes: post.public_metrics?.quote_count || 0,
        },
        source: {provider: 'x', listId: String(listId)},
      };
    })
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
    );
}

function sanitizePostText(value) {
  return String(value || '')
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, 4_000);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function xRetryDelayMs(response, attempt, env) {
  const retryAfterSeconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(30_000, retryAfterSeconds * 1_000);
  }
  const baseMs = positiveInteger(env.X_API_RETRY_BASE_MS, 1_000);
  const exponential = Math.min(30_000, baseMs * 2 ** attempt);
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}
