import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, CurrentUser } from '../../auth/decorators';
import { ContentService } from './content.service';
import { CreateMortgageBankDto } from './dto/create-mortgage-bank.dto';
import { UpdateMortgageBankDto } from './dto/update-mortgage-bank.dto';
import { SiteSettingEntryDto } from './dto/site-setting-entry.dto';
import { UpdateExpertsDto } from './dto/update-experts.dto';

@ApiTags('Admin / Content')
@ApiBearerAuth()
@Controller('admin/content')
export class ContentAdminController {
  constructor(private readonly service: ContentService) {}

  @Get('settings')
  @Roles('admin', 'editor')
  @ApiOperation({
    summary: 'Настройки сайта (группа integrations только у admin)',
  })
  getSettings(@CurrentUser() user: { role: string }) {
    return this.service.getSettingsForAdminRole(user.role);
  }

  @Put('settings')
  @Roles('admin', 'editor')
  @ApiBody({ type: [SiteSettingEntryDto] })
  @ApiOperation({
    summary: 'Пакетное обновление настроек (ключи Telegram — только admin)',
  })
  updateSettings(
    @Body(new ParseArrayPipe({ items: SiteSettingEntryDto }))
    body: SiteSettingEntryDto[],
    @CurrentUser() user: { role: string },
  ) {
    return this.service.updateSettings(body, {
      requesterRole: user.role,
      returnMode: 'admin',
    });
  }

  @Get('experts')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Эксперты: полный список для редактора (experts=null — ещё не сохраняли)' })
  getExperts() {
    return this.service.getExpertsAdmin();
  }

  @Put('experts')
  @Roles('admin', 'editor')
  @ApiOperation({ summary: 'Эксперты: сохранить весь список (site_settings.experts_json)' })
  updateExperts(@Body() body: UpdateExpertsDto, @CurrentUser('sub') userId?: string) {
    return this.service.updateExperts(body.experts, userId);
  }

  @Get('banks')
  @Roles('editor')
  @ApiOperation({ summary: 'Admin: list mortgage banks (all)' })
  getBanks() {
    return this.service.getBanks(false);
  }

  @Post('banks')
  @Roles('editor')
  @ApiOperation({ summary: 'Admin: create mortgage bank' })
  createBank(@Body() body: CreateMortgageBankDto) {
    return this.service.createBank(body);
  }

  @Put('banks/:id')
  @Roles('editor')
  @ApiOperation({ summary: 'Admin: update mortgage bank' })
  updateBank(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMortgageBankDto,
  ) {
    return this.service.updateBank(id, body);
  }

  @Delete('banks/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin: delete mortgage bank' })
  deleteBank(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteBank(id);
  }
}
