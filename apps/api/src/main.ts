import './instrument';
import { NestFactory } from '@nestjs/core';
import { resolveMediaRoot } from './common/media-storage.util';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// BigInt JSON serialization (Nest / Express JSON)
Object.assign(BigInt.prototype, {
  toJSON(this: bigint) {
    return Number(this);
  },
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const mediaRoot = resolveMediaRoot(config.get<string>('MEDIA_ROOT'));
  app.useStaticAssets(mediaRoot, { prefix: '/uploads/', index: false });

  const prefix = config.get<string>('API_PREFIX', '/api/v1');
  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', 'http://localhost:5173,http://localhost:5174')
    .split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ЮгАкцент API')
    .setDescription('API агрегатора недвижимости')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}${prefix}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}

bootstrap();
