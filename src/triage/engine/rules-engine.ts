/**
 * The deterministic clinical rules engine.
 *
 * Contract
 * --------
 * - Pure function: `evaluate(input, ruleset) → TriageOutput`. No I/O, no
 *   mutation, no Date.now() leaking into output ordering.
 * - The caller supplies `evaluatedAt` so tests can pin the timestamp and the
 *   audit interceptor can stamp request time without the engine knowing about
 *   either.
 * - For a given (input, ruleset, evaluatedAt) tuple, the output is byte-identical
 *   across 1000+ calls. This is verified by a determinism unit test.
 *
 * Flow
 * ----
 *   1. Evaluate red flags (delegated to `safety-override.ts`).
 *   2. If any red flag fired → build Emergency response (override path).
 *      The differential ranking is still computed so the clinician sees
 *      the engine's reasoning, but triage.level is fixed at "Emergency".
 *   3. Otherwise → standard path:
 *       a. Compute each differential's probability =
 *          baseWeight + sum(matching modifier deltas).
 *       b. Clamp to [0, ∞), then normalize so probabilities sum to 1.
 *       c. Rank descending, ties broken by base-weight then by id (stable).
 *       d. Apply triage rules to pick a level.
 *       e. Compose recommendedActions from the top differential.
 *   4. Run missing-information checks and append to the response.
 */

import { evaluatePredicate } from './predicate-evaluator';
import { evaluateRedFlags } from './safety-override';
import {
  Differential,
  EvaluationPath,
  MissingInfoItem,
  RankedDifferential,
  Ruleset,
  TriageInput,
  TriageLevel,
  TriageOutput,
  TriggeredRedFlag,
} from './types';

const PROBABILITY_DECIMAL_PLACES = 4;

function roundProb(n: number): number {
  const factor = 10 ** PROBABILITY_DECIMAL_PLACES;
  return Math.round(n * factor) / factor;
}

function rankDifferentials(
  input: TriageInput,
  ruleset: Ruleset,
): RankedDifferential[] {
  // Step 1: compute raw weights with rationale assembly.
  const raw: Array<{ dx: Differential; weight: number; ranked: RankedDifferential }> = [];
  for (const dx of ruleset.differentials) {
    let weight = dx.baseWeight;
    const triggered: RankedDifferential['triggeredModifiers'] = [];
    for (const mod of dx.modifiers) {
      if (evaluatePredicate(input, mod.predicate)) {
        weight += mod.delta;
        triggered.push({ id: mod.id, delta: mod.delta, rationale: mod.rationale });
      }
    }
    const safeWeight = Math.max(0, weight);
    raw.push({
      dx,
      weight: safeWeight,
      ranked: {
        id: dx.id,
        label: dx.label,
        probability: 0, // filled after normalization
        rationale: composeRationale(dx, triggered),
        triggeredModifiers: triggered,
      },
    });
  }

  // Step 2: normalize so probabilities sum to 1.0.
  const total = raw.reduce((acc, r) => acc + r.weight, 0);
  for (const r of raw) {
    r.ranked.probability = roundProb(total > 0 ? r.weight / total : 0);
  }

  // Step 3: stable ranking — probability DESC, then baseWeight DESC, then id ASC.
  raw.sort((a, b) => {
    if (b.ranked.probability !== a.ranked.probability) {
      return b.ranked.probability - a.ranked.probability;
    }
    if (b.dx.baseWeight !== a.dx.baseWeight) {
      return b.dx.baseWeight - a.dx.baseWeight;
    }
    return a.dx.id.localeCompare(b.dx.id);
  });

  return raw.map((r) => r.ranked);
}

function composeRationale(
  dx: Differential,
  triggered: RankedDifferential['triggeredModifiers'],
): string {
  if (triggered.length === 0) return dx.baseRationale;
  const modPieces = triggered.map((m) => `${m.rationale} (Δ ${m.delta >= 0 ? '+' : ''}${m.delta})`);
  return `${dx.baseRationale} ${modPieces.join(' ')}`;
}

function pickTriageLevel(
  ranked: RankedDifferential[],
  ruleset: Ruleset,
): { level: TriageLevel; rationale: string } {
  const top = ranked[0];
  if (!top) {
    return {
      level: 'Routine',
      rationale: 'No differentials computed — defaulting to Routine.',
    };
  }

  const rules = ruleset.triageRules;
  if (
    rules.urgentTopDifferentialIds.includes(top.id) &&
    top.probability >= rules.urgentMinProbability
  ) {
    return {
      level: 'Urgent',
      rationale: `Top differential ${top.label} (p=${top.probability}) is a high-acuity condition above the urgent threshold (≥ ${rules.urgentMinProbability}).`,
    };
  }
  if (top.probability >= rules.semiUrgentMinProbability) {
    return {
      level: 'Semi-Urgent',
      rationale: `Top differential ${top.label} (p=${top.probability}) is above the semi-urgent threshold (≥ ${rules.semiUrgentMinProbability}) but does not meet urgent criteria.`,
    };
  }
  return {
    level: 'Routine',
    rationale: `Top differential ${top.label} (p=${top.probability}) is below the semi-urgent threshold. No red flags. Routine review with safety-net advice.`,
  };
}

function runMissingInfoChecks(
  input: TriageInput,
  ruleset: Ruleset,
): MissingInfoItem[] {
  const items: MissingInfoItem[] = [];
  for (const check of ruleset.missingInfoChecks) {
    if (evaluatePredicate(input, check.predicate)) {
      // The "field" string is informational: it shows which field triggered the
      // missing-info prompt. We pull it from the first leaf of the predicate.
      const field = extractFirstField(check.predicate) ?? check.id;
      items.push({ id: check.id, field, prompt: check.prompt });
    }
  }
  return items;
}

function extractFirstField(predicate: unknown): string | null {
  if (predicate && typeof predicate === 'object') {
    const p = predicate as Record<string, unknown>;
    if (typeof p.field === 'string') return p.field as string;
    if (Array.isArray(p.all) && p.all.length > 0) return extractFirstField(p.all[0]);
    if (Array.isArray(p.any) && p.any.length > 0) return extractFirstField(p.any[0]);
    if (p.not) return extractFirstField(p.not);
  }
  return null;
}

/**
 * Main entry point. Pure, deterministic.
 *
 * @param input         Validated triage input (already type-checked by DTO).
 * @param ruleset       Frozen ruleset, from RulesetLoader.
 * @param evaluatedAt   ISO timestamp the caller assigns to this evaluation.
 *                      Surfaced to the audit log; not used in decision logic.
 */
export function evaluate(
  input: TriageInput,
  ruleset: Ruleset,
  evaluatedAt: string,
): TriageOutput {
  const triggeredRedFlags: TriggeredRedFlag[] = evaluateRedFlags(input, ruleset);
  const ranked = rankDifferentials(input, ruleset);
  const missingInfo = runMissingInfoChecks(input, ruleset);

  let level: TriageLevel;
  let rationale: string;
  let recommendedActions: string[];
  let evaluationPath: EvaluationPath;

  if (triggeredRedFlags.length > 0) {
    // SAFETY OVERRIDE — non-negotiable.
    evaluationPath = 'safety-override';
    level = 'Emergency';
    rationale = `${triggeredRedFlags.length} red flag${triggeredRedFlags.length === 1 ? '' : 's'} triggered: ${triggeredRedFlags
      .map((f) => f.label)
      .join('; ')}. Safety override engaged — triage is fixed at Emergency irrespective of differential ranking.`;
    recommendedActions = ruleset.redFlagOverrideActions.slice();
  } else {
    evaluationPath = 'standard';
    const triage = pickTriageLevel(ranked, ruleset);
    level = triage.level;
    rationale = triage.rationale;

    const top = ranked[0];
    recommendedActions = top
      ? ruleset.differentials.find((d) => d.id === top.id)?.recommendedActions.slice() ?? []
      : [];
  }

  return {
    rulesetId: ruleset.rulesetId,
    rulesetVersion: ruleset.version,
    evaluatedAt,
    evaluationPath,
    triage: { level, rationale },
    redFlags: triggeredRedFlags,
    differentials: ranked,
    recommendedActions,
    missingInfo,
  };
}
