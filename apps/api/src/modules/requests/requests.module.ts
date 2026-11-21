import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullSharedModule } from '../../bull/bull-shared.module';
import { ContentModule } from '../content/content.module';
import { UsersModule } from '../users/users.module';
import { CrmNotificationsModule } from '../crm-notifications/crm-notifications.module';
import { CrmCommunicationModule } from '../crm-communication/crm-communication.module';
import {
  RequestsAdminController,
  RequestsController,
  TelegramBotController,
  TelegramNotifyAdminController,
} from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestEventsService } from './request-events.service';
import { RequestSlaService } from './request-sla.service';
import { OpsSummaryService } from './ops-summary.service';
import { CrmAnalyticsService } from './crm-analytics.service';
import { CrmAttributionService } from './crm-attribution.service';
import { CrmLifecycleService } from './crm-lifecycle.service';
import { CrmOutcomeQualityService } from './crm-outcome-quality.service';
import { CrmForecastService } from './crm-forecast.service';
import { OpsCenterController } from './ops-center.controller';
import { RequestsAdminMetaController } from './requests-admin-meta.controller';
import { ResponseVelocityService } from './response-velocity.service';
import { TelegramNotifyService } from './telegram-notify.service';
import { LeadWebhookService } from './lead-webhook.service';
import { IntegrationsAdminController } from './integrations-admin.controller';
import { CRM_SNAPSHOT_QUEUE } from '../crm-snapshot/crm-snapshot.constants';
import { CrmSnapshotService } from '../crm-snapshot/crm-snapshot.service';
import { CrmTrendService } from '../crm-snapshot/crm-trend.service';
import { CrmSnapshotProcessor } from '../crm-snapshot/crm-snapshot.processor';
import { CrmSnapshotSchedulerService } from '../crm-snapshot/crm-snapshot-scheduler.service';

@Module({
  imports: [
    ContentModule,
    UsersModule,
    CrmNotificationsModule,
    forwardRef(() => CrmCommunicationModule),
    BullSharedModule,
    BullModule.registerQueue({ name: CRM_SNAPSHOT_QUEUE }),
  ],
  controllers: [
    IntegrationsAdminController,
    RequestsController,
    RequestsAdminMetaController,
    RequestsAdminController,
    OpsCenterController,
    TelegramBotController,
    TelegramNotifyAdminController,
  ],
  providers: [
    LeadWebhookService,
    RequestsService,
    RequestEventsService,
    RequestSlaService,
    ResponseVelocityService,
    OpsSummaryService,
    CrmAnalyticsService,
    CrmAttributionService,
    CrmLifecycleService,
    CrmOutcomeQualityService,
    CrmForecastService,
    CrmTrendService,
    CrmSnapshotService,
    CrmSnapshotProcessor,
    CrmSnapshotSchedulerService,
    TelegramNotifyService,
  ],
  exports: [RequestsService, RequestEventsService, RequestSlaService, CrmAnalyticsService, ResponseVelocityService],
})
export class RequestsModule {}
