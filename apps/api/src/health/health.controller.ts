import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';
import { PlatformStabilityService } from '../modules/platform-stability/platform-stability.service';

@ApiTags('Health')
@Controller('health')
@Public()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformStabilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const dbOk = await this.prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    const platform = this.platform.getSnapshot();
    const schemaOk = platform.ok;

    const body = {
      status: dbOk && schemaOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? 'up' : 'down',
        schema: schemaOk ? 'compatible' : 'drift',
      },
    };
    // Uptime monitors rely on the HTTP code: a dead DB must not look healthy (audit B11).
    // Migration names and boot warnings are not exposed publicly any more.
    if (!dbOk) throw new ServiceUnavailableException(body);
    return body;
  }
}
