import {
  describePredicate,
  evaluatePredicate,
  getFieldValue,
} from '../engine/predicate-evaluator';

describe('predicate-evaluator', () => {
  const input = {
    vitals: { spo2: 88, temperatureC: 39.5 },
    redFlagsObserved: { convulsions: true },
    demographics: { ageMonths: 2 },
  };

  describe('getFieldValue', () => {
    it('reads dotted paths', () => {
      expect(getFieldValue(input, 'vitals.spo2')).toBe(88);
      expect(getFieldValue(input, 'demographics.ageMonths')).toBe(2);
    });
    it('returns undefined for missing paths', () => {
      expect(getFieldValue(input, 'vitals.missing')).toBeUndefined();
      expect(getFieldValue(input, 'nothing.here')).toBeUndefined();
    });
  });

  describe('leaf operators', () => {
    it('lt / lte / gt / gte work on numbers', () => {
      expect(evaluatePredicate(input, { field: 'vitals.spo2', op: 'lt', value: 90 })).toBe(true);
      expect(evaluatePredicate(input, { field: 'vitals.spo2', op: 'gte', value: 88 })).toBe(true);
      expect(evaluatePredicate(input, { field: 'vitals.spo2', op: 'gt', value: 90 })).toBe(false);
    });
    it('eq matches booleans', () => {
      expect(
        evaluatePredicate(input, {
          field: 'redFlagsObserved.convulsions',
          op: 'eq',
          value: true,
        }),
      ).toBe(true);
    });
    it('isNull / isNotNull treat missing fields as null', () => {
      expect(evaluatePredicate(input, { field: 'vitals.respiratoryRate', op: 'isNull' })).toBe(true);
      expect(evaluatePredicate(input, { field: 'vitals.temperatureC', op: 'isNotNull' })).toBe(true);
    });
  });

  describe('composite operators', () => {
    it('all = AND', () => {
      const p = {
        all: [
          { field: 'vitals.temperatureC', op: 'lt' as const, value: 35.5 },
          { field: 'demographics.ageMonths', op: 'lt' as const, value: 3 },
        ],
      };
      // temperature is 39.5, not <35.5 → AND fails
      expect(evaluatePredicate(input, p)).toBe(false);
    });
    it('any = OR', () => {
      const p = {
        any: [
          { field: 'vitals.temperatureC', op: 'lt' as const, value: 35.5 },
          { field: 'redFlagsObserved.convulsions', op: 'eq' as const, value: true },
        ],
      };
      // convulsions = true → OR succeeds
      expect(evaluatePredicate(input, p)).toBe(true);
    });
    it('not negates', () => {
      const p = { not: { field: 'redFlagsObserved.convulsions', op: 'eq' as const, value: true } };
      expect(evaluatePredicate(input, p)).toBe(false);
    });
  });

  describe('describePredicate', () => {
    it('renders human-readable strings', () => {
      expect(describePredicate({ field: 'vitals.spo2', op: 'lt', value: 90 })).toBe(
        'vitals.spo2 < 90',
      );
      expect(
        describePredicate({
          all: [
            { field: 'a', op: 'eq', value: 1 },
            { field: 'b', op: 'gte', value: 2 },
          ],
        }),
      ).toBe('(a == 1 AND b >= 2)');
    });
  });

  describe('safety', () => {
    it('does not use eval — predicate-evaluator code contains no `eval` or `new Function`', () => {
      // Sanity check at the source-file level. This is a structural assertion.
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '..', 'engine', 'predicate-evaluator.ts'),
        'utf-8',
      );
      expect(src).not.toMatch(/\beval\s*\(/);
      expect(src).not.toMatch(/new\s+Function\s*\(/);
    });
  });
});
