import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RegionsModule } from './modules/regions/regions.module';
import { DistrictsModule } from './modules/districts/districts.module';
import { SubwaysModule } from './modules/subways/subways.module';
import { BuildersModule } from './modules/builders/builders.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { ListingsModule } from './modules/listings/listings.module';
import { RequestsModule } from './modules/requests/requests.module';
import { CrmNotificationsModule } from './modules/crm-notifications/crm-notifications.module';
import { ContentModule } from './modules/content/content.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { BullSharedModule } from './bull/bull-shared.module';
import { FeedImportModule } from './modules/feed-import/feed-import.module';
import { StatsModule } from './modules/stats/stats.module';
import { NewsModule } from './modules/news/news.module';
import { AiSettingsModule } from './modules/ai-settings/ai-settings.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { SearchModule } from './modules/search/search.module';
import { MediaModule } from './modules/media/media.module';
import { CacheModule } from './common/cache/cache.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PresentationsModule } from './modules/presentations/presentations.module';
import { SellersModule } from './modules/sellers/sellers.module';
import { ViewportPrototypeModule } from './modules/viewport-prototype/viewport-prototype.module';
import { MapViewportModule } from './modules/map-viewport/map-viewport.module';
import { SitemapModule } from './modules/sitemap/sitemap.module';
import { SystemDiagnosticsGovernanceModule } from './modules/system-diagnostics/system-diagnostics-governance.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { RetentionModule } from './modules/retention/retention.module';
import { CrmAutomationModule } from './modules/crm-automation/crm-automation.module';
import { TrustModule } from './modules/trust/trust.module';
import { BillingModule } from './modules/billing/billing.module';
import { FeedLinksModule } from './modules/feed-links/feed-links.module';
import { EcosystemModule } from './modules/ecosystem/ecosystem.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    SentryModule.forRoot(),
    MonitoringModule,
    CacheModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    RegionsModule,
    DistrictsModule,
    SubwaysModule,
    BuildersModule,
    ReferenceModule,
    BlocksModule,
    BuildingsModule,
    ListingsModule,
    CrmNotificationsModule,
    RequestsModule,
    ContentModule,
    UsersModule,
    AuditModule,
    BullSharedModule,
    FeedImportModule,
    FeedLinksModule,
    StatsModule,
    NewsModule,
    AiSettingsModule,
    FavoritesModule,
    CollectionsModule,
    SearchModule,
    MediaModule,
    PresentationsModule,
    SellersModule,
    ViewportPrototypeModule,
    // Маркеры карты /map/viewport/* — раньше модуль подключался только через выключенную диагностику
    MapViewportModule,
    SitemapModule,
    SystemDiagnosticsGovernanceModule,
    DiscoveryModule,
    RetentionModule,
    CrmAutomationModule,
    TrustModule,
    BillingModule,
    EcosystemModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
export class AppModule {}
