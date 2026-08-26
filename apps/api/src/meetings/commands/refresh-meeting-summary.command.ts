export class RefreshMeetingSummaryCommand {
  constructor(
    public readonly meetingId: string,
    public readonly organizerId: string,
  ) {}
}
