export class GetUserAvatarQuery {
  constructor(public readonly userId: string) {}
}

// Narrow shape of what GetUserAvatarHandler resolves to, mirroring
// MeetingFileRecord's role for the meeting file download route.
export interface UserAvatarRecord {
  avatarPath: string;
  avatarMimeType: string;
}
