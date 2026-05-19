/**
 * Audit enqueue service.
 *
 * The triage service calls `enqueueAudit(...)` without awaiting persistence.
 * Bull → Redis → AuditProcessor → MongoDB is fully async, so DB latency never
 * blocks the clinician's response.
 *
 * Failure handling: the Bull queue retries with exponential backoff. After
 * `attempts` retries exhaust, the job lands in the failed-queue dead-letter
 * area. The processor logs each failure with the auditId so dead records can
 * be replayed manually.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bull';
import { TriageInput, TriageOutput } from '../triage/engine/types';

export const AUDIT_QUEUE_NAME = 'encounter-audit';
export const AUDIT_JOB_NAME = 'persist-encounter';

export interface AuditJobPayload {
  auditId: string;
  sessionId: string;
  clinicianId?: string;
  patientId?: string;
  externalEncounterId?: string;
  receivedAt: string;
  rulesetId: string;
  rulesetVersion: string;
  input: TriageInput;
  output: TriageOutput;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectQueue(AUDIT_QUEUE_NAME) private readonly queue: Queue) {}

  async enqueueAudit(payload: AuditJobPayload): Promise<void> {
    await this.queue.add(AUDIT_JOB_NAME, payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 24 * 3600 }, // keep recently-succeeded for 24h debugging
      removeOnFail: false, // keep failed jobs forever for medico-legal replay
    });
  }
}
