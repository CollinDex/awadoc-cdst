# Audit Trail Design — Medico-Legal Accountability and Iterative Improvement

This document explains *why* the audit schema looks the way it does and how the design supports two non-overlapping needs: (1) medico-legal defence of a single past decision, and (2) systematic improvement of the ruleset over time.

---

## 1. What every audit record captures

Per the assessment requirement, each `encounters` document persists:

| Field | Purpose |
|---|---|
| `auditId`         | Server-generated ULID (`enc_…`). Unique, indexed, used as the disposition target. |
| `sessionId`       | Logical session — multiple encounters in the same triage session share this. |
| `clinicianId`, `patientId`, `externalEncounterId` | Optional identity fields. In production these are populated by the EMR; in this prototype they are accepted but not enforced. |
| `receivedAt`      | ISO timestamp at which the API received the request. |
| `rulesetId`, `rulesetVersion` | **The exact ruleset that was active at decision time.** This is the cornerstone of medico-legal defensibility |
| `evaluationPath`  | `"safety-override"` or `"standard"`. Tells future readers whether the response was produced by the red-flag short-circuit or by differential ranking. |
| `triageLevel`     | Denormalized for fast filtering (`Emergency`, `Urgent`, ...). |
| `input`           | The full validated DTO — structured, never free text. |
| `output`          | The complete engine response — every differential, every triggered modifier, every recommended action. |
| `dispositionAction` | `accepted` / `ignored` / `overridden`. Recorded later via PATCH. |
| `dispositionReason` | Free-text reason — **required** when action = `overridden`. |
| `dispositionClinicianId`, `dispositionAt` | Who recorded the disposition and when. |

The Mongoose schema is configured with `strict: 'throw'` so unknown fields are rejected, and only the disposition fields can be appended after creation. There is no API path to mutate `input`, `output`, or `rulesetVersion` once the worker writes the record.

---

## 2. Why the writes are asynchronous (Bull → Redis → Mongo)

The clinician's response time is decoupled from MongoDB latency. The triage controller enqueues a Bull job and returns the engine response immediately. The `AuditProcessor` consumer persists the record with five retries on exponential backoff. Failures land in the Bull failed-queue and are kept forever (`removeOnFail: false`) so dead audits can be replayed manually — no clinical record can be silently lost. The `auditId` carries a unique index, so retried jobs are idempotent.

---

## 3. How this trail supports medico-legal accountability

A medico-legal review one or two years from now needs to answer one question: *"What guidance was the engine giving on the day this decision was made?"*

Three properties of the audit make that answer reproducible:

1. **The exact ruleset version is pinned per record.** Ruleset files in `rulesets/` are immutable artifacts. A new clinical revision ships as `v1.1.0-IMCI-NG`; the old `v1.0.0-IMCI-NG` file is never deleted, never edited. Any audit referencing `1.0.0-IMCI-NG` can be re-evaluated against the original file and produce a byte-identical output (the engine has a determinism test that verifies this property).
2. **Inputs are structured, not transcribed text.** The DTO captured at `input` is exactly what the engine evaluated — no information was lost or interpreted between the clinician and the decision.
3. **The output captures reasoning, not just conclusions.** Every triggered red flag carries its predicate description in `triggeredBy`. Every differential carries its `triggeredModifiers[]` showing which deltas fired. A reviewer can reconstruct the *why*, not only the *what*.

Combined with the disposition record (`accepted | ignored | overridden` + free-text reason for overrides), the trail also captures the clinician's agency. The system gave a recommendation; the clinician made the decision. That separation is the foundation of medico-legal defensibility for any CDST.

---

## 4. How this trail supports iterative ruleset improvement

The same data drives clinical-governance work:

- **Weekly MDT override review.** Every `dispositionAction: "overridden"` record carries a free-text `dispositionReason`. Patterns across these reasons are the strongest signal that a modifier, weight, or red flag is mis-calibrated for the local population.
- **Outcome calibration.** Linking `patientId` + `externalEncounterId` to the EMR's final diagnosis allows retrospective comparison: for every encounter where the engine ranked malaria first, did the consultant agree? Where the engine missed sepsis, what red flag should have fired? This is the path from clinically reasoned seed weights to outcome-calibrated probabilities.
- **Ruleset version comparison.** Because every audit pins a version, a new `v1.1.0-IMCI-NG` rollout can be A/B-compared against the prior version by triage-level distribution, override rate, and red-flag false-positive rate — without losing any historical audit.
- **Notifiable-disease reporting.** Records carrying `DX_MEASLES` in the top differential can be filtered and fed to NCDC reporting workflows.

The schema is the foundation. The disposition + outcome data are what make the ruleset learn over time, while preserving the immutability that makes any individual decision defensible.
