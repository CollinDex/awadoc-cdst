/**
 * Canonical types for the deterministic clinical rules engine.
 *
 * Design notes
 * ------------
 * - Predicates are *structured*, not strings. There is no `eval()` in this codebase.
 *   A predicate is a leaf comparison `{ field, op, value }` or a composite
 *   `{ all: [...] }` / `{ any: [...] }` / `{ not: ... }`.
 * - The engine is a pure function: `evaluate(input, ruleset) → output`. No I/O.
 * - Rulesets are loaded once at boot and `Object.freeze`d, guaranteeing
 *   that two requests with identical inputs in the same process produce
 *   byte-identical outputs.
 */

export type TriageLevel = 'Emergency' | 'Urgent' | 'Semi-Urgent' | 'Routine';

export type EvaluationPath = 'safety-override' | 'standard';

export type PredicateOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'notIn'
  | 'isNull'
  | 'isNotNull';

export type LeafPredicate = {
  field: string;
  op: PredicateOp;
  value?: unknown;
};

export type CompositePredicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate };

export type Predicate = LeafPredicate | CompositePredicate;

export interface RedFlag {
  id: string;
  label: string;
  explanation: string;
  predicate: Predicate;
}

export interface DifferentialModifier {
  id: string;
  predicate: Predicate;
  delta: number;
  rationale: string;
}

export interface Differential {
  id: string;
  label: string;
  baseWeight: number;
  baseRationale: string;
  modifiers: DifferentialModifier[];
  recommendedActions: string[];
}

export interface MissingInfoCheck {
  id: string;
  predicate: Predicate;
  prompt: string;
}

export interface Ruleset {
  rulesetId: string;
  version: string;
  publishedAt: string;
  appliesTo: {
    chiefComplaintPrimary: string;
    ageMinMonths: number;
    ageMaxMonths: number;
  };
  provenance: {
    summary: string;
    sources: string[];
  };
  inputSchema: Record<string, unknown>;
  redFlags: RedFlag[];
  redFlagOverrideActions: string[];
  differentials: Differential[];
  triageRules: {
    urgentTopDifferentialIds: string[];
    urgentMinProbability: number;
    semiUrgentMinProbability: number;
  };
  missingInfoChecks: MissingInfoCheck[];
}

// -------- Engine input/output --------

export interface TriageInput {
  // Identity (optional in the prototype — no auth enforced)
  sessionId?: string;
  clinicianId?: string;
  patientId?: string;
  externalEncounterId?: string;

  demographics: {
    ageMonths: number;
    sex: 'male' | 'female' | 'other';
    weightKg?: number;
  };
  vitals: {
    temperatureC: number;
    heartRate?: number;
    respiratoryRate?: number;
    spo2?: number;
    capillaryRefillSec?: number;
  };
  history: {
    feverDurationDays: number;
    vaccinationUpToDate?: boolean;
    recentTravelMalariaZone?: boolean;
    knownSickleCell?: boolean;
    knownHIVExposure?: boolean;
  };
  symptoms: Partial<Record<
    | 'cough' | 'fastBreathing' | 'chestIndrawing'
    | 'vomiting' | 'diarrhea' | 'bloodyStool'
    | 'rash' | 'koplikSpots'
    | 'neckStiffness' | 'bulgingFontanelle'
    | 'earPain' | 'earDischarge'
    | 'poorFeeding' | 'sunkenEyes' | 'skinPinchSlow',
    boolean
  >>;
  redFlagsObserved: Partial<Record<
    | 'convulsions' | 'lethargyOrUnconscious'
    | 'unableToDrinkOrBreastfeed' | 'vomitingEverything'
    | 'severeRespiratoryDistress' | 'centralCyanosis'
    | 'severeDehydration' | 'stridorAtRest',
    boolean
  >>;
}

export interface TriggeredRedFlag {
  id: string;
  label: string;
  explanation: string;
  triggeredBy: string;
}

export interface RankedDifferential {
  id: string;
  label: string;
  probability: number;
  rationale: string;
  triggeredModifiers: Array<{ id: string; delta: number; rationale: string }>;
}

export interface MissingInfoItem {
  id: string;
  field: string;
  prompt: string;
}

export interface TriageOutput {
  rulesetId: string;
  rulesetVersion: string;
  evaluatedAt: string;
  evaluationPath: EvaluationPath;
  triage: {
    level: TriageLevel;
    rationale: string;
  };
  redFlags: TriggeredRedFlag[];
  differentials: RankedDifferential[];
  recommendedActions: string[];
  missingInfo: MissingInfoItem[];
}
