/**
 * Safety-override tests — Task 3 deliverable.
 *
 *   - Minimum 3 unit tests validating the override behaviour.
 *   - At least one with contradictory inputs (red flag + low-acuity differential).
 *   - At least one validating non-escalation when no red flags are present.
 *
 * This file ships 6 tests covering all required cases plus a few extras.
 */

import { evaluate } from '../engine/rules-engine';
import { buildInput, FIXED_TIMESTAMP, loadRuleset } from './test-helpers';

describe('Safety override layer', () => {
  const ruleset = loadRuleset();

  it('TEST 1 (contradictory inputs): red flag fires even when differentials suggest mild viral URTI', () => {
    // Mild presentation that on its own would score as routine viral URTI...
    const input = buildInput({
      demographics: { ageMonths: 30, sex: 'male' },
      vitals: { temperatureC: 37.6 },
      history: { feverDurationDays: 1 },
      symptoms: { cough: true },
      // ...but the clinician observed convulsions.
      redFlagsObserved: { convulsions: true },
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.triage.level).toBe('Emergency');
    expect(out.evaluationPath).toBe('safety-override');
    expect(out.redFlags.map((f) => f.id)).toContain('RF_CONVULSIONS');
    // Differentials are still surfaced so the clinician sees reasoning,
    // but the triage level is non-negotiable.
    expect(out.differentials.length).toBeGreaterThan(0);
  });

  it('TEST 2 (non-escalation): no red flags → triage is NOT Emergency', () => {
    const input = buildInput({
      demographics: { ageMonths: 36, sex: 'female' },
      vitals: { temperatureC: 38.2, spo2: 98, respiratoryRate: 28 },
      history: { feverDurationDays: 1, recentTravelMalariaZone: false },
      symptoms: { cough: false },
      redFlagsObserved: {},
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.evaluationPath).toBe('standard');
    expect(out.triage.level).not.toBe('Emergency');
    expect(out.redFlags).toHaveLength(0);
  });

  it('TEST 3 (multiple red flags): all triggered flags are surfaced', () => {
    const input = buildInput({
      demographics: { ageMonths: 18, sex: 'female' },
      vitals: { temperatureC: 41.2, spo2: 86 },
      history: { feverDurationDays: 3 },
      redFlagsObserved: { lethargyOrUnconscious: true, severeRespiratoryDistress: true },
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.triage.level).toBe('Emergency');
    expect(out.evaluationPath).toBe('safety-override');
    const triggeredIds = out.redFlags.map((f) => f.id);
    // boolean flags
    expect(triggeredIds).toContain('RF_LETHARGY_UNCONSCIOUS');
    expect(triggeredIds).toContain('RF_RESP_DISTRESS');
    // rule-based flags
    expect(triggeredIds).toContain('RF_SPO2_BELOW_90');
    expect(triggeredIds).toContain('RF_HYPERPYREXIA');
  });

  it('TEST 4 (rule-based red flag): SpO2 = 88 alone triggers Emergency', () => {
    const input = buildInput({
      vitals: { temperatureC: 38.0, spo2: 88 },
      redFlagsObserved: {},
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.triage.level).toBe('Emergency');
    expect(out.redFlags.map((f) => f.id)).toContain('RF_SPO2_BELOW_90');
  });

  it('TEST 5 (override recommendations promoted): emergency response uses redFlagOverrideActions', () => {
    const input = buildInput({
      redFlagsObserved: { convulsions: true },
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.recommendedActions).toEqual(ruleset.redFlagOverrideActions);
    // The actions should mention airway protection first.
    expect(out.recommendedActions[0]).toMatch(/airway/i);
  });

  it('TEST 6 (override path is irreversible): even with strong viral URTI signal, convulsions force Emergency', () => {
    // High signal for "mild viral URTI" — low-acuity baseline by design...
    const input = buildInput({
      demographics: { ageMonths: 48, sex: 'male' },
      vitals: { temperatureC: 37.4, spo2: 99, respiratoryRate: 22 },
      history: {
        feverDurationDays: 1,
        vaccinationUpToDate: true,
        recentTravelMalariaZone: false,
      },
      symptoms: {},
      // ...combined with a single danger sign.
      redFlagsObserved: { convulsions: true },
    });

    const out = evaluate(input, ruleset, FIXED_TIMESTAMP);

    expect(out.triage.level).toBe('Emergency');
    expect(out.triage.rationale).toMatch(/safety override/i);
  });
});
