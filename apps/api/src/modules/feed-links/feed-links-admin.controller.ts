import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { CreateFeedLinkDto } from './dto/create-feed-link.dto';
import { UpdateFeedLinkDto } from './dto/update-feed-link.dto';
import { MarkFeedSyncedDto } from './dto/mark-feed-synced.dto';
import { FeedLinksService } from './feed-links.service';

@ApiTags('Admin / Feed links')
@ApiBearerAuth()
@Controller('admin/feed-links')
export class FeedLinksAdminController {
  constructor(
    private readonly service: FeedLinksService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Список ссылок на внешние фиды (Profitbase XML и др.)' })
  @ApiQuery({ name: 'region_id', required: false, type: Number })
  @ApiQuery({ name: 'enabled', required: false, type: Boolean })
  findAll(
    @Query('region_id', new DefaultValuePipe('')) regionIdRaw: string,
    @Query('enabled', new DefaultValuePipe('')) enabledRaw: string,
  ) {
    const regionId =
      regionIdRaw !== '' && regionIdRaw !== undefined
        ? Number.parseInt(regionIdRaw, 10)
        : undefined;
    const enabledOnly =
      enabledRaw === '1' || enabledRaw === 'true' ? true : undefined;
    return this.service.findAllAdmin({
      regionId: Number.isFinite(regionId) ? regionId : undefined,
      enabledOnly,
    });
  }

  @Get('overview')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Сводка по фидам: ЖК на сайте, застройщик, квартиры, фото' })
  overview() {
    return this.service.overviewAdmin();
  }

  @Get(':id/history')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'История прогонов синхронизации фида' })
  history(@Param('id', ParseIntPipe) id: number) {
    return this.service.syncHistory(id);
  }

  @Get(':id/probe')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Проверить доступность фида и число объектов' })
  probe(@Param('id', ParseIntPipe) id: number) {
    return this.service.probe(id);
  }

  @Post(':id/mark-synced')
  @Roles('admin', 'editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Отметить время последней синхронизации (profitbase-sync)' })
  markSynced(@Param('id', ParseIntPipe) id: number, @Body() dto: MarkFeedSyncedDto) {
    return this.service.markSynced(id, dto);
  }

  @Post()
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Добавить ссылку на фид' })
  async create(@Body() dto: CreateFeedLinkDto, @CurrentUser('sub') userId: string) {
    const created = await this.service.createAdmin(dto);
    await this.audit.log(userId, 'feed_link', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Patch(':id')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Обновить ссылку на фид' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeedLinkDto,
    @CurrentUser('sub') userId: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateAdmin(id, dto);
    await this.audit.log(userId, 'feed_link', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить ссылку на фид' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    const oldData = await this.service.findOne(id);
    await this.service.deleteAdmin(id);
    await this.audit.log(userId, 'feed_link', id, 'DELETE', oldData, null);
  }
}
