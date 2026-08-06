import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUsernameDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string | null;
}
