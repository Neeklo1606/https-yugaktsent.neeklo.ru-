import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryListingsDto {
  @ApiPropertyOptional({ description: 'Admin: skip default isPublished=true filter' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  admin_view?: boolean;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'HIDDEN', 'ARCHIVED', 'DRAFT'] })
  @IsOptional()
  @IsString()
  visibility?: string;

  @ApiPropertyOptional({ description: 'Filter by listing owner (manual listings)' })
  @IsOptional()
  @IsString()
  owner_user_id?: string;

  @ApiPropertyOptional({ description: 'Listings inactive 30+ days (recommendation flag)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  stale_only?: boolean;

  @ApiPropertyOptional({ description: 'Agent scope: owned listings only' })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) region_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ description: 'Comma-separated listing statuses (e.g. ACTIVE,RESERVED,SOLD)' })
  @IsOptional()
  @IsString()
  statuses?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() data_source?: string;
  @ApiPropertyOptional({ description: 'Filter listings whose externalId starts with this prefix (admin)' })
  @IsOptional()
  @IsString()
  external_id_prefix?: string;
  @ApiPropertyOptional({ description: 'Filter by isPublished (true/false). Default: true for anonymous, no filter for admin.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  is_published?: boolean;

  @ApiPropertyOptional({ description: 'Only listings with explicit lat/lng coordinates (true/false).' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  has_geo?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) price_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) price_max?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) area_total_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) area_total_max?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) area_kitchen_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) area_kitchen_max?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) house_land_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) house_land_max?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) distance_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) distance_max?: number;
  @ApiPropertyOptional({ description: 'Comma-separated house directions: south,north,east,west' }) @IsOptional() @IsString() house_directions?: string;
  @ApiPropertyOptional({ description: 'Alias of house_directions (catalog URL directions=)' }) @IsOptional() @IsString() directions?: string;
  @ApiPropertyOptional({ description: 'Comma-separated house location flags: belgorod_district,belgorod_region' }) @IsOptional() @IsString() house_location?: string;
  @ApiPropertyOptional({ description: 'Comma-separated house wall materials' }) @IsOptional() @IsString() house_materials?: string;
  @ApiPropertyOptional({ description: 'Comma-separated land categories (ИЖС, СНТ, …)' }) @IsOptional() @IsString() land_categories?: string;
  @ApiPropertyOptional({ description: 'Comma-separated commercial types (OFFICE, RETAIL, …)' }) @IsOptional() @IsString() commercial_types?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) floor_min?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) floor_max?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true') not_first_floor?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true') not_last_floor?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated room type IDs' }) @IsOptional() @IsString() rooms?: string;
  @ApiPropertyOptional({ description: 'Comma-separated room_types.id (admin: filter «Комнаты»)' })
  @IsOptional()
  @IsString()
  room_type_ids?: string;
  @ApiPropertyOptional({
    description:
      'Admin APARTMENT split: room — только комнаты; standard — квартиры без комнат (фид crm 100 + wizard kind=ROOM)',
    enum: ['room', 'standard'],
  })
  @IsOptional()
  @IsIn(['room', 'standard'])
  apartment_category?: 'room' | 'standard';
  @ApiPropertyOptional({
    description:
      'HOUSE split: dacha — дачи (wizard kind=DACHA); standard — дома без дач',
    enum: ['dacha', 'standard'],
  })
  @IsOptional()
  @IsIn(['dacha', 'standard'])
  house_category?: 'dacha' | 'standard';
  @ApiPropertyOptional({ description: 'Comma-separated finishing IDs' }) @IsOptional() @IsString() finishing?: string;
  @ApiPropertyOptional({ description: 'Comma-separated building type IDs' }) @IsOptional() @IsString() building_type?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) block_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) builder_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) district_id?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() district_names?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) subway_id?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sort?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) per_page?: number = 20;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) geo_lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) geo_lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(200_000) @Type(() => Number) geo_radius_m?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() geo_polygon?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() geo_preset?: string;

  @ApiPropertyOptional({
    description:
      'Тип жилья (только kind=APARTMENT): secondary — вторичка; new_building — новостройка; пусто — без фильтра',
    enum: ['secondary', 'new_building'],
  })
  @IsOptional()
  @IsIn(['secondary', 'new_building'])
  apartment_market?: string;
}
