# NouraCDS — System Architecture

**AI-Powered Clinical Intelligence & Decision Support Platform**

> Source requirements: the NouraCDS PRD (v1.0).

---

## 1. Overview & Goals

NouraCDS gives every frontline health worker in Africa — doctors, nurses, CHEWs, pharmacists — access to safe, evidence-based, multilingual clinical decision support, regardless of facility level or connectivity. Hospitals, pharmacies, and medical centres onboard as **tenants**; their staff log in and are shown only the parts of the clinical workflow their role permits.

The central engineering problem is a tension that this architecture exists to resolve:

> We need answers that are **broad and scalable** (the long tail of presentations, languages, and questions a clinician will throw at it) while remaining **deterministic, reliable, and medico-legally defensible** (the same input must produce the same, explainable, guideline-backed output that a clinician can stand behind in court).

A pure LLM is broad but not reproducible or defensible. A pure rule engine is reproducible and defensible but cannot scale to every presentation. NouraCDS resolves this with one organising principle, applied everywhere:

> ### "AI proposes, the deterministic core disposes."

The LLM is used aggressively for what it is good at — understanding messy human input, retrieving relevant guidance, and producing natural language — and is **structurally prevented** from being the final authority on anything that can harm a patient. Every safety-critical decision is owned by a deterministic engine, and every AI-generated output is gated by that engine and fully traced.

### Design goals

| Goal | How the architecture delivers it |
|------|----------------------------------|
| Diagnostic accuracy & guideline adherence | Deterministic rulesets translated from WHO/IMCI/iCCM/FMOH; RAG grounded in the same corpus with citations. |
| Patient safety | Non-negotiable deterministic safety tier (red flags, scope-of-practice, drug safety) the LLM cannot override. |
| Defensibility | Immutable, append-only audit; every decision pins ruleset + model + prompt + corpus versions and records the full trace. |
| Reduced consultation time | Microsecond deterministic path; response + extraction caching; AI transport removes documentation burden. |
| Multilingual reach | AI transport layer (STT/TTS/translation) on both ends, decoupled from clinical reasoning. |
| Scope-aware UX | RBAC + scope-of-practice render only role-relevant schema sections and enforce them server-side. |
| Scale to new conditions | Versioned ruleset registry (Tier 2) + RAG long tail (Tier 3) without re-architecting. |

---

## 2. Architecture Principles

1. **The deterministic core owns safety.** Red-flag escalation, scope-of-practice, and drug-safety limits are computed by deterministic rules with no `eval()` and no LLM in the path. They are reproducible and unit-tested.
2. **AI is gated and observable.** No AI output reaches a clinician without passing the Clinical Guardrail Engine, and every AI call is traced (inputs, retrieved sources, model + prompt version, latency, cost, verdict).
3. **Human-in-the-loop on decisions, not on data entry.** Extracted input is validated against the strict clinical schema (invalid / out-of-range values rejected) and passed straight to the orchestrator — there is no manual "confirm the extracted data" step. Human oversight applies to the *clinical output*, which is advisory and requires the clinician to accept/modify. NouraCDS never autonomously diagnoses, prescribes, or treats.
4. **Immutable audit.** Encounters are append-only. Inputs, outputs, and version pins are never mutated; only disposition is appended.
5. **Versioned everything.** Rulesets, prompts, models, and the knowledge corpus are versioned artifacts. A record is reproducible because it pins the exact versions used.
6. **Provider-agnostic AI.** All model access flows through an LLM gateway so Claude / OpenAI / local / ElevenLabs / Whisper are swappable by configuration.
7. **Multi-tenant & least-privilege.** Every record is tenant-scoped; every action is checked against the actor's role and scope.
8. **Privacy by design (NDPR/NDPA).** PHI is encrypted in transit and at rest, prompt logs are redacted, and the design supports in-region data residency.
9. **Online-first, gracefully degrading.** The MVP assumes connectivity; the PWA caches the app shell and recent encounters for read-only resilience. Offline-first sync is a later phase.

---

## 3. System Context Diagram

*The whole platform as a single box — who uses it and which outside systems it talks to.*

```mermaid
graph TB
    subgraph Users["Facility staff (per-tenant, role-scoped)"]
        DOC["Doctor"]
        NUR["Nurse / Midwife"]
        CHEW["CHEW"]
        PHARM["Pharmacist"]
        ADMIN["Administrator"]
    end

    NOURA["NouraCDS Platform"]

    subgraph Ext["External systems"]
        WA["AwaDoc WhatsApp<br/>health chatbot"]
        APP["AwaDoc patient app"]
        LLM["LLM providers<br/>(Claude / OpenAI / local)"]
        VOICE["Voice providers<br/>(ElevenLabs / Whisper)"]
        EMR["EMR / DHIS2 / FHIR<br/>(later phases)"]
    end

    DOC --> NOURA
    NUR --> NOURA
    CHEW --> NOURA
    PHARM --> NOURA
    ADMIN --> NOURA

    NOURA -->|"pull patient history & context"| WA
    NOURA -->|"pull patient history & context"| APP
    NOURA -->|"reasoning / extraction / embeddings"| LLM
    NOURA -->|"speech-to-text / text-to-speech"| VOICE
    NOURA -.->|"export notes, sync indicators"| EMR
```

A patient who already uses AwaDoc's WhatsApp bot or app has history we can pull into an encounter for richer context. Facilities and their staff are the direct users; external AI providers sit behind the gateway; EMR/DHIS2/FHIR integration arrives in later phases.

---

## 4. High-Level Component / Layer Architecture

```mermaid
graph TB
    subgraph Client["Client layer"]
        WEB["Next.js web app (PWA)<br/>role-based clinical workspace"]
    end

    subgraph Edge["Edge / API"]
        BFF["API Gateway / BFF<br/>NestJS · auth · rate-limit · tenant routing"]
    end

    subgraph Platform["Platform services"]
        IAM["Identity & Access<br/>OIDC · RBAC · scope-of-practice"]
        ORCH["Clinical Orchestrator<br/>context assembly · tier routing · caching"]
    end

    subgraph AI["AI services (behind LLM Gateway)"]
        GW["LLM Gateway<br/>provider-agnostic · prompt+cost logging"]
        EXTRACT["Extraction<br/>input -> schema"]
        REASON["Reasoning / RAG"]
        VOICESVC["Voice (STT/TTS)"]
        TRANS["Patient translation"]
        IMG["Image interpretation"]
    end

    subgraph Core["Deterministic clinical core (no LLM)"]
        ENGINE["Rule engine<br/>differentials · triage · actions"]
        SAFETY["Safety override<br/>red flags"]
        GUARD["Clinical Guardrail Engine"]
        DRUG["Drug Safety Engine"]
        REG["Ruleset registry (versioned)"]
    end

    subgraph Knowledge["Knowledge layer"]
        CORPUS["Guideline corpus<br/>WHO / IMCI / iCCM / FMOH"]
        VEC["Vector DB (embeddings)"]
        DRUGDB["Drug database"]
    end

    subgraph Data["Data & messaging"]
        MONGO["MongoDB (Prisma)<br/>tenants · users · patients · encounters/audit"]
        REDIS["Redis<br/>cache + Bull queue"]
    end

    subgraph Obs["Observability & governance"]
        OTEL["OpenTelemetry traces"]
        LLMOBS["LLM observability + evals"]
        AUDITLOG["Audit / governance store"]
    end

    WEB --> BFF --> IAM
    BFF --> ORCH
    ORCH --> EXTRACT
    ORCH --> REASON
    ORCH --> ENGINE
    ORCH --> GUARD
    EXTRACT --> GW
    REASON --> GW
    VOICESVC --> GW
    TRANS --> GW
    IMG --> GW
    REASON --> VEC
    VEC --- CORPUS
    ENGINE --> REG
    DRUG --> DRUGDB
    GUARD --> DRUG
    GUARD --> SAFETY
    ORCH --> REDIS
    ORCH --> MONGO
    ORCH --> OTEL
    GW --> LLMOBS
    MONGO --- AUDITLOG
```

The **Clinical Orchestrator** is the heart of the runtime: it assembles patient context, routes each request to the correct reasoning tier, runs the guardrail, caches, persists the audit, and returns the clinical brief. The AI services and the deterministic core are deliberately separate subsystems — the orchestrator is the only thing that talks to both.

---

## 5. The 3-Tier Reasoning Model

Decisions are classified by **how much harm a wrong answer can do**, and routed accordingly.

```mermaid
flowchart TD
    IN["Clinician input:<br/>text / buttons / audio / image"] --> EX["AI Transport: extract to schema<br/>(constrained / function-calling)"]
    EX --> VAL["Schema validation<br/>(reject invalid / out-of-range values)"]
    VAL --> CTX["Orchestrator assembles context<br/>(patient history + facility + epidemiology)"]
    CTX --> ROUTE{"Authored ruleset<br/>for this presentation?"}

    ROUTE -->|Yes| DET["Tier 2: Deterministic engine<br/>ranked differentials + triage + actions"]
    ROUTE -->|No| RAG["Tier 3: AI + RAG proposes<br/>differentials / education<br/>with citations + confidence"]

    DET --> SAFE
    RAG --> SAFE

    subgraph SAFE["Tier 1 — Non-negotiable safety — ALWAYS deterministic"]
        direction TB
        RF["Red-flag / safety override -> Emergency"]
        SOP["RBAC scope-of-practice gate"]
        DD["Drug interaction / contraindication / dosing bounds"]
        QC["Clinical Guardrail: validate vs rules,<br/>citations present, confidence >= threshold"]
    end

    SAFE -->|pass| BRIEF["Clinical brief to clinician<br/>AI-assisted items labelled w/ sources + confidence"]
    SAFE -->|fail / modify / suppress| BRIEF
    BRIEF --> DISP["Clinician accept / modify"]
    DISP --> AUD[("Immutable audit + full trace")]
```

### What each tier may and may not do

| | **Tier 1 — Safety** | **Tier 2 — Authored conditions** | **Tier 3 — Long-tail breadth** |
|---|---|---|---|
| Authority | Deterministic, absolute | Deterministic primary | AI primary, rule-gated |
| Produces | Red-flag escalation, scope gate, drug-safety verdicts | Ranked differentials, triage level, recommended actions | Candidate differentials, investigations, patient education |
| LLM role | **None** | Explains & translates only | Proposes, grounded in RAG |
| May override a red flag? | — (it *is* the red flag) | No | No |
| May exceed role scope? | No (it enforces scope) | No | No |
| Reproducible? | Yes (byte-identical) | Yes (byte-identical) | Inputs/sources/versions traced; output labelled "AI-assisted" |
| Failure mode | Fail safe (escalate) | Fall back to Tier 3 if no ruleset | Guardrail can suppress/modify; clinician verifies |

**Routing rule (simplified):** the orchestrator matches the validated presentation (chief complaint + demographics) against the ruleset registry's `appliesTo`. A match → Tier 2. No match → Tier 3. In **all** cases the output passes Tier 1 before display. Tier 1 runs *first* for red flags (an Emergency short-circuits to escalation regardless of tier) and *last* for the guardrail quality check.

This is exactly the hybrid requested: **broad** because Tier 3 covers anything; **deterministic and defensible** because Tiers 1–2 own everything that can harm and every AI output is gated and traced.

---

## 6. Identity, RBAC & Scope-of-Practice

Authentication is OIDC (authorization-code + PKCE for the web app); the BFF validates JWTs and resolves the actor's tenant, role, and scope. Authorization is **two-layered**:

- **RBAC** — coarse: which modules/endpoints a role may call.
- **Scope-of-practice** — fine: which *clinical actions* a role may take, enforced inside the deterministic core (Tier 1) so the LLM can never grant an out-of-scope action.

```mermaid
flowchart LR
    REQ["Authenticated request<br/>(JWT: tenant, role, scope)"] --> RBAC{"RBAC: role allowed<br/>to call this module?"}
    RBAC -->|No| DENY["403 — not permitted"]
    RBAC -->|Yes| RENDER["UI renders only<br/>role-relevant schema sections"]
    RENDER --> ACTION["Clinical action requested"]
    ACTION --> SCOPE{"Scope-of-practice gate<br/>(deterministic)"}
    SCOPE -->|"in scope"| ALLOW["Action surfaced to actor"]
    SCOPE -->|"out of scope"| ESCALATE["Action withheld + escalation<br/>(e.g. 'call a doctor')"]
```

### Role matrix

| Role | RBAC modules | Scope-of-practice (Tier-1 enforced) | Schema sections shown |
|------|--------------|--------------------------------------|------------------------|
| **Doctor** | All clinical modules | Clerk, diagnose, prescribe, manage emergencies | Full clerking + diagnosis + treatment |
| **Nurse / Midwife** | Workspace, triage, maternal, drug-safety (read) | Restricted prescribing; **must escalate emergencies to a doctor**; maternal/neonatal care | History, exam, triage, maternal; treatment read-only/restricted |
| **CHEW** | Workspace (IMCI/iCCM), triage | Scope-limited recommendations; **stabilize-and-refer**; no physician-only actions | Guided IMCI/iCCM intake, triage, referral |
| **Pharmacist** | Drug-safety, counseling | Drug interactions, contraindications, adherence; no diagnosis | Medication, interactions, counseling |
| **Administrator** | Dashboards, analytics, user management | No clinical actions | Facility dashboard, audit review |

The same scope rules are applied on the **frontend** (to hide what a role cannot do) and authoritatively on the **backend** (so a tampered client cannot bypass them). Treatment plans returned by the engine are filtered to the actor's scope — e.g. a CHEW receives "stabilize and refer" where a doctor receives the full management plan.

---

## 7. AI Services & the LLM Gateway

All model access flows through a single **provider-agnostic gateway** so models are swappable by config and every call is logged, versioned, and cost-tracked.

```mermaid
graph TB
    subgraph Svcs["AI sub-services"]
        EX["Extraction<br/>(input -> schema)"]
        RE["Reasoning / RAG"]
        VO["Voice (STT / TTS)"]
        TR["Patient translation"]
        IM["Image interpretation"]
    end

    GW["LLM Gateway<br/>· capability interface: chat / embed / stt / tts / vision<br/>· prompt versioning + structured-output enforcement<br/>· retry / fallback / timeout<br/>· token + cost logging · PII redaction"]

    subgraph Adapters["Provider adapters"]
        A1["Claude"]
        A2["OpenAI"]
        A3["Local / open model"]
        A4["ElevenLabs"]
        A5["Whisper"]
    end

    EX --> GW
    RE --> GW
    VO --> GW
    TR --> GW
    IM --> GW
    GW --> A1
    GW --> A2
    GW --> A3
    GW --> A4
    GW --> A5
```

- **Extraction** turns free text / button answers / audio transcript / image findings into the strict clinical schema using constrained decoding / function-calling bound to the input contract. Its output is **validated against the schema** (invalid / out-of-range values rejected) and passed straight to the orchestrator — there is no manual confirmation step.
- **Reasoning / RAG** (Tier 3 only) retrieves guideline passages and produces a schema-constrained proposal with citations + confidence.
- **Voice** (ElevenLabs / Whisper) and **Patient translation** implement PRD Modules 7 & 8 — multilingual STT/TTS and conversion of clinical language to patient-friendly language. Phase 1 languages: English, Hausa, Yoruba, Igbo; Phase 2: Pidgin, French, Swahili.
- **Image interpretation** (PRD Module 9) handles skin/wounds/rashes first, lab/radiology reports later; its findings feed extraction, never the final decision.

None of these services decide clinical outcomes — they are transport and proposal only, gated downstream.

---

## 8. RAG / Knowledge Pipeline

Tier 3 is only as safe as its grounding. The knowledge pipeline curates, versions, and indexes guideline content so every AI proposal can cite a real source.

```mermaid
flowchart LR
    subgraph Ingest["Ingestion (offline, versioned)"]
        SRC["WHO IMCI / iCCM<br/>FMOH / NCDC guidelines"] --> CLEAN["Clean + structure"]
        CLEAN --> CHUNK["Chunk + tag<br/>(condition, age, source, version)"]
        CHUNK --> EMB["Embed (gateway)"]
        EMB --> VEC[("Vector DB<br/>+ corpus version")]
    end

    subgraph Retrieve["Retrieval (request time)"]
        Q["Validated presentation + question"] --> RET["Hybrid retrieval<br/>(semantic + filters)"]
        VEC --> RET
        RET --> CITE["Top-k passages w/ source IDs"]
        CITE --> LLM["Reasoning LLM<br/>(answer constrained to cited passages)"]
        LLM --> OUT["Proposal + citations + confidence"]
    end
```

Key properties: the corpus is a **versioned artifact** (a record pins the corpus version it used); retrieval is filtered by condition/age/role so a paediatric query never grounds on adult guidance; and the reasoning prompt requires the model to answer **only** from retrieved passages and to surface citations — answers it cannot ground are flagged low-confidence and caught by the guardrail.

---

## 9. Deterministic Clinical Core

This is the defensible heart of the system — pure functions, no I/O, no `eval()`, fully unit-tested, packaged as a shared library (`packages/engine`) reused by the API and by offline/edge deployments later.

```mermaid
flowchart TD
    INPUT["Validated structured input + reasoning output"] --> SO["Safety Override<br/>evaluate red-flag predicates"]
    SO -->|"any red flag fires"| EMERG["Force triage = Emergency<br/>path = safety-override"]
    SO -->|"none"| RANK["Rule engine<br/>rank differentials (weights -> normalized probs)"]
    RANK --> PICK["Pick triage level<br/>(top differential vs thresholds)"]
    PICK --> ACTIONS["Recommended actions<br/>(from top differential)"]

    EMERG --> SCOPEF
    ACTIONS --> SCOPEF["Scope-of-practice filter<br/>(actor role)"]

    SCOPEF --> GUARDIN
    AIIN["AI-proposed items (Tier 3)"] --> GUARDIN

    subgraph GUARD["Clinical Guardrail Engine"]
        GUARDIN["Validate each AI item"] --> C1{"Contradicts a fired red flag?"}
        C1 -->|yes| SUPPRESS["Suppress / downgrade"]
        C1 -->|no| C2{"Within actor scope?"}
        C2 -->|no| SUPPRESS
        C2 -->|yes| C3{"Drug-safe?<br/>(interactions / contra / dosing)"}
        C3 -->|no| SUPPRESS
        C3 -->|yes| C4{"Cited + confidence >= threshold?"}
        C4 -->|no| LABELLOW["Keep, label low-confidence"]
        C4 -->|yes| PASSITEM["Pass, label AI-assisted + sources"]
    end

    SUPPRESS --> BRIEF["Assemble clinical brief"]
    LABELLOW --> BRIEF
    PASSITEM --> BRIEF
```

Components:

- **Rule engine** — weight-based differential ranking normalised to probabilities, deterministic tie-breaking, triage-level selection against ruleset thresholds, and "missing info" prompts. Same input + same ruleset = byte-identical output.
- **Safety Override** — red-flag predicates that force **Emergency** regardless of differential ranking; non-negotiable.
- **Clinical Guardrail Engine** — the quality check on **all** AI output: rejects/suppresses anything that contradicts a red flag, exceeds the actor's scope, or fails drug safety; labels the rest with confidence and citations. This is the gate that makes Tier 3 safe.
- **Drug Safety Engine** (PRD Module 5) — interactions, contraindications, pregnancy safety, paediatric dosing, duplicate-therapy detection; consulted by the guardrail and callable directly by pharmacists.
- **Ruleset registry** — versioned, immutable ruleset files (one per condition), loaded at boot and frozen. New clinical content ships as a new version; old versions are never edited or deleted.

---

## 10. Caching

Caching cuts latency and cost and reinforces determinism. Two caches on Redis:

```mermaid
flowchart LR
    A["Raw input (text/audio/image)"] --> H1["hash(normalized input)"]
    H1 --> EC{"Extraction cache hit?"}
    EC -->|yes| ED["Return cached structured input"]
    EC -->|no| EX["Run extraction"] --> ES["Store"] --> ED

    ED --> H2["hash(input + rulesetVer + modelVer +<br/>promptVer + corpusVer + role)"]
    H2 --> RC{"Reasoning cache hit?"}
    RC -->|yes| RD["Return cached reasoning result"]
    RC -->|no| RUN["Run tier reasoning + guardrail"] --> RS["Store"] --> RD
```

- **Extraction cache** keyed on the normalised raw input — identical dictation/text need not be re-processed.
- **Reasoning cache** keyed on the **full version fingerprint**. Because deterministic-engine output is a pure function of `(input, ruleset)`, it is trivially cacheable. AI output is also cached but **any** version bump (model, prompt, corpus, ruleset) changes the key and invalidates stale entries — so a model upgrade can never silently serve outdated reasoning.

---

## 11. End-to-End Clerking Sequence

```mermaid
sequenceDiagram
    actor C as Clinician
    participant W as Web app (PWA)
    participant B as BFF / IAM
    participant O as Orchestrator
    participant X as Extraction (AI)
    participant P as Patient context (AwaDoc)
    participant R as Reasoning (engine / RAG)
    participant G as Guardrail + Drug safety
    participant Q as Cache (Redis)
    participant D as Audit (Mongo)

    C->>W: Log in
    W->>B: OIDC auth
    B-->>W: JWT (tenant, role, scope) + role-scoped UI
    C->>W: Look up / open patient
    W->>B: patient lookup
    B->>P: pull history if AwaDoc user
    P-->>B: patient context
    C->>W: Clerk (text / buttons / audio / image)
    W->>O: encounter input
    O->>Q: extraction cache?
    Q-->>O: miss
    O->>X: extract to schema
    X-->>O: structured input (schema-validated)
    O->>O: assemble context + route tier
    O->>Q: reasoning cache?
    Q-->>O: miss
    O->>R: reason (Tier 2 engine or Tier 3 RAG)
    R-->>O: ranked output (+ citations if Tier 3)
    O->>G: guardrail + scope + drug safety
    G-->>O: gated, labelled output
    O->>Q: store result
    O->>D: persist immutable audit + trace (async)
    O-->>W: clinical brief
    C->>W: accept / modify
    W->>O: disposition
    O->>D: append disposition
    C->>W: export SOAP / referral (PDF)
```

The clinician's perceived latency is dominated by extraction + reasoning; audit persistence is asynchronous (queued) so it never blocks the response.

---

## 12. Data Model

Modelled with **Prisma on MongoDB**. Encounters are immutable audit records; only disposition is appended.

```mermaid
erDiagram
    TENANT ||--o{ FACILITY : has
    TENANT ||--o{ USER : employs
    FACILITY ||--o{ ENCOUNTER : hosts
    USER ||--o{ ENCOUNTER : conducts
    PATIENT ||--o{ ENCOUNTER : subject_of
    ENCOUNTER ||--|| DISPOSITION : results_in
    ENCOUNTER }o--|| RULESET_VERSION : evaluated_by
    ENCOUNTER ||--o{ AI_TRACE : records
    AI_TRACE }o--o{ GUIDELINE_CHUNK : retrieved
    GUIDELINE_DOC ||--o{ GUIDELINE_CHUNK : chunked_into
    DRUG_RECORD ||--o{ DRUG_INTERACTION : participates
    RULESET ||--o{ RULESET_VERSION : versions
    EVAL_CASE }o--|| RULESET_VERSION : asserts_against

    TENANT {
        string id PK
        string name
        string dataRegion
    }
    USER {
        string id PK
        string tenantId FK
        string role
        json scope
    }
    PATIENT {
        string id PK
        string awadocRef
        json demographics
    }
    ENCOUNTER {
        string id PK
        string tenantId FK
        string facilityId FK
        string clinicianId FK
        string patientId FK
        datetime receivedAt
        string evaluationPath
        string triageLevel
        json input
        json output
        string rulesetVersionId FK
        string modelVersion
        string promptVersion
        string corpusVersion
    }
    AI_TRACE {
        string id PK
        string encounterId FK
        string tier
        json retrievedSourceIds
        json guardrailVerdicts
        float confidence
        int latencyMs
        float costUsd
    }
    DISPOSITION {
        string id PK
        string encounterId FK
        string action
        string reason
        string clinicianId
        datetime at
    }
    RULESET_VERSION {
        string id PK
        string rulesetId FK
        string version
        datetime publishedAt
        boolean active
    }
    GUIDELINE_CHUNK {
        string id PK
        string docId FK
        string sourceCitation
        string corpusVersion
        vector embedding
    }
```

The `ENCOUNTER` record carries everything needed to reproduce and defend a decision: the full validated `input`, the full `output`, and the exact `rulesetVersion` / `modelVersion` / `promptVersion` / `corpusVersion` used. `AI_TRACE` captures the per-decision observability detail (tier, retrieved sources, guardrail verdicts, confidence, latency, cost). `DISPOSITION` is the only thing appended after creation (`accepted` / `modified` / `overridden`, with reason).

---

## 13. Observability & AI Governance

The PRD requires that "every decision needs to be monitored." Observability is a first-class subsystem, not an afterthought.

```mermaid
flowchart LR
    REQ["Encounter request"] --> SPAN["Root trace span"]
    SPAN --> S1["span: extraction<br/>(model, prompt ver, tokens, cost)"]
    SPAN --> S2["span: retrieval<br/>(doc IDs, scores, corpus ver)"]
    SPAN --> S3["span: reasoning<br/>(tier, model ver, latency)"]
    SPAN --> S4["span: guardrail<br/>(verdicts, suppressions)"]
    S1 --> SINK
    S2 --> SINK
    S3 --> SINK
    S4 --> SINK
    SINK["OpenTelemetry collector"] --> TRACES["Traces / metrics dashboards"]
    SINK --> LLMOBS["LLM observability<br/>(prompt+response logs, redacted)"]
    SPAN --> AUDIT[("Immutable encounter audit")]
    AUDIT --> EVAL["Eval / regression harness<br/>(golden cases on each ruleset/model bump)"]
    AUDIT --> BIAS["Bias & drift monitoring<br/>(override patterns, subgroup outcomes)"]
```

Mapping to **PRD §8 (AI Governance)**:

| Requirement | Mechanism |
|-------------|-----------|
| Human-in-the-loop | Accept/modify on the clinical output; advisory-only outputs |
| Explainable outputs | Per-differential rationale; triggered modifiers; cited passages |
| Guideline citations | RAG citations + ruleset provenance pinned per record |
| Confidence scoring | Differential probabilities (Tier 2) + model confidence (Tier 3) |
| Audit trails | Immutable `ENCOUNTER` + `AI_TRACE` |
| Prompt logging | Gateway logs prompts/responses (PII-redacted), versioned |
| Bias monitoring | Override-pattern + subgroup-outcome dashboards; eval harness on each version bump |

The **eval harness** runs golden clinical cases on every ruleset, prompt, model, or corpus change; a regression (a previously-correct case now mis-triaged) blocks promotion. This is what makes versioned upgrades safe.

---

## 14. Integrations

| Phase | Integration | Direction | Purpose |
|-------|-------------|-----------|---------|
| 1 | AwaDoc WhatsApp bot | Inbound | Pull existing patient history into an encounter |
| 1 | AwaDoc app | Inbound | Pull patient demographics & history |
| 2 | EMR / FHIR | Bidirectional | Import context, export notes |
| 2 | DHIS2 | Outbound | Export aggregate indicators for public-health intelligence |
| 3 | Hospital / national systems | Bidirectional | Deeper interoperability |

Integrations are implemented as **adapters** behind a stable internal patient-context interface, so the orchestrator does not care whether context came from WhatsApp, the app, or an EMR.

---

## 15. Deployment Topology

Cloud-agnostic, containerised, NDPR/NDPA-aware.

```mermaid
graph TB
    subgraph CDN["Edge / CDN"]
        PWA["Next.js PWA (static + SSR)"]
    end

    subgraph K8s["Container platform (K8s on any cloud)"]
        ING["Ingress / WAF / TLS"]
        BFF["API / BFF pods"]
        ORCH["Orchestrator pods"]
        AISVC["AI service pods"]
        WORKER["Audit / ingestion workers"]
    end

    subgraph Stateful["Managed stateful services (in-region)"]
        MDB[("MongoDB")]
        RDS[("Redis")]
        VDB[("Vector DB")]
        OBJ[("Object store: images, exports")]
        KMS[("KMS / secrets")]
    end

    subgraph ExtAI["External AI (egress-controlled)"]
        PROV["LLM / voice providers"]
    end

    PWA --> ING --> BFF
    BFF --> ORCH
    ORCH --> AISVC
    ORCH --> MDB
    ORCH --> RDS
    AISVC --> VDB
    AISVC --> PROV
    WORKER --> MDB
    WORKER --> VDB
    BFF --> KMS
    AISVC --> OBJ
```

Stateful services are deployable in-region for data residency; AI-provider egress is controlled and PII-redacted. Hospitals requiring on-prem can run the deterministic core + cached rulesets locally (a later-phase option), aggregating de-identified indicators centrally.

---

## 16. Security & Compliance

- **Transport & storage encryption** — TLS everywhere; encryption at rest for MongoDB, object store, and backups; keys in KMS.
- **PHI minimisation** — only required fields leave the platform; prompts sent to AI providers are redacted of direct identifiers where feasible; image/audio stored in access-controlled object storage.
- **NDPR / NDPA alignment** — lawful basis, data-subject rights support, retention policy, and in-region residency path.
- **Access control** — tenant isolation on every query; least-privilege roles; audit-log access restricted and itself audited.
- **Auditability** — append-only encounters; deployment changes, ruleset promotions, and prompt-version changes are logged.
- **Secrets** — no secrets in code; injected from KMS/secret manager per environment.

---

## 17. Technology Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend / API | **NestJS (TypeScript)** | Modular, DI, Swagger; hosts BFF, orchestrator, AI service clients |
| Frontend | **Next.js + React + Tailwind**, PWA | Role-based clinical workspace; offline app-shell caching |
| Data / ORM | **Prisma on MongoDB** | Tenants, users, patients, immutable encounters/audit |
| Cache & queue | **Redis + Bull** | Extraction/reasoning caches; async audit + ingestion jobs |
| Vector DB | Qdrant / pgvector / Atlas Vector | RAG embeddings; chosen at build time |
| AI access | **Provider-agnostic LLM Gateway** | Claude / OpenAI / local + ElevenLabs / Whisper adapters |
| Auth | OIDC (Keycloak / managed IdP) | JWT at BFF; RBAC + scope-of-practice |
| Observability | OpenTelemetry + LLM-observability (e.g. Langfuse-style) | Traces, prompt logs, evals, dashboards |
| Packaging / deploy | Docker + Kubernetes, cloud-agnostic | In-region stateful services; IaC |

### Reused proven ideas

Two ideas from prior CDST work are carried directly into the deterministic core and data model:

1. A **safe deterministic rule engine** — weight-based differential ranking + red-flag safety override + a structured predicate evaluator with **no `eval()`** — becomes `packages/engine` powering Tiers 1–2.
2. **Immutable, append-only encounter audit** with the **ruleset version pinned per record** becomes the `ENCOUNTER` model and the medico-legal backbone.

---

*Next: see [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the phased, 90-day-targeted build plan and PRD traceability.*
