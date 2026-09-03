export class DeleteMeetingCommand {
  constructor(
    public readonly meetingId: string,
    public readonly organizerId: string,
  ) {}
}
