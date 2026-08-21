import { copyFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { nodewhisper } from 'nodejs-whisper';
import { getWhisperModelRootPath } from './whisper.constants';

// The only call into the local Whisper engine — isolated here so the rest
// of the transcription code (the command handler) doesn't depend on
// nodejs-whisper's specific API shape. Multilingual "tiny" (not "tiny.en"),
// since the PRD is transcription-only in the source language, not
// English-only. modelRootPath is always passed explicitly (never the
// library's default location) so "is the model present" is a single,
// predictable filesystem check under our own control.
export async function transcribeFile(
  absoluteFilePath: string,
): Promise<string> {
  // Transcribe a disposable copy, never the live upload. nodejs-whisper's
  // own convertToWavType (utils.ts) doesn't just read whatever isn't
  // already a valid 16kHz-mono-PCM WAV — for a file that's already .wav
  // specifically, it re-encodes and renames the temp file OVER the input
  // path, in place. Verified empirically: a real 44.1kHz stereo .wav
  // upload (the common case, not an edge case) came back silently
  // resampled to mono at the same path, with a different size/hash —
  // exactly the kind of silent data loss a side effect of transcription
  // must never cause. Working on a copy sidesteps this entirely, for
  // every input type, not just .wav — the original upload is never
  // touched by anything nodejs-whisper does.
  const copyPath = join(
    tmpdir(),
    `${randomUUID()}${extname(absoluteFilePath)}`,
  );
  await copyFile(absoluteFilePath, copyPath);

  const isAlreadyWav = extname(copyPath).toLowerCase() === '.wav';
  const wavPath = isAlreadyWav
    ? copyPath
    : `${copyPath.slice(0, -extname(copyPath).length)}.wav`;
  const textOutputPath = `${wavPath}.txt`;

  try {
    await nodewhisper(copyPath, {
      modelName: 'tiny',
      autoDownloadModelName: 'tiny',
      modelRootPath: getWhisperModelRootPath(),
      whisperOptions: { outputInText: true },
    });

    // nodewhisper()'s own resolved value is whisper-cli's raw stdout, which
    // prefixes every segment with a `[HH:MM:SS.mmm --> HH:MM:SS.mmm]`
    // timestamp (verified by direct inspection — nodejs-whisper's typed
    // WhisperOptions has no flag to suppress this). The `-otxt` flag (set
    // via outputInText above) additionally makes whisper-cli write a clean,
    // timestamp-free sidecar text file, which is the actual plain-text
    // transcript the PRD calls for.
    const text = await readFile(textOutputPath, 'utf-8');
    return text.trim();
  } finally {
    await unlink(copyPath).catch(() => undefined);
    if (!isAlreadyWav) {
      await unlink(wavPath).catch(() => undefined);
    }
    await unlink(textOutputPath).catch(() => undefined);
  }
}
