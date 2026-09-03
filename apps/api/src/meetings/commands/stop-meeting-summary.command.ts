export class StopMeetingSummaryCommand {
  constructor(
    public readonly meetingId: string,
    public readonly organizerId: string,
  ) {}
}
