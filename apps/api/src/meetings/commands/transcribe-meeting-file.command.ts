export class TranscribeMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly filePath: string,
  ) {}
}
