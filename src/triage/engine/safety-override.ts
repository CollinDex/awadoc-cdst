/**
 * If any red flag fires, this module short-circuits the engine and returns
 * a triage object with level = "Emergency". The differential ranking is
 * still computed and surfaced (so the clinician sees the engine's reasoning),
 * but the triage level itself is non-negotiable.
 *
 * This logic lives in its own module — separate from `rules-engine.ts` — so
 * that:
 *   - The override path can be unit-tested in isolation.
 *   - Reviewers reading the code can verify with one glance that the override
 *     happens BEFORE the differential ranking is allowed to influence triage.
 */

import { describePredicate, evaluatePredicate } from './predicate-evaluator';
import { Ruleset, TriageInput, TriggeredRedFlag } from './types';

/**
 * Evaluate every red-flag predicate in the ruleset against the input.
 * Returns the list of red flags that fired, in the order declared in the
 * ruleset (deterministic ordering — critical for byte-identical outputs).
 */
export function evaluateRedFlags(
  input: TriageInput,
  ruleset: Ruleset,
): TriggeredRedFlag[] {
  const triggered: TriggeredRedFlag[] = [];
  for (const flag of ruleset.redFlags) {
    if (evaluatePredicate(input, flag.predicate)) {
      triggered.push({
        id: flag.id,
        label: flag.label,
        explanation: flag.explanation,
        triggeredBy: describePredicate(flag.predicate),
      });
    }
  }
  return triggered;
}
