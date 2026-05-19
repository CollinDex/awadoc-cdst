import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bull';
import { Model } from 'mongoose';
import { AUDIT_JOB_NAME, AUDIT_QUEUE_NAME, AuditJobPayload } from './audit.service';
import { EncounterAudit, EncounterAuditDocument } from './schemas/encounter-audit.schema';

/**
 * Bull consumer that persists each encounter audit to MongoDB.
 * Idempotent: `auditId` has a unique index, so retries of the same job
 * cannot create duplicate audit rows.
 */
@Processor(AUDIT_QUEUE_NAME)
export class AuditProcessor {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    @InjectModel(EncounterAudit.name)
    private readonly model: Model<EncounterAuditDocument>,
  ) {}

  @Process(AUDIT_JOB_NAME)
  async persist(job: Job<AuditJobPayload>): Promise<void> {
    const p = job.data;

    // Pull the few denormalized fields we want indexed for fast querying.
    const triageLevel = p.output.triage?.level ?? 'Unknown';
    const evaluationPath = p.output.evaluationPath ?? 'standard';

    try {
      await this.model.create({
        auditId: p.auditId,
        sessionId: p.sessionId,
        clinicianId: p.clinicianId,
        patientId: p.patientId,
        externalEncounterId: p.externalEncounterId,
        receivedAt: new Date(p.receivedAt),
        rulesetId: p.rulesetId,
        rulesetVersion: p.rulesetVersion,
        evaluationPath,
        triageLevel,
        input: p.input,
        output: p.output,
      });
      this.logger.debug(`Persisted audit ${p.auditId} (${triageLevel}, ${evaluationPath})`);
    } catch (err: unknown) {
      // Duplicate key (E11000) on auditId means a previous attempt already
      // succeeded — safe to swallow so Bull marks the job complete.
      const e = err as { code?: number; message?: string };
      if (e?.code === 11000) {
        this.logger.warn(`Audit ${p.auditId} already exists — treating as success.`);
        return;
      }
      this.logger.error(
        `Failed to persist audit ${p.auditId}: ${e?.message ?? String(err)}`,
      );
      throw err; // let Bull retry per backoff config
    }
  }
}
