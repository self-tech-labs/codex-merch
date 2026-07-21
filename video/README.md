# OpenAI Build Week demo video

This directory contains the reproducible source and verified YouTube package for
the Codex Merch submission. The final program is **2:50**, below the three-minute
limit, and combines a real public-app walkthrough with authored Remotion slides.

## Ready-to-upload package

- Final master: [`out/codex-merch-build-week-1080p.mp4`](out/codex-merch-build-week-1080p.mp4)
- YouTube thumbnail: [`out/codex-merch-build-week-thumbnail.png`](out/codex-merch-build-week-thumbnail.png)
- English captions: [`out/codex-merch-build-week.en.srt`](out/codex-merch-build-week.en.srt)
- Upload title, description, chapters, and tags: [`out/youtube-description.md`](out/youtube-description.md)
- Machine-readable upload fields: [`out/youtube-metadata.json`](out/youtube-metadata.json)
- Final QA report: [`qa/qa-report.json`](qa/qa-report.json)
- Final contact sheet: [`qa/final-contact-sheet.png`](qa/final-contact-sheet.png)

The video permanently labels the narration as an AI-generated voice, identifies
the project as an independent Build Week entry, and includes a full-screen AI
and production-boundary disclosure. No payment, provider sync, publication, or
fulfillment action is shown.

## Timeline

| Time | Section |
| --- | --- |
| 0:00 | Branded premise and scope |
| 0:08 | Live catalog and Solward product walkthrough |
| 0:39 | GPT-5.6 judgment versus deterministic authority |
| 1:05 | Live intake, contracts, critic, and release-boundary walkthrough |
| 1:53 | Judged-commit evidence |
| 2:14 | Explicit AI and production disclosure |
| 2:38 | Public Preview call to action |

## Reproduce the edit

Prerequisites are Node.js 22 or 24, FFmpeg/FFprobe, and the committed media
sources. Remotion and its related packages are pinned to `4.0.495`.

```bash
npm ci

# Rebuild captions, video, normalized audio delivery, thumbnail, and technical QA.
npm run video:package

# Inspect video/qa/final-contact-sheet.png, then record the human privacy review.
npm run video:qa -- --privacy-reviewed
```

`video:package` intentionally leaves the privacy review pending because a human
must inspect the generated contact sheet. The committed `qa-report.json` records
the completed review for the included final master.

The committed narration segments can be assembled again without an API call:

```bash
npm run video:narrate -- --assemble-only
npm run video:captions
```

To generate fresh narration, set `OPENAI_API_KEY` in the confirmed local
environment and run `npm run video:narrate`. The script calls OpenAI
`gpt-audio-1.5` through Chat Completions, saves the returned WAV and transcript,
rejects takes below 0.98 transcript similarity, and records provenance in
[`public/audio/narration-metadata.json`](public/audio/narration-metadata.json).
Two committed segments have documented leading-acknowledgement trims; their
exact accepted speech and source transcripts remain in the metadata.

## Live recording provenance

Codex Computer Use rehearsed and then operated the real public Preview in
Safari using only public, non-sellable sample data. FFmpeg captured the Mac
display at 30 fps after device enumeration. The accepted take was cropped to
the browser content and stitched from these clean ranges:

- `00:08.2–00:17.5` — public catalog
- `00:32.0–00:48.8` — Solward catalog/front/back/pattern views
- `00:50.2–01:40.7` — technical explainer and release boundary

The physical 3024×1964 capture used `crop=2600:1462:192:170`, followed by
`scale=1920:1080`, before the ranges were concatenated. The retained canonical
source is [`public/capture/walkthrough-trimmed.mp4`](public/capture/walkthrough-trimmed.mp4),
and its inspection sheet is
[`qa/walkthrough-trimmed-contact-sheet.png`](qa/walkthrough-trimmed-contact-sheet.png).
Raw and rejected takes were deleted after review because their setup frames
contained private desktop UI; `video/raw/` remains ignored by Git.

The structured capture record is [`recording.json`](recording.json). It records
the app URL, crop, retained ranges, and privacy decision without retaining any
private frames.

## QA acceptance criteria

`npm run video:qa` fails unless the final master has 1920×1080 video at 30 fps,
duration between one and three minutes, H.264 video, AAC audio, at least ten SRT
cues, integrated loudness within 1.5 LU of −16 LUFS, true peak no higher than
−1 dBTP, and a complete FFmpeg decode. It also regenerates the final contact
sheet. The included master passed at **−15.85 LUFS** and **−1.15 dBTP**.
