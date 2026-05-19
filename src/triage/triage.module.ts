import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RulesetLoader } from './engine/ruleset-loader';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [AuditModule],
  controllers: [TriageController],
  providers: [RulesetLoader, TriageService],
  exports: [RulesetLoader],
})
export class TriageModule {}
