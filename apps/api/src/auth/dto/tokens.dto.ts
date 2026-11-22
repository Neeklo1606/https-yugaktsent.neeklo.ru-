import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;
}

export class RefreshDto {
  // Без декоратора валидации глобальный ValidationPipe (whitelist + forbidNonWhitelisted) отвечал 400
  // на любой /auth/refresh — продление входа не работало, админка выкидывала через 15 минут (23.11.2026)
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}
