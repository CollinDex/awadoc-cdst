# Submission Note — Email Body Draft

Subject: **Clinical Backend Assessment**

To: careers@awadoc.com, joy.aifuo@awadoc.com

---

Dear AwaDoc Team,

Please find my submission for the Clinical Backend Engineer technical assessment attached / linked at the GitHub repository below.

**What I built:** A deterministic Clinical Decision Support Tool encoded against the WHO IMCI guidelines, calibrated for Nigerian under-5 febrile illness. NestJS + TypeScript backend with a structured rules engine (no LLM in the critical reasoning loop), a structural safety override that forces Emergency triage when any IMCI danger sign fires, and an immutable audit pipeline (Bull → Redis → MongoDB) that records inputs, full engine output, ruleset version, and clinician disposition (`accepted | ignored | overridden`). The Web App deliverable is the interactive Swagger UI at `/docs`. Tests run with a single `npm test` and cover the override layer, differential ranking, missing-info prompts, and a 1 000-iteration determinism check.

**One decision I'm proud of:** Moving ruleset predicates from string expressions to structured `{ field, op, value }` objects. It eliminated `eval()` from the critical path, made the audit trail more readable (the engine can render any predicate as human-readable prose for the `triggeredBy` field), and the predicate evaluator stayed under 100 lines while supporting AND/OR/NOT composition. This was the change that made the code review and the clinical-governance review the same exercise.

**One thing I'd improve with more time:** Calibrating the differential probability weights against retrospective Nigerian outpatient data instead of using clinically reasoned seed values. The current `v1.0.0-IMCI-NG` ruleset states this limitation plainly in its provenance block, and the production-deployment section of `docs/CLINICAL_RATIONALE.md` outlines what cohort-based calibration would require. I would also wire up the override-pattern dashboard described in `docs/AUDIT_DESIGN.md` — that feedback loop is what turns the engine from a static guideline into a learning system, and it is the single highest-leverage piece of governance infrastructure beyond what is here.

Repository: **<paste GitHub URL here>**
Setup is three commands: `docker-compose up -d && npm install && npm run start:dev`. Then open `http://localhost:3000/docs`.

Thank you for the thoughtful assessment design — the dual clinician/engineer framing is exactly the right test for this role.

Best regards,
**<Your name>**
