export class TranscribeMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
    public readonly filePath: string,
  ) {}
}
