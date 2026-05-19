/**
 * Shared helpers for engine unit tests. Loads the production ruleset from disk
 * so the tests exercise the real clinical content, not a mock.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Ruleset, TriageInput } from '../engine/types';

const RULESET_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'rulesets',
  'febrile-child-under-5',
  'v1.0.0-IMCI-NG.json',
);

export function loadRuleset(): Ruleset {
  const raw = fs.readFileSync(RULESET_PATH, 'utf-8');
  return JSON.parse(raw) as Ruleset;
}

/** Convenience: build a TriageInput with sensible defaults, then override. */
export function buildInput(overrides: Partial<TriageInput> = {}): TriageInput {
  const base: TriageInput = {
    sessionId: 'sess_test',
    demographics: { ageMonths: 24, sex: 'female' },
    vitals: { temperatureC: 38.5 },
    history: { feverDurationDays: 2 },
    symptoms: {},
    redFlagsObserved: {},
  };
  return {
    ...base,
    ...overrides,
    demographics: { ...base.demographics, ...(overrides.demographics ?? {}) },
    vitals: { ...base.vitals, ...(overrides.vitals ?? {}) },
    history: { ...base.history, ...(overrides.history ?? {}) },
    symptoms: { ...base.symptoms, ...(overrides.symptoms ?? {}) },
    redFlagsObserved: { ...base.redFlagsObserved, ...(overrides.redFlagsObserved ?? {}) },
  };
}

export const FIXED_TIMESTAMP = '2026-05-19T10:00:00.000Z';
