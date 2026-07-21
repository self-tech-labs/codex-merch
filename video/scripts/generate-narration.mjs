import {execFile} from "node:child_process";
import {mkdir, readFile, rename, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const argumentValue = (name, fallback) =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const manifestPath = path.join(workspace, argumentValue("--manifest", "video/narration.json"));
const audioDirectory = path.join(workspace, argumentValue("--audio-dir", "video/public/audio"));
const segmentDirectory = path.join(audioDirectory, "segments");
const metadataPath = path.join(audioDirectory, "narration-metadata.json");
const narrationPath = path.join(audioDirectory, "narration.wav");
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const selectedIds = onlyArgument
  ? new Set(onlyArgument.slice("--only=".length).split(",").filter(Boolean))
  : null;
const assembleOnly = process.argv.includes("--assemble-only");

const apiKey = process.env.OPENAI_API_KEY;
if (!assembleOnly && (!apiKey || apiKey.length < 20)) {
  throw new Error("OPENAI_API_KEY is unavailable. Load the confirmed local environment before narration generation.");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(segmentDirectory, {recursive: true});
let previousMetadata = [];
try {
  previousMetadata = JSON.parse(await readFile(metadataPath, "utf8")).segments ?? [];
} catch {
  // A first run has no metadata to preserve.
}

const normalizeWords = (value) =>
  value
    .toLowerCase()
    .replace(/gpt[\s-]*5[.\s-]*6/g, "gpt56")
    .replace(/gpt[\s-]*audio[\s-]*1[.\s-]*5/g, "gptaudio15")
    .replace(/one hundred thirty-three/g, "133")
    .replace(/eighty-seven/g, "87")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const editDistance = (left, right) => {
  const previous = Array.from({length: right.length + 1}, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const transcriptSimilarity = (expected, actual) => {
  const expectedWords = normalizeWords(expected);
  const actualWords = normalizeWords(actual);
  const denominator = Math.max(expectedWords.length, actualWords.length, 1);
  return 1 - editDistance(expectedWords, actualWords) / denominator;
};

const probeDuration = async (filePath) => {
  const {stdout} = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to read narration duration for ${path.basename(filePath)}.`);
  }
  return duration;
};

const probeMaxVolume = async (filePath) => {
  let diagnostics = "";
  try {
    const result = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);
    diagnostics = result.stderr;
  } catch (error) {
    diagnostics = error.stderr ?? "";
  }
  const match = diagnostics.match(/max_volume:\s*(-?[\d.]+) dB/);
  return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
};

const createAudio = async (segment) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: manifest.model,
      modalities: ["text", "audio"],
      audio: {voice: manifest.voice, format: "wav"},
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are not a conversational assistant. Your entire response is a verbatim audio rendering of the user's text. Start with the first supplied word and end with the last supplied word. Never acknowledge the request, announce the narration, add an introduction, or add a closing. Read with calm confidence at approximately 150 words per minute, using natural sentence pauses and clear technical pronunciation.",
        },
        {
          role: "user",
          content: segment.text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI audio request failed (${response.status}): ${details}`);
  }

  const payload = await response.json();
  const audio = payload.choices?.[0]?.message?.audio;
  if (!audio?.data || !audio?.transcript) {
    throw new Error(`OpenAI returned no audio payload for narration segment ${segment.id}.`);
  }

  return {
    bytes: Buffer.from(audio.data, "base64"),
    transcript: audio.transcript,
  };
};

const metadata = [];
for (let index = 0; index < manifest.segments.length; index += 1) {
  const segment = manifest.segments[index];
  const outputPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}-${segment.id}.wav`);
  let accepted = null;
  let rejectionReason = "unknown validation failure";
  const nextStart = manifest.segments[index + 1]?.startSeconds ?? manifest.compositionDurationSeconds;
  const availableSeconds = nextStart - segment.startSeconds - 0.35;

  if (assembleOnly) {
    const existing = previousMetadata.find((item) => item.id === segment.id) ?? {};
    metadata.push({
      ...existing,
      id: segment.id,
      file: path.relative(workspace, outputPath),
      startSeconds: segment.startSeconds,
      durationSeconds: await probeDuration(outputPath),
      transcript: segment.text,
      transcriptSimilarity: 1,
      postProcessing: segment.postProcessing ?? null,
      sourceTranscript: segment.postProcessing
        ? existing.sourceTranscript ?? existing.transcript
        : undefined,
    });
    continue;
  }

  if (selectedIds && !selectedIds.has(segment.id)) {
    const existing = previousMetadata.find((item) => item.id === segment.id);
    if (!existing) throw new Error(`Cannot preserve missing metadata for ${segment.id}.`);
    metadata.push(existing);
    continue;
  }

  for (let attempt = 1; attempt <= 3 && !accepted; attempt += 1) {
    process.stdout.write(`Generating narration segment ${index + 1}/${manifest.segments.length}: ${segment.id}\n`);
    const generated = await createAudio(segment);
    const similarity = transcriptSimilarity(segment.text, generated.transcript);
    await writeFile(outputPath, generated.bytes);
    const generatedDuration = await probeDuration(outputPath);
    const maxVolumeDb = await probeMaxVolume(outputPath);
    const durationFits = generatedDuration <= availableSeconds * 1.25;
    const hasAudibleSignal = maxVolumeDb > -45;
    if (similarity >= 0.98 && durationFits && hasAudibleSignal) {
      accepted = {...generated, similarity, attempt};
    } else {
      rejectionReason = [
        similarity < 0.98 ? `transcript similarity ${similarity.toFixed(3)}` : null,
        !durationFits ? `duration ${generatedDuration.toFixed(2)}s exceeds the pacing window` : null,
        !hasAudibleSignal ? `silent or inaudible audio (${maxVolumeDb} dB max)` : null,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }

  if (!accepted) {
    throw new Error(`Narration validation failed for ${segment.id} after three takes: ${rejectionReason}.`);
  }

  let durationSeconds = await probeDuration(outputPath);
  let tempo = 1;

  if (durationSeconds > availableSeconds) {
    tempo = durationSeconds / availableSeconds;
    if (tempo > 1.25) {
      throw new Error(
        `Narration segment ${segment.id} is ${durationSeconds.toFixed(2)}s and cannot fit its ${availableSeconds.toFixed(2)}s window without excessive time compression.`,
      );
    }
    const adjustedPath = `${outputPath}.adjusted.wav`;
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      outputPath,
      "-filter:a",
      `atempo=${tempo.toFixed(6)}`,
      "-c:a",
      "pcm_s16le",
      adjustedPath,
    ]);
    await rename(adjustedPath, outputPath);
    durationSeconds = await probeDuration(outputPath);
  }

  metadata.push({
    id: segment.id,
    file: path.relative(workspace, outputPath),
    startSeconds: segment.startSeconds,
    durationSeconds,
    transcript: accepted.transcript,
    transcriptSimilarity: Number(accepted.similarity.toFixed(4)),
    attempt: accepted.attempt,
    tempo: Number(tempo.toFixed(4)),
  });
}

const ffmpegArguments = [
  "-y",
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-t",
  String(manifest.compositionDurationSeconds),
  "-i",
  "anullsrc=r=48000:cl=stereo",
];

for (const item of metadata) {
  ffmpegArguments.push("-i", path.join(workspace, item.file));
}

const filters = metadata.map(
  (item, index) =>
    `[${index + 1}:a]aresample=48000,loudnorm=I=-18:LRA=7:TP=-2,adelay=delays=${Math.round(item.startSeconds * 1000)}:all=1[a${index + 1}]`,
);
const mixInputs = ["[0:a]", ...metadata.map((_, index) => `[a${index + 1}]`)].join("");
filters.push(
  `${mixInputs}amix=inputs=${metadata.length + 1}:duration=first:normalize=0,alimiter=limit=0.95,aresample=48000[aout]`,
);

ffmpegArguments.push(
  "-filter_complex",
  filters.join(";"),
  "-map",
  "[aout]",
  "-c:a",
  "pcm_s16le",
  "-ar",
  "48000",
  narrationPath,
);

await execFileAsync("ffmpeg", ffmpegArguments, {maxBuffer: 1024 * 1024 * 8});
await writeFile(
  metadataPath,
  `${JSON.stringify(
    {
      model: manifest.model,
      voice: manifest.voice,
      endpoint: "https://api.openai.com/v1/chat/completions",
      explicitDisclosureRequired: true,
      compositionDurationSeconds: manifest.compositionDurationSeconds,
      segments: metadata,
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(`Narration written to ${path.relative(workspace, narrationPath)}\n`);
