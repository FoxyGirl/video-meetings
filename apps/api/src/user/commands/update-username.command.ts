export class UpdateUsernameCommand {
  constructor(
    public readonly userId: string,
    public readonly username?: string | null,
  ) {}
}
