import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller';
import { AuditProcessor } from './audit.processor';
import { AUDIT_QUEUE_NAME, AuditService } from './audit.service';
import { EncounterAudit, EncounterAuditSchema } from './schemas/encounter-audit.schema';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: AUDIT_QUEUE_NAME,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(config.get<string>('REDIS_PORT', '6379'), 10),
        },
      }),
    }),
    MongooseModule.forFeature([{ name: EncounterAudit.name, schema: EncounterAuditSchema }]),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditProcessor],
  exports: [AuditService],
})
export class AuditModule {}
