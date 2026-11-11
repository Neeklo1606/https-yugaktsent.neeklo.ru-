import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { ListingsService } from './listings.service';
import { ListingsGovernanceService } from './listings-governance.service';
import { InventoryHealthService } from './inventory-health.service';
import {
  CreateManualApartmentDto,
  UpdateManualApartmentDto,
} from './dto/manual-apartment.dto';
import { UpdateListingAdminDto } from './dto/update-listing-admin.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { CreateManualHouseDto, UpdateManualHouseDto } from './dto/manual-house.dto';
import { CreateManualLandDto, UpdateManualLandDto } from './dto/manual-land.dto';
import {
  CreateManualCommercialDto,
  UpdateManualCommercialDto,
} from './dto/manual-commercial.dto';
import { CreateManualParkingDto, UpdateManualParkingDto } from './dto/manual-parking.dto';
import { ListingLifecycleDto, AssignListingOwnerDto } from './dto/listing-lifecycle.dto';

type TransferListingDto = { targetUserId?: string };

@ApiTags('Admin / Listings')
@ApiBearerAuth()
@Controller('admin/listings')
export class ListingsAdminController {
  constructor(
    private readonly service: ListingsService,
    private readonly governance: ListingsGovernanceService,
    private readonly inventory: InventoryHealthService,
    private readonly audit: AuditService,
  ) {}

  @Get('marketplace-health')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Marketplace inventory freshness and liquidity diagnostics' })
  marketplaceHealth(@Query('region_id') regionId?: string) {
    const rid = regionId != null && regionId !== '' ? Number.parseInt(regionId, 10) : undefined;
    return this.inventory.getMarketplaceHealth(Number.isFinite(rid) ? rid : undefined);
  }

  @Get('agent-health')
  @Roles('agent')
  @ApiOperation({ summary: 'Agent inventory health and maintenance nudges' })
  agentHealth(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.inventory.getAgentHealth({ userId, role });
  }

  @Post('bulk-refresh')
  @Roles('agent')
  @ApiOperation({ summary: 'Refresh lastActivityAt for stale owned listings (max 50)' })
  bulkRefresh(
    @Body() body: { listingIds?: number[] },
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.inventory.bulkRefreshActivity({ userId, role }, body?.listingIds);
  }

  @Get('observability')
  @Roles('agent')
  @ApiOperation({ summary: 'DEV/listing governance metrics (?listing_debug=1)' })
  observability(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.governance.getObservability({ userId, role });
  }

  @Get()
  @Roles('agent')
  @ApiOperation({ summary: 'Админ-список объявлений с фильтрами/пагинацией' })
  findAll(
    @Query() query: QueryListingsDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findAll(query, { userId, role });
  }

  @Get('agents')
  @Roles('agent')
  @ApiOperation({ summary: 'Сотрудники, которым можно передать ручной объект' })
  listAssignableAgents() {
    return this.service.listAssignableAgents();
  }

  @Post('manual-apartment')
  @Roles('agent')
  @ApiOperation({ summary: 'Создать ручное объявление квартиры (data_source=MANUAL)' })
  async createManualApartment(
    @Body() dto: CreateManualApartmentDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const created = await this.service.createManualApartment(dto, userId, role);
    await this.audit.log(userId, 'listing', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Post('manual-house')
  @Roles('agent')
  @ApiOperation({ summary: 'Создать ручное объявление дома (data_source=MANUAL)' })
  async createManualHouse(
    @Body() dto: CreateManualHouseDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const created = await this.service.createManualHouse(dto, userId, role);
    await this.audit.log(userId, 'listing', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Post('manual-land')
  @Roles('agent')
  @ApiOperation({ summary: 'Создать ручное объявление участка (data_source=MANUAL)' })
  async createManualLand(
    @Body() dto: CreateManualLandDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const created = await this.service.createManualLand(dto, userId, role);
    await this.audit.log(userId, 'listing', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Post('manual-commercial')
  @Roles('agent')
  @ApiOperation({ summary: 'Создать ручное коммерческое объявление (data_source=MANUAL)' })
  async createManualCommercial(
    @Body() dto: CreateManualCommercialDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const created = await this.service.createManualCommercial(dto, userId, role);
    await this.audit.log(userId, 'listing', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Post('manual-parking')
  @Roles('agent')
  @ApiOperation({ summary: 'Создать ручное парковочное объявление (data_source=MANUAL)' })
  async createManualParking(
    @Body() dto: CreateManualParkingDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const created = await this.service.createManualParking(dto, userId, role);
    await this.audit.log(userId, 'listing', created.id, 'CREATE', undefined, created);
    return created;
  }

  @Patch(':id/manual-apartment')
  @Roles('agent')
  @ApiOperation({ summary: 'Обновить ручное объявление квартиры (только MANUAL)' })
  async updateManualApartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualApartmentDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Headers('x-feed-sync') feedSync?: string,
  ) {
    const oldData = await this.service.findOne(id);
    // Запрос службы синхронизации фидов: закреплённые вручную поля она не перезаписывает
    const fromFeed = feedSync === '1' && (role === 'admin' || role === 'editor');
    const updated = await this.service.updateManualApartment(id, dto, userId, role, { fromFeed });
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Patch(':id/manual-house')
  @Roles('agent')
  @ApiOperation({ summary: 'Обновить ручное объявление дома (только MANUAL + HOUSE)' })
  async updateManualHouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualHouseDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateManualHouse(id, dto, userId, role);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Patch(':id/manual-land')
  @Roles('agent')
  @ApiOperation({ summary: 'Обновить ручное объявление участка (только MANUAL + LAND)' })
  async updateManualLand(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualLandDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateManualLand(id, dto, userId, role);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Patch(':id/manual-commercial')
  @Roles('agent')
  @ApiOperation({ summary: 'Обновить ручное коммерческое объявление (только MANUAL + COMMERCIAL)' })
  async updateManualCommercial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualCommercialDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateManualCommercial(id, dto, userId, role);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Patch(':id/manual-parking')
  @Roles('agent')
  @ApiOperation({ summary: 'Обновить ручное парковочное объявление (только MANUAL + PARKING)' })
  async updateManualParking(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManualParkingDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateManualParking(id, dto, userId, role);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Patch(':id/lifecycle')
  @Roles('agent')
  @ApiOperation({ summary: 'Lifecycle: publish/hide/archive/draft/republish (MANUAL only)' })
  async lifecycle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ListingLifecycleDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const updated = await this.governance.applyLifecycle(id, dto.action, { userId, role });
    await this.audit.log(userId, 'listing', id, 'UPDATE', undefined, updated);
    return updated;
  }

  @Patch(':id/assign')
  @Roles('manager')
  @ApiOperation({ summary: 'Assign/reassign manual listing owner (admin/manager/editor)' })
  async assignOwner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignListingOwnerDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const updated = await this.governance.assignOwner(id, dto.ownerUserId, { userId, role });
    await this.audit.log(userId, 'listing', id, 'UPDATE', undefined, updated);
    return updated;
  }

  @Patch(':id')
  @Roles('editor')
  @ApiOperation({ summary: 'Обновить статус/публикацию объявления (любого источника)' })
  async updateListingAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateListingAdminDto,
    @CurrentUser('sub') userId: string,
  ) {
    const oldData = await this.service.findOne(id);
    const updated = await this.service.updateAdminListing(id, dto);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Post(':id/release-manual')
  @Roles('editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вернуть управление фиду: снять ручное закрепление полей' })
  async releaseManual(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    const updated = await this.service.releaseManualFields(id);
    await this.audit.log(userId, 'listing', id, 'UPDATE', undefined, updated);
    return updated;
  }

    @Patch(':id/transfer')
  @Roles('agent')
  @ApiOperation({ summary: 'Передать ручное объявление другому сотруднику' })
  async transferManualListing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferListingDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    if (!dto.targetUserId) {
      throw new BadRequestException('targetUserId is required');
    }
    const oldData = await this.service.findOne(id);
    const updated = await this.service.transferManualListing(id, dto.targetUserId, userId, role);
    await this.audit.log(userId, 'listing', id, 'UPDATE', oldData, updated);
    return updated;
  }

  @Delete(':id')
  @Roles('agent')
  @ApiOperation({ summary: 'Удалить объявление (только MANUAL)' })
  async deleteManual(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const oldData = await this.service.findOne(id);
    const result = await this.service.deleteManualListing(id, userId, role);
    await this.audit.log(userId, 'listing', id, 'DELETE', oldData, null);
    return result;
  }
}
