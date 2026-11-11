import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFeedLinkDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  regionId!: number;

  @ApiProperty({ example: 'Хозяин Морей' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'https://pb16100.tochno.profitbase.ru/export/profitbase_xml/...' })
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  feedUrl!: string;

  @ApiPropertyOptional({ example: 'ЖК Хозяин Морей' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  blockName?: string;

  @ApiPropertyOptional({ example: 'profitbase', default: 'profitbase' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  provider?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    enum: ['remote', 'local'],
    default: 'remote',
    description: 'remote — планировки показываются по ссылке источника, local — копируются на наш сервер',
  })
  @IsOptional()
  @IsIn(['remote', 'local'])
  mediaMode?: 'remote' | 'local';
}
