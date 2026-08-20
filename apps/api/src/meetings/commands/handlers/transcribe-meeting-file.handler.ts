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

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { transcriptionStatus: 'PROCESSING' },
    });

    try {
      // getUploadDir() is always absolute (see its own comment on why —
      // nodejs-whisper's shelljs.cd() call mutates this whole process's
      // cwd for the duration of a transcription job), so join() here always
      // produces an absolute path too.
      const text = await transcribeFile(join(getUploadDir(), filePath));

      await this.prisma.meeting.update({
        where: { id: meetingId },
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

      await this.prisma.meeting.update({
        where: { id: meetingId },
        data: { transcriptionStatus: 'FAILED' },
      });
    }
  }
}
