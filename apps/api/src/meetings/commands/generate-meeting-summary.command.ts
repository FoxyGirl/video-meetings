export class GenerateMeetingSummaryCommand {
  constructor(
    public readonly meetingId: string,
    // Correlates this run with the summaryGenerationToken the trigger
    // stamped onto the Meeting row at dispatch time — see
    // GenerateMeetingSummaryHandler's compare-and-set writes.
    public readonly token: string,
  ) {}
}
