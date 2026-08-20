import { setServers } from 'dns';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Some local/ISP DNS resolvers don't support the SRV/TXT lookups that
// mongodb+srv:// URIs rely on, which breaks the Atlas connection with
// ECONNREFUSED before we ever reach Mongo. Fall back to Cloudflare's
// resolver, which does support them, before Mongoose tries to connect.
setServers(['1.1.1.1', '8.8.8.8']);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
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
