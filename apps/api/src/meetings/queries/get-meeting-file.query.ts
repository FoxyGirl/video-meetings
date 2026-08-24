export class GetMeetingFileQuery {
  constructor(
    public readonly meetingId: string,
    public readonly fileId: string,
  ) {}
}

// Narrow shape of what GetMeetingFileHandler resolves to — only what the
// download route actually needs, typed explicitly so QueryBus.execute's
// generic return isn't `any` at the controller call site.
export interface MeetingFileDownloadRecord {
  originalName: string;
  filePath: string;
  mimeType: string;
}
