import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRequestDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2, { message: 'Укажите имя' }) @MaxLength(100)
  name!: string;

  /** Российский номер: +7XXXXXXXXXX или 8XXXXXXXXXX, допускаются пробелы, скобки и дефисы */
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  @Matches(/^(\+7|7|8)[\s\-()]*(\d[\s\-()]*){10}$/, { message: 'Укажите российский номер телефона' })
  phone!: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsEmail() @MaxLength(200) email?: string;

  @ApiPropertyOptional({ enum: ['CONSULTATION', 'MORTGAGE', 'CALLBACK', 'SELECTION', 'CONTACT'] })
  @IsOptional() @IsString() @MaxLength(32) type?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() blockId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() listingId?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) sourceUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) comment?: string;

  /** Галочка согласия на обработку ПД (не может быть отмечена заранее — проверяется на клиенте) */
  @ApiProperty() @IsBoolean() @Equals(true, { message: 'Нужно согласие на обработку персональных данных' })
  consent!: boolean;

  /** Дата редакции документа «Согласие на обработку ПД», например 2026-11-11 */
  @ApiProperty() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) consentVersion!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmMedium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmCampaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmContent?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) utmTerm?: string;

  /** Ловушка для ботов: поле скрыто от людей, заполненное — заявка не сохраняется */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) website?: string;
}
