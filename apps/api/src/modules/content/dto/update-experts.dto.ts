import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Профиль эксперта (страница /experts/:slug). Контракт совпадает с
 * apps/web/src/shared/experts/expert-profile.ts — менять синхронно.
 */

export const EXPERT_LINK_TYPES = ['max', 'telegram', 'telegram_channel', 'youtube', 'vk', 'dzen', 'rutube', 'website'] as const;
export const EXPERT_CTA_TARGETS = ['max', 'telegram_channel', 'lead_form'] as const;

const SHORT = 200;
const URL_MAX = 2000;
const TEXT_MAX = 4000;
/** Пусто или без опасных схем: javascript:, data:, vbscript: */
const SAFE_URL_RE = /^(?!\s*(?:javascript|data|vbscript):)[\s\S]*$/i;
/** Картинки: только http(s) или путь от корня сайта (/uploads/…, /experts/…) */
const IMAGE_URL_RE = /^(?:$|https?:\/\/\S+$|\/(?!\/)\S*$)/i;
const ID_RE = /^[\w-]{1,64}$/;

export class ExpertLinkDto {
  @ApiProperty() @IsString() @Matches(ID_RE) id: string;
  @ApiProperty({ enum: EXPERT_LINK_TYPES }) @IsIn(EXPERT_LINK_TYPES) type: (typeof EXPERT_LINK_TYPES)[number];
  @ApiProperty() @IsString() @MaxLength(SHORT) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT) handle?: string;
  @ApiProperty() @IsString() @MaxLength(URL_MAX) @Matches(SAFE_URL_RE) url: string;
  @ApiProperty() @IsBoolean() visible: boolean;
}

export class ExpertVideoDto {
  @ApiProperty() @IsString() @Matches(ID_RE) id: string;
  @ApiProperty() @IsString() @MaxLength(SHORT) title: string;
  @ApiProperty() @IsString() @MaxLength(URL_MAX) @Matches(SAFE_URL_RE) url: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(URL_MAX) @Matches(IMAGE_URL_RE) previewUrl?: string;
  @ApiProperty() @IsInt() @Min(0) priority: number;
  @ApiProperty() @IsBoolean() visible: boolean;
}

export class ExpertGuideDto {
  @ApiProperty() @IsString() @Matches(ID_RE) id: string;
  @ApiProperty() @IsString() @MaxLength(SHORT) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(TEXT_MAX) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(URL_MAX) @Matches(SAFE_URL_RE) fileUrl?: string;
  @ApiProperty() @IsBoolean() published: boolean;
}

export class ExpertPhoneDto {
  @ApiProperty() @IsString() @Matches(ID_RE) id: string;
  @ApiProperty() @IsString() @MaxLength(80) label: string;
  @ApiProperty() @IsString() @MaxLength(40) value: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT) note?: string;
}

export class ExpertProjectDto {
  @ApiProperty() @IsString() @Matches(ID_RE) id: string;
  @ApiProperty() @IsString() @MaxLength(SHORT) title: string;
  @ApiProperty() @IsString() @MaxLength(TEXT_MAX) description: string;
}

export class ExpertSeoDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiProperty() @IsString() @MaxLength(1000) description: string;
}

export class ExpertProfileDto {
  @ApiProperty() @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug: string;
  @ApiProperty() @IsString() @MaxLength(SHORT) fullName: string;
  @ApiProperty() @IsString() @MaxLength(400) role: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT) experience?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(SHORT) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(URL_MAX) @Matches(IMAGE_URL_RE) photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(URL_MAX) @Matches(IMAGE_URL_RE) coverUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(TEXT_MAX) summary?: string;
  @ApiProperty() @IsString() @MaxLength(TEXT_MAX) intro: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(TEXT_MAX, { each: true })
  about: string[];

  @ApiProperty({ type: [ExpertProjectDto] })
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ExpertProjectDto)
  projects: ExpertProjectDto[];

  @ApiProperty({ type: [ExpertLinkDto] })
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ExpertLinkDto)
  links: ExpertLinkDto[];

  @ApiProperty({ type: [ExpertVideoDto] })
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => ExpertVideoDto)
  videos: ExpertVideoDto[];

  @ApiProperty({ type: [ExpertGuideDto] })
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ExpertGuideDto)
  guides: ExpertGuideDto[];

  @ApiProperty({ type: [ExpertPhoneDto] })
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ExpertPhoneDto)
  phones: ExpertPhoneDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) address?: string;
  @ApiProperty({ enum: EXPERT_CTA_TARGETS }) @IsIn(EXPERT_CTA_TARGETS) primaryCta: (typeof EXPERT_CTA_TARGETS)[number];
  @ApiProperty() @IsBoolean() showOnTeamPage: boolean;

  @ApiProperty({ type: ExpertSeoDto })
  @ValidateNested() @Type(() => ExpertSeoDto)
  seo: ExpertSeoDto;

  @ApiProperty() @IsBoolean() published: boolean;
}

export class UpdateExpertsDto {
  @ApiProperty({ type: [ExpertProfileDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ExpertProfileDto)
  experts: ExpertProfileDto[];
}
