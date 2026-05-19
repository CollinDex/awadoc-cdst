import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Ruleset } from './types';

/**
 * Loads the active ruleset from disk *once* at boot and freezes it in RAM.
 *
 * Why freeze? Two reasons:
 *   1. Determinism — once a request starts evaluation, no other code path can
 *      mutate the rule data mid-flight. This is required for "same input ×
 *      1000 ⇒ same output" guarantees.
 *   2. Auditability — every audit record pins the exact `rulesetId@version`
 *      that was active at decision time. The only way that version can change
 *      is a deliberate server restart with a new file pointer.
 *
 * Hot-reloading is intentionally NOT supported. Rulesets change via a
 * deployment with a clinical-advisory PR review trail, never at runtime.
 */
@Injectable()
export class RulesetLoader implements OnModuleInit {
  private readonly logger = new Logger(RulesetLoader.name);
  private ruleset: Ruleset | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const relative =
      this.config.get<string>('ACTIVE_RULESET_FILE') ??
      'rulesets/febrile-child-under-5/v1.0.0-IMCI-NG.json';

    // Resolve against repo root so the path works whether we're running
    // from `src/` (ts-node), `dist/` (compiled), or jest.
    const candidates = [
      path.resolve(process.cwd(), relative),
      path.resolve(__dirname, '..', '..', '..', relative),
    ];

    const resolved = candidates.find((p) => fs.existsSync(p));
    if (!resolved) {
      throw new Error(
        `RulesetLoader: cannot find ruleset file. Tried:\n  ${candidates.join('\n  ')}`,
      );
    }

    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw) as Ruleset;

    // Basic structural validation. Anything beyond this is the engine's problem.
    if (!parsed.rulesetId || !parsed.version || !Array.isArray(parsed.differentials)) {
      throw new Error(
        `RulesetLoader: malformed ruleset at ${resolved}. Required fields missing.`,
      );
    }
    if (parsed.differentials.length === 0) {
      throw new Error(`RulesetLoader: ruleset has no differentials.`);
    }

    this.ruleset = deepFreeze(parsed);
    this.logger.log(
      `Loaded ruleset ${parsed.rulesetId}@${parsed.version} ` +
        `(${parsed.differentials.length} differentials, ${parsed.redFlags.length} red flags) ` +
        `from ${resolved}`,
    );
  }

  /** Returns the immutable, frozen active ruleset. Safe to share across requests. */
  getActiveRuleset(): Ruleset {
    if (!this.ruleset) {
      throw new Error('RulesetLoader: ruleset not loaded. Did onModuleInit run?');
    }
    return this.ruleset;
  }

  /** Test-only hook to inject a ruleset without disk I/O. */
  loadFromObject(rs: Ruleset): void {
    this.ruleset = deepFreeze(rs);
  }
}

/** Recursive Object.freeze — handles arrays + nested objects. */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}
