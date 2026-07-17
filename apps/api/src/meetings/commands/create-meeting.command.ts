export class CreateMeetingCommand {
  constructor(
    public readonly organizerId: string,
    public readonly title: string,
    public readonly date: string,
    public readonly participants: string[],
  ) {}
}
