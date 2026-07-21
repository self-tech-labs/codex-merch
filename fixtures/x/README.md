# Synthetic X list fixtures

These fixtures are entirely synthetic test data. No post text, handle, identity,
metric, or URL was copied from X or attributed to a real person.

- `codex-team-meme-30.synthetic.json` contains exactly 30 normalized posts. A
  fictional "merge queue weather" joke recurs across multiple synthetic
  authors, alongside unrelated engineering distractors.
- `no-trend-30.synthetic.json` contains exactly 30 intentionally heterogeneous
  posts with no recurring meme suitable for a merch decision.

Each file uses the normalized weekly-pipeline shape: `id`, `text`, `authorId`,
`authorUsername`, `createdAt`, `lang`, `url`, `metrics`, and `source`. The
reserved `.invalid` URLs cannot resolve to a real social profile or post.
