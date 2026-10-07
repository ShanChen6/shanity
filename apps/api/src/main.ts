import { configureApp } from './setup.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Payment gateways sign the exact bytes of a webhook body.
    rawBody: true,
  });
  configureApp(app);
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
