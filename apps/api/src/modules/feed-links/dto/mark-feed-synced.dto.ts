import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class MarkFeedSyncedDto {
  @ApiPropertyOptional({ enum: ['ok', 'empty', 'error'] })
  @IsOptional()
  @IsIn(['ok', 'empty', 'error'])
  status?: 'ok' | 'empty' | 'error';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  total?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  created?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  updated?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  errors?: number;

  @ApiPropertyOptional({ description: 'Текст ошибки последней синхронизации' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  errorMessage?: string;
}
