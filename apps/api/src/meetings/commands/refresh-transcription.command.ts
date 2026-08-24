export class RefreshTranscriptionCommand {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
    public readonly organizerId: string,
  ) {}
}
