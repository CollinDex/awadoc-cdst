# AwaDoc CDST — API Documentation

Base URL: `http://localhost:3000`
Interactive Swagger UI: **`/docs`**

All endpoints are versioned under `/v1`.

---

## `POST /v1/encounters/triage`

Run the deterministic triage engine on a structured paediatric febrile encounter.

### Request schema (DTO)

```ts
{
  // Optional identity — populated by the EMR in production
  sessionId?: string
  clinicianId?: string
  patientId?: string
  externalEncounterId?: string

  demographics: {
    ageMonths: number      // 0–60
    sex: "male" | "female" | "other"
    weightKg?: number      // 0.5–30
  }

  vitals: {
    temperatureC: number          // 30–43
    heartRate?: number            // 0–300
    respiratoryRate?: number      // 0–120 (counted over 60s)
    spo2?: number                 // 50–100
    capillaryRefillSec?: number   // 0–10
  }

  history: {
    feverDurationDays: number     // 0–30
    vaccinationUpToDate?: boolean
    recentTravelMalariaZone?: boolean
    knownSickleCell?: boolean
    knownHIVExposure?: boolean
  }

  symptoms?: {  // all boolean, all optional
    cough, fastBreathing, chestIndrawing,
    vomiting, diarrhea, bloodyStool,
    rash, koplikSpots,
    neckStiffness, bulgingFontanelle,
    earPain, earDischarge,
    poorFeeding, sunkenEyes, skinPinchSlow
  }

  redFlagsObserved?: {  // all boolean, all optional
    convulsions, lethargyOrUnconscious,
    unableToDrinkOrBreastfeed, vomitingEverything,
    severeRespiratoryDistress, centralCyanosis,
    severeDehydration, stridorAtRest
  }
}
```

Validation is strict — extra fields are rejected with **400**, and clinically impossible values (e.g. `temperatureC: 500`) are rejected before the engine sees them.

### Response schema

```ts
{
  auditId: string                       // "enc_01HXY..."  for the disposition endpoint
  rulesetId: string
  rulesetVersion: string                // "1.0.0-IMCI-NG"
  evaluatedAt: string                   // ISO timestamp
  evaluationPath: "safety-override" | "standard"

  triage: {
    level: "Emergency" | "Urgent" | "Semi-Urgent" | "Routine"
    rationale: string
  }

  redFlags: [
    { id, label, explanation, triggeredBy }
  ]

  differentials: [   // ranked DESC by probability, sums to ~1.0
    { id, label, probability, rationale, triggeredModifiers: [...] }
  ]

  recommendedActions: string[]          // ordered next steps for clinician review

  missingInfo: [
    { id, field, prompt }
  ]
}
```

---

## Sample Scenarios

### Scenario 1 — Classic malaria presentation (no red flags)

**Request**
```json
POST /v1/encounters/triage
{
  "sessionId": "sess_demo_malaria",
  "demographics": { "ageMonths": 36, "sex": "female" },
  "vitals": { "temperatureC": 39.4, "spo2": 97, "respiratoryRate": 28 },
  "history": { "feverDurationDays": 2, "recentTravelMalariaZone": true },
  "symptoms": {}
}
```

**Expected response (truncated)**
```json
{
  "auditId": "enc_01HXY...",
  "rulesetVersion": "1.0.0-IMCI-NG",
  "evaluationPath": "standard",
  "triage": {
    "level": "Urgent",
    "rationale": "Top differential Malaria (uncomplicated or severe) is a high-acuity condition above the urgent threshold..."
  },
  "redFlags": [],
  "differentials": [
    { "id": "DX_MALARIA",   "probability": 0.66, "rationale": "Endemic in Nigeria... Recent travel to a malaria-endemic zone (Δ +0.15). Temperature ≥ 39°C (Δ +0.05)" },
    { "id": "DX_PNEUMONIA", "probability": 0.13, "...": "..." },
    { "id": "DX_SEPSIS",    "probability": 0.07, "...": "..." }
  ],
  "recommendedActions": [
    "Order malaria rapid diagnostic test (RDT) immediately; thick film microscopy if available.",
    "If RDT positive, follow Nigerian FMoH protocol: oral ACT for uncomplicated; IV artesunate for severe.",
    "..."
  ],
  "missingInfo": []
}
```

---

### Scenario 2 — Convulsing child with otherwise mild presentation (safety override)

**Request**
```json
POST /v1/encounters/triage
{
  "sessionId": "sess_demo_override",
  "demographics": { "ageMonths": 30, "sex": "male" },
  "vitals": { "temperatureC": 37.6 },
  "history": { "feverDurationDays": 1 },
  "symptoms": { "cough": true },
  "redFlagsObserved": { "convulsions": true }
}
```

**Expected response (truncated)**
```json
{
  "evaluationPath": "safety-override",
  "triage": {
    "level": "Emergency",
    "rationale": "1 red flag triggered: Active or recent convulsions. Safety override engaged — triage is fixed at Emergency irrespective of differential ranking."
  },
  "redFlags": [
    {
      "id": "RF_CONVULSIONS",
      "label": "Active or recent convulsions",
      "explanation": "Seizures in a febrile child suggest cerebral malaria, meningitis, or severe sepsis...",
      "triggeredBy": "(redFlagsObserved.convulsions == true)"
    }
  ],
  "differentials": [ /* full ranking still surfaced for the clinician */ ],
  "recommendedActions": [
    "Protect the airway; place in recovery position if unconscious or convulsing.",
    "Give rectal diazepam 0.5 mg/kg (or IV diazepam 0.2 mg/kg) if actively convulsing — per IMCI dosing.",
    "..."
  ]
}
```

Notice that the engine still surfaces the differential ranking (so the clinician can see the engine's reasoning) but the triage level is non-negotiable.

---

### Scenario 3 — Severe pneumonia signs (Urgent, standard path)

**Request**
```json
POST /v1/encounters/triage
{
  "sessionId": "sess_demo_pneumonia",
  "demographics": { "ageMonths": 18, "sex": "male" },
  "vitals": { "temperatureC": 38.6, "spo2": 92, "respiratoryRate": 56 },
  "history": { "feverDurationDays": 3 },
  "symptoms": { "cough": true, "fastBreathing": true, "chestIndrawing": true }
}
```

**Expected response (truncated)**
```json
{
  "evaluationPath": "standard",
  "triage": {
    "level": "Urgent",
    "rationale": "Top differential Pneumonia (community-acquired) (p=0.5...) is a high-acuity condition above the urgent threshold..."
  },
  "redFlags": [],
  "differentials": [
    { "id": "DX_PNEUMONIA", "probability": 0.50, "triggeredModifiers": [{"id":"PN_FAST_BREATH"...},{"id":"PN_INDRAWING"...},{"id":"PN_LOW_SPO2"...}] },
    { "id": "DX_MALARIA",   "probability": 0.30 },
    "..."
  ],
  "recommendedActions": [
    "Count respiratory rate over a full 60 seconds (do not estimate).",
    "If fast breathing for age per IMCI: oral amoxicillin at IMCI dosing.",
    "Any chest indrawing or SpO2 < 90%: classify as severe pneumonia → refer + first-dose IM ampicillin/gentamicin + oxygen if available.",
    "..."
  ]
}
```

---

## `GET /v1/encounters/:auditId`

Returns the full immutable audit record (after the Bull worker has persisted it).

## `PATCH /v1/encounters/:auditId/disposition`

Record what the clinician actually did with the engine's recommendation.

**Request**
```json
{
  "action": "accepted" | "ignored" | "overridden",
  "reason": "string (required when action = overridden)",
  "clinicianId": "optional clinician id"
}
```

**Responses**
- `200` — disposition recorded.
- `400` — missing `reason` when action = `overridden`.
- `404` — auditId not found.
- `409` — disposition already recorded (append-only).
