import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const workspace = process.cwd();
const argumentValue = (name, fallback) =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const manifest = JSON.parse(
  await readFile(path.join(workspace, argumentValue("--manifest", "video/narration.json")), "utf8"),
);
const metadata = JSON.parse(
  await readFile(
    path.join(workspace, argumentValue("--metadata", "video/public/audio/narration-metadata.json")),
    "utf8",
  ),
);
const captionsOutput = path.join(
  workspace,
  argumentValue("--captions", "video/src/captions.json"),
);
const srtOutput = path.join(
  workspace,
  argumentValue("--srt", "video/out/codex-merch-build-week.en.srt"),
);

const chunkWords = (text, maximumWords = 11) => {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    const hasSentenceEnd = /[.!?]$/.test(word);
    if (current.length >= maximumWords || (hasSentenceEnd && current.length >= 6)) {
      chunks.push(current.join(" "));
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
};

const cues = [];
for (const segment of manifest.segments) {
  const audio = metadata.segments.find((item) => item.id === segment.id);
  if (!audio) throw new Error(`Missing narration metadata for ${segment.id}.`);
  const chunks = chunkWords(segment.text);
  const weights = chunks.map((chunk) => chunk.split(/\s+/).length);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = segment.startSeconds;

  for (let index = 0; index < chunks.length; index += 1) {
    const isLast = index === chunks.length - 1;
    const allocated = audio.durationSeconds * (weights[index] / totalWeight);
    const end = isLast ? segment.startSeconds + audio.durationSeconds : cursor + allocated;
    cues.push({
      startMs: Math.round(cursor * 1000),
      endMs: Math.round(end * 1000),
      text: chunks[index],
    });
    cursor = end;
  }
}

const formatTime = (milliseconds) => {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
};

const srt = cues
  .map(
    (cue, index) =>
      `${index + 1}\n${formatTime(cue.startMs)} --> ${formatTime(cue.endMs)}\n${cue.text}\n`,
  )
  .join("\n");

await mkdir(path.join(workspace, "video/out"), {recursive: true});
await mkdir(path.dirname(captionsOutput), {recursive: true});
await mkdir(path.dirname(srtOutput), {recursive: true});
await writeFile(captionsOutput, `${JSON.stringify(cues, null, 2)}\n`);
await writeFile(srtOutput, srt);
process.stdout.write(`Wrote ${cues.length} caption cues.\n`);
