# AwaDoc CDST — Clinical Decision Support Tool

A deterministic, auditable triage engine for **Febrile illness in a child under 5**, calibrated for Nigerian primary-care and outpatient settings. Built as the submission for the AwaDoc Clinical Backend Engineer technical assessment.

> ⚠️ **Non-diagnostic.** This service surfaces structured recommendations for clinician review. It does not autonomously diagnose, prescribe, or order treatment. The clinician is the decision-maker.

---

## Architecture at a glance

```
HTTP POST /v1/encounters/triage
   ↓
[DTO validation (class-validator)]   reject clinically impossible inputs (400)
   ↓
[Rules engine — pure, synchronous]
   ├── Safety override (red flags → Emergency, non-negotiable)
   ├── Differential ranking (baseWeight + structured-predicate modifiers, normalized)
   ├── Triage level (Emergency / Urgent / Semi-Urgent / Routine)
   └── Missing-information checks
   ↓
HTTP 200 response (includes auditId)
   ↓ (fire-and-forget)
[Bull queue → Redis]
   ↓
[Audit worker → MongoDB immutable record]
```

Why this shape:
- **No LLM in the critical reasoning loop.** Hallucinations are fatal in clinical triage.
- **In-memory frozen ruleset.** Microsecond latency at the point of care.
- **Async audit persistence.** DB writes never block the clinician.
- **Structured predicates (no `eval()`).** Safe to defend in code review.

See [`docs/AUDIT_DESIGN.md`](docs/AUDIT_DESIGN.md) for the medico-legal accountability model, [`docs/CLINICAL_RATIONALE.md`](docs/CLINICAL_RATIONALE.md) for clinical sourcing, and [`docs/API.md`](docs/API.md) for endpoint specs with three full scenarios.

---

## Setup

**Prerequisites:** Node.js 20+, Docker, and Docker Compose.

```bash
# 1. Bring up Mongo + Redis
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Copy env (defaults work for the docker-compose stack)
cp .env.example .env

# 4. Start in watch mode
npm run start:dev
```

The API listens on `http://localhost:3000`. The Web App deliverable is the interactive **Swagger UI at `http://localhost:3000/docs`** — use the “Try it out” button to send the three sample scenarios in [`docs/API.md`](docs/API.md).

---

## Running the tests

A single command:

```bash
npm test
```

Expect ≥ 5 passing tests covering:
- The safety override (6 tests, including contradictory inputs and non-escalation)
- Differential ranking and triage thresholds
- A determinism test (1 000 evaluations of an identical input must produce a byte-identical output)
- The predicate evaluator (incl. a structural assertion that the source contains no `eval()` or `new Function()`)

---

## Inspecting the audit trail

```bash
# Show all encounters
docker exec -it awadoc-mongo mongosh awadoc --eval 'db.encounters.find().pretty()'

# Find emergency-pathway audits
docker exec -it awadoc-mongo mongosh awadoc --eval 'db.encounters.find({ evaluationPath: "safety-override" }).pretty()'
```

Record clinician disposition (accepted / ignored / overridden) by calling:

```
PATCH /v1/encounters/:auditId/disposition
```

See [`docs/AUDIT_DESIGN.md`](docs/AUDIT_DESIGN.md) for the full disposition contract.

---

## Project layout

```
awadoc-cdst/
├── docker-compose.yml                  Mongo + Redis
├── rulesets/
│   └── febrile-child-under-5/
│       └── v1.0.0-IMCI-NG.json         Clinical content (versioned, immutable)
├── src/
│   ├── main.ts                         Bootstrap + Swagger
│   ├── app.module.ts
│   ├── common/
│   │   ├── dto/                        Strict class-validator DTOs
│   │   └── filters/                    Global exception filter
│   ├── triage/
│   │   ├── engine/                     Pure rules engine (no I/O)
│   │   │   ├── types.ts
│   │   │   ├── predicate-evaluator.ts
│   │   │   ├── safety-override.ts
│   │   │   ├── ruleset-loader.ts
│   │   │   └── rules-engine.ts
│   │   ├── triage.controller.ts        POST /v1/encounters/triage
│   │   ├── triage.service.ts
│   │   ├── triage.module.ts
│   │   └── __tests__/                  ≥ 5 unit tests, runnable via `npm test`
│   └── audit/
│       ├── audit.controller.ts         GET + PATCH disposition
│       ├── audit.processor.ts          Bull worker → MongoDB
│       ├── audit.service.ts            Enqueue helper
│       ├── audit.module.ts
│       └── schemas/encounter-audit.schema.ts   Immutable Mongoose doc
└── docs/
    ├── API.md                          Endpoint spec + 3 sample scenarios
    ├── CLINICAL_RATIONALE.md           ≤ 500-word clinical defence
    ├── AUDIT_DESIGN.md                 Medico-legal accountability writeup
    ├── BONUS_NOURA_INTEGRATION.md      Conversational AI layer sketch
    └── SUBMISSION_NOTE.md              Email body, ready to paste
```

---

## Out of scope (deliberate)

- **Authentication and multi-tenancy.** Production needs OAuth2 + hospital-tenant scoping; not implemented here.
- **Frontend beyond Swagger.** Web App deliverable = the Swagger UI.
- **LLM in the reasoning loop.** Deliberately omitted; see [`docs/BONUS_NOURA_INTEGRATION.md`](docs/BONUS_NOURA_INTEGRATION.md) for how Noura sits *outside* the engine.
- **Outcome-calibrated probability weights.** The current `v1.0.0-IMCI-NG` weights are clinically reasoned seed values, not statistically derived. See the provenance section of the ruleset JSON and [`docs/CLINICAL_RATIONALE.md`](docs/CLINICAL_RATIONALE.md).
