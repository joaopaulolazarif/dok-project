import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './shared/logging';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log('main-project started', { port });
}

bootstrap();
