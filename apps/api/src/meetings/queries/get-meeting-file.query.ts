export class GetMeetingFileQuery {
  constructor(public readonly meetingId: string) {}
}

// Narrow shape of what GetMeetingFileHandler resolves to — only the file
// columns the metadata/download routes actually need, typed explicitly so
// QueryBus.execute's generic return isn't `any` at the controller call site.
export interface MeetingFileRecord {
  fileOriginalName: string;
  filePath: string;
  fileMimeType: string;
  fileSize: number;
  fileUploadedAt: Date;
}
