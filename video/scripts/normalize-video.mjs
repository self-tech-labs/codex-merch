import {execFile} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const input = path.join(workspace, "video/out/codex-merch-build-week-1080p-raw.mp4");
const output = path.join(workspace, "video/out/codex-merch-build-week-1080p.mp4");

await execFileAsync(
  "ffmpeg",
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c:v",
    "copy",
    "-af",
    "loudnorm=I=-16:LRA=7:TP=-1.5",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-shortest",
    "-movflags",
    "+faststart",
    output,
  ],
  {maxBuffer: 1024 * 1024 * 8},
);

process.stdout.write(`Normalized master written to ${path.relative(workspace, output)}\n`);
