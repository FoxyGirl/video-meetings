export interface UserRecord {
  id: string;
  email: string;
}

export interface UserWithCredentials extends UserRecord {
  password: string;
}
