export class UploadMeetingFileCommand {
  constructor(
    public readonly meetingId: string,
    public readonly organizerId: string,
    public readonly file: Express.Multer.File,
  ) {}
}
