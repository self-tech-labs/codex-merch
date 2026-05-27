const X_API_BASE = 'https://api.x.com/2';

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
