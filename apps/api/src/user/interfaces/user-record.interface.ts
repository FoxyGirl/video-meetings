export interface UserRecord {
  id: string;
  email: string;
}

export interface UserWithCredentials extends UserRecord {
  password: string;
}

export interface UserProfile extends UserRecord {
  username: string | null;
  avatarMimeType: string | null;
  avatarUploadedAt: Date | null;
}
