import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Logger,
  Headers,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequestStatus, TelegramNotifyAccessStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, OptionalJwtUser, Public, Roles } from '../../auth/decorators';
import { CreateRequestDto } from './dto/create-request.dto';
import { AddRequestNoteDto } from './dto/add-request-note.dto';
import { RequestsService } from './requests.service';
import { TelegramNotifyService } from './telegram-notify.service';

export class UpdateRequestDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status: RequestStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Assignee user id (UUID), or null to clear assignment',
  })
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;
}

@ApiTags('Requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Мои заявки (созданные с JWT при отправке формы)' })
  findMine(@CurrentUser('sub') userId: string) {
    return this.service.findByUserId(userId);
  }

  @Public()
  @OptionalJwtUser()
  @Post()
  @ApiOperation({
    summary: 'Submit a request (public form)',
    description:
      'Если передать Bearer access token, заявка привяжется к пользователю и попадёт в GET /requests/me.',
  })
  create(@Body() dto: CreateRequestDto, @CurrentUser('sub') userId?: string) {
    return this.service.create(dto, userId);
  }
}

@ApiTags('Admin / Requests')
@ApiBearerAuth()
@Controller('admin/requests')
export class RequestsAdminController {
  constructor(private readonly service: RequestsService) {}

  @Get()
  @Roles('admin', 'editor', 'manager')
  @ApiOperation({ summary: 'Admin: list requests (paginated)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'assigned_to', required: false, description: 'UUID assignee id or "none"' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false, description: 'priority | created | activity' })
  @ApiQuery({ name: 'sla', required: false, description: 'overdue | stale (priority sort only)' })
  @ApiQuery({ name: 'page', required: false, schema: { default: 1 } })
  @ApiQuery({ name: 'per_page', required: false, schema: { default: 20 } })
  findAll(
    @CurrentUser('sub') _operatorId: string,
    @Query('status') status?: string,
    @Query('assigned_to') assignedTo?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('sla') sla?: string,
    @Query('page') page?: number,
    @Query('per_page') perPage?: number,
  ) {
    return this.service.findAll(status, assignedTo, search, page, perPage, sort ?? 'priority', sla);
  }

  @Get(':id')
  @Roles('admin', 'editor', 'manager')
  @ApiOperation({ summary: 'Admin: get request by id with timeline' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') operatorId: string,
  ) {
    void operatorId;
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles('admin', 'editor', 'manager')
  @ApiOperation({ summary: 'Admin: update request status / assignment' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequestDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.service.updateStatus(id, dto.status, dto.assignedTo, operatorId);
  }

  @Post(':id/notes')
  @Roles('admin', 'editor', 'manager')
  @ApiOperation({ summary: 'Admin: append note to request timeline' })
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddRequestNoteDto,
    @CurrentUser('sub') operatorId: string,
  ) {
    return this.service.addNote(id, dto.note, operatorId);
  }
}

@ApiTags('Telegram Bot')
@Controller('telegram-bot')
export class TelegramBotController {
  private readonly logger = new Logger(TelegramBotController.name);

  constructor(private readonly telegramNotify: TelegramNotifyService) {}

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Telegram webhook endpoint' })
  async webhook(
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!(await this.telegramNotify.isValidWebhookSecret(secret))) {
      throw new ForbiddenException();
    }
    // Reply to Telegram immediately to avoid webhook timeouts.
    // Command handling is performed asynchronously.
    void this.telegramNotify.handleWebhookUpdate(body).catch((e) => {
      this.logger.error(`Telegram webhook async handler failed: ${e instanceof Error ? e.message : String(e)}`);
    });
    return { ok: true };
  }
}

@ApiTags('Admin / Telegram Notify')
@ApiBearerAuth()
@Controller('admin/telegram-notify')
export class TelegramNotifyAdminController {
  constructor(private readonly telegramNotify: TelegramNotifyService) {}

  @Get('requests')
  @Roles('admin')
  @ApiOperation({ summary: 'List / filter telegram access requests' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TelegramNotifyAccessStatus,
  })
  listRequests(@Query('status') status?: TelegramNotifyAccessStatus) {
    return this.telegramNotify.listAccessRequests(status);
  }

  @Post('requests/:id/approve')
  @Roles('admin')
  @ApiOperation({ summary: 'Approve telegram access request' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.telegramNotify.approveAccessRequest(id, reviewerId);
  }

  @Post('requests/:id/reject')
  @Roles('admin')
  @ApiOperation({ summary: 'Reject telegram access request' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') reviewerId: string,
  ) {
    return this.telegramNotify.rejectAccessRequest(id, reviewerId);
  }

  @Get('recipients')
  @Roles('admin')
  @ApiOperation({ summary: 'List telegram notify recipients' })
  listRecipients() {
    return this.telegramNotify.listRecipients();
  }

  @Delete('recipients/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Deactivate telegram recipient' })
  deactivateRecipient(@Param('id', ParseIntPipe) id: number) {
    return this.telegramNotify.deactivateRecipient(id);
  }
}
