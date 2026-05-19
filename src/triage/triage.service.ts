/**
 * Orchestrates a single triage request.
 *
 * Pipeline
 * --------
 *   DTO  →  evaluate(input, ruleset, evaluatedAt)  →  enqueue audit  →  return response
 *
 * The engine call is synchronous and microsecond-fast (no I/O). The audit
 * write is fired off to the Bull queue and we do NOT await it — the
 * clinician's response time is not coupled to MongoDB latency.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service';
import { TriageRequestDto } from '../common/dto/triage-request.dto';
import { RulesetLoader } from './engine/ruleset-loader';
import { evaluate } from './engine/rules-engine';
import { TriageInput, TriageOutput } from './engine/types';

export interface TriageResponse extends TriageOutput {
  auditId: string;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private readonly rulesetLoader: RulesetLoader,
    private readonly auditService: AuditService,
  ) {}

  async runTriage(dto: TriageRequestDto): Promise<TriageResponse> {
    const ruleset = this.rulesetLoader.getActiveRuleset();
    const evaluatedAt = new Date().toISOString();
    const auditId = `enc_${ulid()}`;
    const sessionId = dto.sessionId ?? `sess_${ulid()}`;

    // DTO → TriageInput. The shapes already match; this assignment is structural,
    // not a type-laundering hack. We default symptoms/redFlagsObserved to {} so
    // the engine never has to defend against `undefined` sub-objects.
    const input: TriageInput = {
      ...dto,
      sessionId,
      symptoms: dto.symptoms ?? {},
      redFlagsObserved: dto.redFlagsObserved ?? {},
    };

    const output = evaluate(input, ruleset, evaluatedAt);

    // Fire-and-forget audit enqueue. We log (but do not throw) if Bull is down.
    this.auditService
      .enqueueAudit({
        auditId,
        sessionId,
        clinicianId: dto.clinicianId,
        patientId: dto.patientId,
        externalEncounterId: dto.externalEncounterId,
        receivedAt: evaluatedAt,
        rulesetId: ruleset.rulesetId,
        rulesetVersion: ruleset.version,
        input,
        output,
      })
      .catch((err) =>
        this.logger.error(`Audit enqueue failed for ${auditId}: ${err?.message ?? err}`),
      );

    return { ...output, auditId };
  }
}
