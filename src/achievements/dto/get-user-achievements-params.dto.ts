import { IsUUID } from 'class-validator';

export class GetUserAchievementsParamsDto {
  @IsUUID()
  id: string;
}
