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
  app.enableCors();
  // Default body-parser limit (100kb) is too small for a base64-encoded logo
  // upload (Settings > Business Info); everything else in the app sends
  // small JSON payloads so raising this doesn't change their behaviour.
  app.useBodyParser('json', { limit: '5mb' });
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
