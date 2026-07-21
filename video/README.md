# OpenAI Build Week demo video

This directory contains two reproducible Remotion cuts. The current jury cut is
**Signal In. Merch Out.**, a 2:51 explanation of Codex Merch as an open-source,
hackable trend-signal-to-real-merch pipeline. The verified first cut remains
available below as an archive.

## Current jury package — v2

- Final master: [`out/codex-merch-signal-to-product-1080p.mp4`](out/codex-merch-signal-to-product-1080p.mp4)
- YouTube thumbnail: [`out/codex-merch-signal-to-product-thumbnail.png`](out/codex-merch-signal-to-product-thumbnail.png)
- English captions: [`out/codex-merch-signal-to-product.en.srt`](out/codex-merch-signal-to-product.en.srt)
- Upload title, description, chapters, and tags: [`out/youtube-description-v2.md`](out/youtube-description-v2.md)
- Machine-readable upload fields: [`out/youtube-metadata-v2.json`](out/youtube-metadata-v2.json)
- Final QA report: [`qa/v2/qa-report.json`](qa/v2/qa-report.json)
- Final contact sheet: [`qa/v2/final-contact-sheet.png`](qa/v2/final-contact-sheet.png)
- Narration provenance: [`public/audio/v2/narration-metadata.json`](public/audio/v2/narration-metadata.json)

The master permanently labels its AI-generated narration. It distinguishes the
real local application capture from authored Remotion graphics, identifies the
commerce surface as a safe Preview, and says that named fashion groups are
market examples only. It shows no payment, provider sync, publication, or
fulfillment action.

## V2 timeline

| Time | Section |
| --- | --- |
| 0:00 | Signal in. Merch out. |
| 0:09 | The missing middle: make the loop visible |
| 0:26 | Real Solward catalog, product, panels, and rights record |
| 0:53 | Five moves and three authorities |
| 1:30 | Four hackable repository seams |
| 1:54 | Commercial thesis and market examples |
| 2:18 | Repository proof and fail-closed boundary |
| 2:38 | Fork the pipeline; inspect the garments |

## Reproduce v2

Prerequisites are Node.js 22 or 24, FFmpeg/FFprobe, and the committed media
sources. Remotion and its related packages are pinned to `4.0.495`.

```bash
npm ci

# Reassemble the committed narration without an API call.
npm run video:narrate:v2 -- --assemble-only

# Rebuild captions, master, loudness-normalized delivery, thumbnail, and QA.
npm run video:package:v2
```

`video:package:v2` deliberately leaves privacy review pending. Inspect
[`qa/v2/final-contact-sheet.png`](qa/v2/final-contact-sheet.png), then record the
human review with `npm run video:qa:v2 -- --privacy-reviewed`. The committed
report records that completed review for the included master.

To generate fresh narration, place `OPENAI_API_KEY` in the confirmed local
environment and run `npm run video:narrate:v2`. The reusable generator calls
OpenAI `gpt-audio-1.5`, verifies transcript similarity, rejects silent or
inaudible responses, enforces each scene's pacing window, and records every
accepted take and any bounded tempo adjustment.

## V2 capture provenance

Codex Computer Use rehearsed and operated a clean, full-screen Chromium window
against the repository's local Preview build. The retained assets are 13
target-window screenshots under [`public/capture/v2/`](public/capture/v2/):
catalog, Solward views, rights record, simplified five-stage flow, authority
model, hackable seams, commercial thesis, and Preview boundary.

The screenshots contain only repository-owned interface and safe catalog data.
They contain no browser chrome, credentials, private tabs, raw X content,
customer information, provider UI, or desktop setup. A physical-display take
showed the macOS Computer Use privacy shield instead of the application; it was
rejected and moved into ignored `video/raw/` storage. No rejected frame is part
of the jury package. The accepted source overview is
[`qa/v2/source-frames-contact-sheet.png`](qa/v2/source-frames-contact-sheet.png).

## V2 QA result

The included master passed at **1920×1080**, **30 fps**, **171.0 seconds**,
H.264/AAC at 48 kHz, **−15.97 LUFS**, and **−1.5 dBTP**. All 39 English cues are
both burned in and supplied as SRT. FFmpeg completed a full decode, the contact
sheet passed visual privacy review, and QuickTime successfully played both the
opening and the commercial-thesis chapter.

`npm run video:qa:v2 -- --privacy-reviewed` fails unless the master is under
three minutes, has the expected delivery codecs and dimensions, meets the
loudness and true-peak limits, includes captions and a thumbnail, and decodes
without error.

## Archived first cut

The original 2:50 **Inspectable AI Garment System** package remains reproducible:

- [`out/codex-merch-build-week-1080p.mp4`](out/codex-merch-build-week-1080p.mp4)
- [`out/codex-merch-build-week-thumbnail.png`](out/codex-merch-build-week-thumbnail.png)
- [`out/codex-merch-build-week.en.srt`](out/codex-merch-build-week.en.srt)
- [`qa/qa-report.json`](qa/qa-report.json)
- Remotion composition `CodexMerchBuildWeek`

Use `npm run video:package` to rebuild that archived cut. Its narration and
walkthrough assets remain under `public/audio/` and
`public/capture/walkthrough-trimmed.mp4`.
