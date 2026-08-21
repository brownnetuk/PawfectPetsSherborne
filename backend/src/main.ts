import { setServers } from 'dns';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Some local/ISP DNS resolvers don't support the SRV/TXT lookups that
// mongodb+srv:// URIs rely on, which breaks the Atlas connection with
// ECONNREFUSED before we ever reach Mongo. Fall back to Cloudflare's
// resolver, which does support them, before Mongoose tries to connect.
setServers(['1.1.1.1', '8.8.8.8']);

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // exposedHeaders: browsers hide response headers from cross-origin JS by
  // default except a small safelist -- Content-Disposition isn't in it, so
  // without this the admin app's terms-and-conditions download can't read the
  // original filename back out of the response and falls back to a generic one.
  app.enableCors({ exposedHeaders: ['Content-Disposition'] });
  // Default body-parser limit (100kb) is too small for a base64-encoded logo
  // or terms-and-conditions .docx upload (Settings > Business Info); everything
  // else in the app sends small JSON payloads so raising this doesn't change
  // their behaviour.
  app.useBodyParser('json', { limit: '8mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
