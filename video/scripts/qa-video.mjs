import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {access, mkdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const argumentValue = (name, fallback) =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const finalVideoRelative = argumentValue("--video", "video/out/codex-merch-build-week-1080p.mp4");
const finalVideo = path.join(workspace, finalVideoRelative);
const captionsPath = path.join(
  workspace,
  argumentValue("--captions", "video/out/codex-merch-build-week.en.srt"),
);
const thumbnailPath = path.join(
  workspace,
  argumentValue("--thumbnail", "video/out/codex-merch-build-week-thumbnail.png"),
);
const qaDirectory = path.join(workspace, argumentValue("--qa-dir", "video/qa"));
const privacyReviewed = process.argv.includes("--privacy-reviewed");
await mkdir(qaDirectory, {recursive: true});

const {stdout: probeOutput} = await execFileAsync("ffprobe", [
  "-v",
  "error",
  "-show_streams",
  "-show_format",
  "-of",
  "json",
  finalVideo,
]);
const probe = JSON.parse(probeOutput);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const durationSeconds = Number(probe.format.duration);
const [fpsNumerator, fpsDenominator] = String(video?.avg_frame_rate ?? "0/1")
  .split("/")
  .map(Number);
const fps = fpsNumerator / fpsDenominator;

if (video?.width !== 1920 || video?.height !== 1080) {
  throw new Error(`Expected 1920x1080, received ${video?.width}x${video?.height}.`);
}
if (Math.abs(fps - 30) > 0.01) throw new Error(`Expected 30 fps, received ${fps}.`);
if (!(durationSeconds > 60 && durationSeconds < 180)) {
  throw new Error(`Expected a sub-three-minute master longer than one minute, received ${durationSeconds}s.`);
}
if (!audio) throw new Error("The final master has no audio stream.");
if (video.codec_name !== "h264") throw new Error(`Expected H.264 video, received ${video.codec_name}.`);
if (audio.codec_name !== "aac") throw new Error(`Expected AAC audio, received ${audio.codec_name}.`);
if (Number(audio.sample_rate) !== 48000) {
  throw new Error(`Expected 48 kHz delivery audio, received ${audio.sample_rate} Hz.`);
}

await execFileAsync(
  "ffmpeg",
  ["-v", "error", "-i", finalVideo, "-f", "null", "-"],
  {maxBuffer: 1024 * 1024 * 8},
);

let loudnessOutput = "";
try {
  const result = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      finalVideo,
      "-af",
      "loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json",
      "-f",
      "null",
      "-",
    ],
    {maxBuffer: 1024 * 1024 * 8},
  );
  loudnessOutput = result.stderr;
} catch (error) {
  loudnessOutput = error.stderr ?? "";
  if (!loudnessOutput.includes('"input_i"')) throw error;
}

const loudnessMatch = loudnessOutput.match(/\{\s*"input_i"[\s\S]*?\}/);
if (!loudnessMatch) throw new Error("Unable to parse FFmpeg loudness analysis.");
const loudness = JSON.parse(loudnessMatch[0]);
const integratedLufs = Number(loudness.input_i);
const truePeakDbtp = Number(loudness.input_tp);
if (integratedLufs < -17.5 || integratedLufs > -14.5) {
  throw new Error(`Integrated loudness ${integratedLufs} LUFS is outside the -16 ±1.5 LUFS target.`);
}
if (truePeakDbtp > -1) {
  throw new Error(`True peak ${truePeakDbtp} dBTP exceeds the -1 dBTP ceiling.`);
}

await access(captionsPath);
await access(thumbnailPath);
const captionText = await readFile(captionsPath, "utf8");
const captionCueCount = (captionText.match(/--> /g) ?? []).length;
if (captionCueCount < 10) throw new Error(`Expected at least 10 caption cues, received ${captionCueCount}.`);

const contactSheetPath = path.join(qaDirectory, "final-contact-sheet.png");
await execFileAsync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    finalVideo,
    "-vf",
    "fps=1/17,scale=384:216,tile=5x2:padding=4:margin=4",
    "-frames:v",
    "1",
    "-update",
    "1",
    contactSheetPath,
  ],
  {maxBuffer: 1024 * 1024 * 8},
);

const report = {
  status: privacyReviewed ? "pass" : "technical-pass-privacy-review-pending",
  generatedFrom: finalVideoRelative,
  resolution: `${video.width}x${video.height}`,
  fps,
  durationSeconds,
  videoCodec: video.codec_name,
  audioCodec: audio.codec_name,
  audioSampleRate: Number(audio.sample_rate),
  integratedLufs,
  truePeakDbtp,
  captionCueCount,
  playbackDecode: "pass",
  contactSheet: path.relative(workspace, contactSheetPath),
  visualPrivacyReview: privacyReviewed ? "pass" : "pending manual contact-sheet review",
  fileSizeBytes: (await stat(finalVideo)).size,
  sha256: createHash("sha256").update(await readFile(finalVideo)).digest("hex"),
  captionsSha256: createHash("sha256").update(captionText).digest("hex"),
  thumbnailSha256: createHash("sha256")
    .update(await readFile(thumbnailPath))
    .digest("hex"),
};

await writeFile(path.join(qaDirectory, "ffprobe.json"), `${JSON.stringify(probe, null, 2)}\n`);
await writeFile(
  path.join(qaDirectory, "loudness.txt"),
  `${JSON.stringify(
    {
      targetIntegratedLufs: -16,
      targetTruePeakDbtp: -1.5,
      measuredIntegratedLufs: integratedLufs,
      measuredTruePeakDbtp: truePeakDbtp,
      measuredLoudnessRangeLu: Number(loudness.input_lra),
      normalizationOffsetLu: Number(loudness.target_offset),
    },
    null,
    2,
  )}\n`,
);
await writeFile(path.join(qaDirectory, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
