import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, Min, IsBoolean, IsDateString, IsNumber, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === '1' || v === 1) return true;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  return undefined;
}

export class QueryBlocksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  region_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  district_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  builder_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  subway_id?: number;

  @ApiPropertyOptional({ enum: ['BUILDING', 'COMPLETED', 'PROJECT'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  per_page?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by district names (comma-separated)' })
  @IsOptional()
  @IsString()
  district_names?: string;

  @ApiPropertyOptional({ description: 'Filter by subway names (comma-separated)' })
  @IsOptional()
  @IsString()
  subway_names?: string;

  @ApiPropertyOptional({ description: 'Filter by builder names (comma-separated)' })
  @IsOptional()
  @IsString()
  builder_names?: string;

  @ApiPropertyOptional({ description: 'Comma-separated room type IDs (for listing counts)' })
  @IsOptional()
  @IsString()
  room_type_ids?: string;

  @ApiPropertyOptional({ description: 'Comma-separated room categories: 0,1,2,3,4 (0=studio)' })
  @IsOptional()
  @IsString()
  rooms?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated finishing IDs — ЖК с активными квартирами с такой отделкой',
  })
  @IsOptional()
  @IsString()
  finishing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  price_min?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  price_max?: number;


  @ApiPropertyOptional({ description: 'Срок сдачи (comma-separated). Поддержка: YYYY, YYYY MM, Qn YYYY, Сдан' })
  @IsOptional()
  @IsString()
  deadline?: string;

  @ApiPropertyOptional({ enum: ['name_asc', 'name_desc', 'created_desc', 'price_asc', 'price_desc', 'sales_start_asc'] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Only blocks flagged as promoted (горячие предложения)' })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  is_promoted?: boolean;

  @ApiPropertyOptional({ description: 'Only blocks with sales_start_date in range (inclusive), ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  sales_start_from?: string;

  @ApiPropertyOptional({ description: 'Upper bound for sales_start_date (inclusive), ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  sales_start_to?: string;

  @ApiPropertyOptional({ description: 'Comma-separated block slugs (ручной набор для главной)' })
  @IsOptional()
  @IsString()
  block_slugs?: string;

  @ApiPropertyOptional({ description: 'Only blocks with at least one active published apartment listing' })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  require_active_listings?: boolean;

  @ApiPropertyOptional({
    description:
      'Публичный каталог: показать ЖК без активных квартир (по умолчанию false; для карты/админки можно true)',
  })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  include_empty_blocks?: boolean;

  @ApiPropertyOptional({ description: 'Широта центра поиска по радиусу (WGS84), вместе с geo_lng и geo_radius_m' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  geo_lat?: number;

  @ApiPropertyOptional({ description: 'Долгота центра поиска по радиусу (WGS84)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  geo_lng?: number;

  @ApiPropertyOptional({ description: 'Радиус в метрах (PostGIS ST_DWithin)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200_000)
  @Type(() => Number)
  geo_radius_m?: number;

  @ApiPropertyOptional({
    description: 'GeoJSON Polygon как JSON-строка: coordinates [[[lng,lat],...]]',
  })
  @IsOptional()
  @IsString()
  geo_polygon?: string;

  @ApiPropertyOptional({ description: 'Встроенный полигон (например belgorod для geo_preset=belgorod)' })
  @IsOptional()
  @IsString()
  geo_preset?: string;

  @ApiPropertyOptional({ description: 'Min apartment area (m²)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  area_min?: number;

  @ApiPropertyOptional({ description: 'Max apartment area (m²)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  area_max?: number;

  @ApiPropertyOptional({ description: 'Min floor number' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  floor_min?: number;

  @ApiPropertyOptional({ description: 'Max floor number' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  floor_max?: number;

}
