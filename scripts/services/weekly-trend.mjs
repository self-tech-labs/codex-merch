import {readFile} from 'node:fs/promises';
import {
  createStructuredResponse,
  DEFAULT_OPENAI_TEXT_MODEL,
} from '../adapters/openai-responses.mjs';
import {validateWeeklyOutput, weeklySchema} from './weekly-schemas.mjs';

const trendPromptUrl = new URL('../prompts/weekly-trend.md', import.meta.url);
const protectedProductTerms =
  /\b(?:openai|chatgpt|gpt(?:[- ]?\d+(?:\.\d+)?)?|codex|sora|supreme|nike|adidas)\b|https?:\/\/|@[a-z0-9_]+/i;

export async function analyzeWeeklyTrend({
  posts,
  listId,
  runKey,
  model = process.env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_TEXT_MODEL,
  reasoningEffort = process.env.OPENAI_TREND_REASONING_EFFORT || 'medium',
  modelOutput,
  env = process.env,
} = {}) {
  const normalizedPosts = normalizeSignalPosts(posts).slice(0, 30);
  if (!normalizedPosts.length) throw new Error('Trend analysis requires posts');

  if (modelOutput) {
    return {
      output: validateWeeklyOutput('trend', modelOutput),
      response: {responseId: 'offline-fixture', model: 'offline-fixture', usage: null},
    };
  }

  const instructions = await readFile(trendPromptUrl, 'utf8');
  const response = await createStructuredResponse(
    {
      model,
      reasoningEffort,
      schema: weeklySchema('trend'),
      schemaName: 'weekly_trend_decision',
      instructions,
      metadata: {pipeline: 'weekly-merch-v1', run_key: runKey || 'manual'},
      input: JSON.stringify({
        source: {provider: 'x', kind: 'list_posts', listId: String(listId)},
        records: normalizedPosts.map((post) => ({
          id: post.id,
          authorKey: post.authorId,
          createdAt: post.createdAt,
          text: post.text,
          engagement: post.metrics,
        })),
      }),
    },
    env,
  );

  return {
    output: validateWeeklyOutput('trend', response.value),
    response: responseMetadata(response),
  };
}

export function evaluateTrendCandidate(
  output,
  posts,
  {pastFingerprints = [], minimumScore = 72} = {},
) {
  const normalizedPosts = normalizeSignalPosts(posts);
  const postsById = new Map(normalizedPosts.map((post) => [post.id, post]));
  const evidencePostIds = [
    ...new Set((output.evidencePostIds || []).map(String)),
  ].filter((id) => postsById.has(id));
  const evidence = evidencePostIds.map((id) => postsById.get(id));
  const authorCount = new Set(evidence.map((post) => post.authorId)).size;
  const fingerprint = normalizeTerms(output.fingerprintTerms);
  const noveltySimilarity = pastFingerprints.reduce(
    (maximum, prior) => Math.max(maximum, jaccard(fingerprint, normalizeTerms(prior))),
    0,
  );
  const sourceTexts = normalizedPosts.map((post) => normalizePhrase(post.text));
  const safeOriginalPhrases = [
    ...new Map(
      (output.originalPhrases || [])
        .map((phrase) => String(phrase).trim())
        .filter(Boolean)
        .filter((phrase) => !protectedProductTerms.test(phrase))
        .filter((phrase) => {
          const normalized = normalizePhrase(phrase);
          return (
            normalized.length >= 6 &&
            !sourceTexts.some((source) => source.includes(normalized))
          );
        })
        .map((phrase) => [normalizePhrase(phrase), phrase]),
    ).values(),
  ];

  const components = {
    recurrence: Math.min(25, evidence.length * 5),
    crossAuthor: Math.min(20, authorCount * 6),
    codexSpecificity: clampInteger(output.modelScores?.codexSpecificity, 0, 20),
    merchability: Math.round(
      clampInteger(output.modelScores?.merchability, 0, 20) * 0.75,
    ),
    novelty: Math.round(
      clampInteger(output.modelScores?.novelty, 0, 20) *
        0.5 *
        (1 - noveltySimilarity),
    ),
    rightsSafety: clampInteger(output.modelScores?.rightsSafety, 0, 10),
  };
  const score = Object.values(components).reduce((total, value) => total + value, 0);
  const checks = {
    modelFoundTrend: output.status === 'trend',
    enoughInputPosts: normalizedPosts.length >= 4,
    enoughEvidencePosts: evidence.length >= 4,
    enoughAuthors: authorCount >= 3,
    lowRightsRisk: output.rightsRisk === 'low',
    safeOriginalLanguage: safeOriginalPhrases.length >= 2,
    meaningfulFingerprint: fingerprint.length >= 3,
    novelEnough: noveltySimilarity < 0.75,
    scoreReached: score >= minimumScore,
  };
  const publishEligible = Object.values(checks).every(Boolean);

  return {
    status: publishEligible ? 'trend' : 'no_trend',
    publishEligible,
    score,
    minimumScore,
    components,
    checks,
    evidencePostIds,
    evidenceAuthorCount: authorCount,
    safeOriginalPhrases,
    fingerprint,
    noveltySimilarity: Number(noveltySimilarity.toFixed(3)),
    reason: publishEligible
      ? 'Trend passed deterministic recurrence, author-spread, novelty, rights, and score gates.'
      : `Trend stopped safely: ${Object.entries(checks)
          .filter(([, passed]) => !passed)
          .map(([name]) => name)
          .join(', ')}.`,
  };
}

export function normalizeSignalPosts(posts) {
  if (!Array.isArray(posts)) throw new Error('Signal posts must be an array');
  return posts
    .map((post) => ({
      id: String(post?.id || '').trim(),
      text: String(post?.text || '')
        .replaceAll('\u0000', '')
        .replace(/\r\n?/g, '\n')
        .trim()
        .slice(0, 4_000),
      authorId: String(post?.authorId || post?.author_id || 'unknown'),
      authorUsername: post?.authorUsername ? String(post.authorUsername) : null,
      authorVerified: Boolean(post?.authorVerified),
      createdAt: post?.createdAt || post?.created_at || null,
      lang: post?.lang || null,
      url: post?.url || null,
      metrics: {
        replies: metric(post, 'replies', 'reply_count'),
        reposts: metric(post, 'reposts', 'retweet_count'),
        likes: metric(post, 'likes', 'like_count'),
        quotes: metric(post, 'quotes', 'quote_count'),
      },
      source: post?.source || null,
    }))
    .filter((post) => post.id && post.text);
}

function metric(post, normalized, xName) {
  const value = Number(post?.metrics?.[normalized] ?? post?.public_metrics?.[xName] ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function normalizeTerms(value) {
  const terms = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      terms
        .flatMap((term) => String(term).toLowerCase().split(/[^a-z0-9]+/))
        .filter((term) => term.length > 2),
    ),
  ].sort();
}

function normalizePhrase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / (a.size + b.size - intersection);
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function responseMetadata(response) {
  return {
    responseId: response.responseId,
    model: response.model,
    usage: response.usage,
  };
}
