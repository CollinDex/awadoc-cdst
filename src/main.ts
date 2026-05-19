import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  app.enableVersioning({ type: VersioningType.URI });

  // Global validation: strict — drop unknown fields, reject if any are present.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger UI = the "Web App" deliverable.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AwaDoc CDST')
    .setDescription(
      'Deterministic Clinical Decision Support Tool — Febrile illness in a child under 5 ' +
        '(ruleset v1.0.0-IMCI-NG, Nigerian epidemiological calibration). ' +
        'Non-diagnostic. Recommendations only. Engine never autonomously prescribes or orders treatment.',
    )
    .setVersion('1.0.0')
    .addTag('triage', 'Run the deterministic triage engine.')
    .addTag('audit', 'Read audits and record clinician disposition.')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { defaultModelsExpandDepth: 2, docExpansion: 'list' },
  });

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  logger.log(`AwaDoc CDST listening on http://localhost:${port}`);
  logger.log(`Swagger UI:   http://localhost:${port}/docs`);
}

bootstrap();
