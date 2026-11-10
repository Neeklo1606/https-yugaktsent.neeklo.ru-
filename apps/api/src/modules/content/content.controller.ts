import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Roles, CurrentUser } from '../../auth/decorators';
import { ContentService } from './content.service';

@ApiTags('Content')
@Controller('content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Public()
  @Get('settings')
  @ApiOperation({ summary: 'Site settings (без секретов интеграций)' })
  getSettings() {
    return this.service.getSettingsPublic();
  }

  @Public()
  @Get('contacts')
  @ApiOperation({ summary: 'Контакты агентства для Telegram бота' })
  getContacts() {
    return this.service.getBotContacts();
  }

  @Public()
  @Get('maps-config')
  @ApiOperation({ summary: 'Yandex Maps: публичный apiKey для загрузки JS API (из site_settings)' })
  getMapsConfig() {
    return this.service.getYandexMapsPublicConfig();
  }

  @Public()
  @Get('experts')
  @ApiOperation({ summary: 'Эксперты: опубликованные страницы, только публичные поля (experts=null — встроенные данные)' })
  getExperts() {
    return this.service.getExpertsPublic();
  }

  @Post('settings')
  @Roles('admin', 'editor')
  @ApiOperation({
    summary: 'Обновить настройки (устаревший путь; предпочтительно PUT /admin/content/settings)',
  })
  updateSettings(
    @Body() data: { key: string; value: string }[],
    @CurrentUser() user: { role: string },
  ) {
    return this.service.updateSettings(data, {
      requesterRole: user.role,
      returnMode: 'public',
    });
  }

  @Public()
  @Get('page/:slug')
  @ApiOperation({ summary: 'Visible content blocks for a page' })
  getPageBlocks(@Param('slug') slug: string) {
    return this.service.getPageBlocks(slug);
  }

  @Public()
  @Get('navigation/:location')
  @ApiOperation({ summary: 'Navigation menu with nested items' })
  getNavigation(@Param('location') location: string) {
    return this.service.getNavigation(location);
  }

  @Public()
  @Get('banks')
  @ApiOperation({ summary: 'Active mortgage banks' })
  getBanks() {
    return this.service.getBanks(true);
  }

  @Public()
  @Get('seo-landing')
  @ApiOperation({ summary: 'CMS SEO copy for catalog filter landings' })
  getSeoLanding(
    @Query('region_id') regionId?: string,
    @Query('region_name') regionName?: string,
    @Query('district') district?: string,
    @Query('subway') subway?: string,
  ) {
    return this.service.resolveSeoLanding({
      regionId: regionId ? Number(regionId) : undefined,
      regionName,
      district,
      subway,
    });
  }
}
