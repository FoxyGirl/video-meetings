import { join } from 'node:path';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { getUploadDir } from '../../upload/file-upload.constants';
import { transcribeFile } from '../../transcription/transcribe-file';
import { TranscribeMeetingFileCommand } from '../transcribe-meeting-file.command';

@CommandHandler(TranscribeMeetingFileCommand)
export class TranscribeMeetingFileHandler implements ICommandHandler<TranscribeMeetingFileCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ meetingId, filePath }: TranscribeMeetingFileCommand) {
    // Same lookup shape GetMeetingFileHandler uses (findUnique by id).
    // Scoped to the file path this job was dispatched for — if the file
    // was already replaced or deleted before this job even started, there
    // is nothing for it to do.
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting || meeting.filePath !== filePath) {
      return;
    }

    // Same compare-and-set the COMPLETED/FAILED writes below use, not a
    // plain update(): the findUnique read above and this write aren't
    // atomic, so a delete or re-upload landing in that (narrow) gap could
    // otherwise still flip transcriptionStatus to PROCESSING on a meeting
    // whose filePath has already changed underneath it — stranding it
    // showing "Processing" with no file, since the later guarded writes
    // would then correctly no-op against the new filePath and never
    // move it out of that state.
    const { count: claimed } = await this.prisma.meeting.updateMany({
      where: { id: meetingId, filePath },
      data: { transcriptionStatus: 'PROCESSING' },
    });

    if (claimed === 0) {
      return;
    }

    try {
      // getUploadDir() is always absolute (see its own comment on why —
      // nodejs-whisper's shelljs.cd() call mutates this whole process's
      // cwd for the duration of a transcription job), so join() here always
      // produces an absolute path too.
      const text = await transcribeFile(join(getUploadDir(), filePath));

      // Guard against the file being replaced/deleted while this job was
      // mid-flight: transcribeFile() above can take anywhere from seconds
      // to minutes, long enough for a re-upload or delete to have already
      // moved the meeting on to a different (or no) file and dispatched
      // its own job. updateMany's where-filter re-checks filePath and the
      // write atomically — if it no longer matches, this is a stale
      // result from a superseded run, so drop it silently rather than
      // overwriting whatever the newer run (or the delete) already wrote.
      await this.prisma.meeting.updateMany({
        where: { id: meetingId, filePath },
        data: {
          transcriptionStatus: 'COMPLETED',
          transcriptionText: text,
          transcriptionUpdatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `[TranscribeMeetingFileHandler] meeting ${meetingId}:`,
        error,
      );

      await this.prisma.meeting.updateMany({
        where: { id: meetingId, filePath },
        data: { transcriptionStatus: 'FAILED' },
      });
    }
  }
}
