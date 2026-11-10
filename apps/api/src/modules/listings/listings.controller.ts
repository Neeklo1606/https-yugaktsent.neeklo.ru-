import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, OptionalJwtUser, Public } from '../../auth/decorators';
import { ListingsService } from './listings.service';
import { QueryListingsDto } from './dto/query-listings.dto';

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly service: ListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List property listings with apartment filters and pagination' })
  findAll(@Query() query: QueryListingsDto) {
    return this.service.findAll(query);
  }

  @Public()
  @OptionalJwtUser()
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get listing by ID with apartment and location details' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.service.findOne(id, { authenticated: Boolean(userId), role, publicRequest: true });
  }
}
