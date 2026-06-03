import {
  buildRecentSearchUrl,
  searchRecentPosts,
  summarizeRecentSearch,
} from '../adapters/x-api.mjs';

export const signalProviders = {
  x: {
    name: 'x',
    dryRun({query, maxResults}) {
      return {url: buildRecentSearchUrl({query, maxResults})};
    },
    async retrieve({query, maxResults}, env = process.env) {
      const result = await searchRecentPosts({query, maxResults}, env);
      return summarizeRecentSearch(result, query);
    },
  },
};

export function providerForSignal(name) {
  const provider = signalProviders[name];
  if (!provider) {
    throw new Error(`Unsupported signal provider: ${name}`);
  }

  return provider;
}
