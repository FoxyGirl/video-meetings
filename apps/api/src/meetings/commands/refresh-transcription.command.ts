export class RefreshTranscriptionCommand {
  constructor(
    public readonly meetingId: string,
    public readonly organizerId: string,
  ) {}
}
