/**
 * Immutable audit record for one CDST encounter.
 *
 * Medico-legal contract
 * ---------------------
 * - Inputs (structured, not free text) — see `input`.
 * - Engine output in full — see `output`.
 * - Ruleset version active at the time of the decision — see `rulesetVersion`.
 * - Timestamp + session id — see `receivedAt` + `sessionId`.
 * - Disposition (accepted / ignored / overridden) — populated later by
 *   PATCH /v1/encounters/:auditId/disposition.
 *
 * Immutability: Mongoose schema is configured with `strict: 'throw'` so
 * unknown fields are rejected. The audit controller only allows
 * appending disposition data; no update endpoint mutates input/output/ruleset
 * version after the record is created.
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EncounterAuditDocument = HydratedDocument<EncounterAudit>;

@Schema({
  collection: 'encounters',
  strict: 'throw',
  timestamps: true,
  minimize: false,
})
export class EncounterAudit {
  @Prop({ type: String, required: true, unique: true, index: true })
  auditId!: string;

  @Prop({ type: String, required: true, index: true })
  sessionId!: string;

  @Prop({ type: String, required: false, index: true })
  clinicianId?: string;

  @Prop({ type: String, required: false, index: true })
  patientId?: string;

  @Prop({ type: String, required: false, index: true })
  externalEncounterId?: string;

  @Prop({ type: Date, required: true, index: true })
  receivedAt!: Date;

  @Prop({ type: String, required: true, index: true })
  rulesetId!: string;

  @Prop({ type: String, required: true, index: true })
  rulesetVersion!: string;

  @Prop({ type: String, required: true, enum: ['safety-override', 'standard'], index: true })
  evaluationPath!: 'safety-override' | 'standard';

  @Prop({ type: String, required: true, index: true })
  triageLevel!: string;

  // Free-form Mixed types — we have already validated input via DTO and shaped
  // output via the engine. The Mongoose schema does not re-validate the contents.
  @Prop({ type: Object, required: true })
  input!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  output!: Record<string, unknown>;

  // -------- Disposition (clinician decision, appended later) --------

  @Prop({ type: String, required: false, enum: ['accepted', 'ignored', 'overridden'] })
  dispositionAction?: 'accepted' | 'ignored' | 'overridden';

  @Prop({ type: String, required: false })
  dispositionReason?: string;

  @Prop({ type: String, required: false })
  dispositionClinicianId?: string;

  @Prop({ type: Date, required: false })
  dispositionAt?: Date;
}

export const EncounterAuditSchema = SchemaFactory.createForClass(EncounterAudit);
