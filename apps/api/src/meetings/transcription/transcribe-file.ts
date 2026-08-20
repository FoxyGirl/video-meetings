import { readFile, unlink } from 'node:fs/promises';
import { extname } from 'node:path';
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
  const isAlreadyWav = extname(absoluteFilePath).toLowerCase() === '.wav';

  // nodejs-whisper's own convertToWavType (utils.ts) writes a same-directory
  // `<basename>.wav` sibling for anything that isn't already a valid WAV —
  // a distinct file, safe for this wrapper to clean up afterwards. A file
  // that *is* already `.wav` is either passed through unchanged or rewritten
  // in place by that same conversion step, so there is no separate byproduct
  // to delete in that case — critically, this must never delete
  // absoluteFilePath itself, since for an already-.wav upload that path
  // *is* the user's original file on disk (removeWavFileAfterTranscription,
  // nodewhisper's own cleanup option, does exactly that and is deliberately
  // not used here for this reason).
  const wavPath = isAlreadyWav
    ? absoluteFilePath
    : `${absoluteFilePath.slice(0, -extname(absoluteFilePath).length)}.wav`;
  const textOutputPath = `${wavPath}.txt`;

  try {
    await nodewhisper(absoluteFilePath, {
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
    if (!isAlreadyWav) {
      await unlink(wavPath).catch(() => undefined);
    }
    await unlink(textOutputPath).catch(() => undefined);
  }
}
