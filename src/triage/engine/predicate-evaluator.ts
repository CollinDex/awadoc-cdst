/**
 * Pure predicate evaluator for the rules engine.
 *
 * Why a hand-rolled evaluator instead of a string-DSL approach?
 * - Clinical software must survive a security review. Runtime code synthesis is a non-starter.
 * - The expression surface area is small (12 operators, all numeric/boolean/null).
 *   A 60-line evaluator is more auditable than a dependency.
 * - Deterministic and stateless — same input twice always yields the same boolean.
 */

import { LeafPredicate, Predicate } from './types';

/** Safely read a dotted path like "vitals.spo2" from a nested object. */
export function getFieldValue(input: unknown, path: string): unknown {
  if (input === null || input === undefined) return undefined;
  const parts = path.split('.');
  let current: unknown = input;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isLeaf(p: Predicate): p is LeafPredicate {
  return typeof (p as LeafPredicate).field === 'string';
}

function evaluateLeaf(input: unknown, p: LeafPredicate): boolean {
  const actual = getFieldValue(input, p.field);

  switch (p.op) {
    case 'isNull':
      return actual === null || actual === undefined;
    case 'isNotNull':
      return actual !== null && actual !== undefined;
    case 'eq':
      return actual === p.value;
    case 'neq':
      return actual !== p.value;
    case 'lt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual < p.value;
    case 'lte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual <= p.value;
    case 'gt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual > p.value;
    case 'gte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual >= p.value;
    case 'in':
      return Array.isArray(p.value) && (p.value as unknown[]).includes(actual);
    case 'notIn':
      return Array.isArray(p.value) && !(p.value as unknown[]).includes(actual);
    default: {
      // Exhaustiveness check — TS will error here if a new op is added without a case.
      const _exhaustive: never = p.op;
      throw new Error(`Unknown predicate op: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Evaluate a (possibly composite) predicate against a structured input object.
 */
export function evaluatePredicate(input: unknown, predicate: Predicate): boolean {
  if (isLeaf(predicate)) {
    return evaluateLeaf(input, predicate);
  }
  if ('all' in predicate) {
    return predicate.all.every((p) => evaluatePredicate(input, p));
  }
  if ('any' in predicate) {
    return predicate.any.some((p) => evaluatePredicate(input, p));
  }
  if ('not' in predicate) {
    return !evaluatePredicate(input, predicate.not);
  }
  throw new Error('Malformed predicate: must contain field, all, any, or not');
}

/**
 * Human-readable rendering of a predicate — used to populate the audit trail
 * `triggeredBy` field so a clinician (or reviewing MD) can see *exactly* what
 * condition fired.
 */
export function describePredicate(predicate: Predicate): string {
  if (isLeaf(predicate)) {
    const v = predicate.value;
    switch (predicate.op) {
      case 'isNull':
        return `${predicate.field} is null`;
      case 'isNotNull':
        return `${predicate.field} is not null`;
      case 'eq':
        return `${predicate.field} == ${JSON.stringify(v)}`;
      case 'neq':
        return `${predicate.field} != ${JSON.stringify(v)}`;
      case 'lt':
        return `${predicate.field} < ${v}`;
      case 'lte':
        return `${predicate.field} <= ${v}`;
      case 'gt':
        return `${predicate.field} > ${v}`;
      case 'gte':
        return `${predicate.field} >= ${v}`;
      case 'in':
        return `${predicate.field} in ${JSON.stringify(v)}`;
      case 'notIn':
        return `${predicate.field} not in ${JSON.stringify(v)}`;
    }
  }
  if ('all' in predicate) return `(${predicate.all.map(describePredicate).join(' AND ')})`;
  if ('any' in predicate) return `(${predicate.any.map(describePredicate).join(' OR ')})`;
  if ('not' in predicate) return `NOT ${describePredicate(predicate.not)}`;
  return 'unknown';
}
