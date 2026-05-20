# Clinical Rationale

## (a) Why this condition cluster

**Febrile illness in a child under 5** is the highest-yield pathway for a Nigerian CDST pilot. Under-5 mortality in Nigeria is driven by treatable febrile illnesses — malaria, pneumonia, sepsis, diarrhoeal disease, and meningitis — and the WHO IMCI algorithm already encodes the assess-classify-treat structure used at the emergency. Translating an existing validated flowchart is safer than authoring novel clinical logic and the engine can be defended against a published reference rather than against my opinions.

The pathway also forces a confrontation with African epidemiology. A Western-trained engine would rank viral URTI first; in Nigeria that is dangerous. The ruleset reflects this — malaria carries the highest base weight, viral URTI is pinned last, and meningitis carries a red-flag predicate independent of differential ranking because the African meningitis belt makes "rule it out clinically before discharge" non-negotiable.

## (b) How the differential logic was sourced and validated

The ruleset (`v1.0.0-IMCI-NG`) is a *structural translation* of published sources, not original clinical guidance:

- **WHO IMCI Chart Booklet (2014 revision)** — symptom thresholds (fast breathing per age, dehydration signs), the "general danger signs" used as red flags, and the assess/treat/refer structure.
- **WHO IMCI Handbook for Outpatient Care (2005 and subsequent updates)** — first-action recommendations per classification.
- **Federal Ministry of Health Nigeria, *National Guidelines for Diagnosis and Treatment of Malaria* (2020, 3rd ed.)** — RDT-first protocol; artesunate (severe) and oral ACT (uncomplicated) as first-line.
- **WHO Africa Region brief, *Malaria in Children Under Five*** + NDHS child-morbidity data + WHO/UNICEF pneumonia/diarrhoea progress reports — justification for the relative base weights of malaria, pneumonia, sepsis, gastroenteritis, and measles in the Nigerian under-5 burden.
- **Nigeria Centre for Disease Control (NCDC)** — measles notifiable-disease guidance feeding the “isolate + notify” recommendation.

I did **not** derive the weights from a retrospective Nigerian outpatient cohort. The numeric weights are clinically reasoned seed values — direction and magnitude are consistent with the literature above, but they are not statistically calibrated. The ruleset's `provenance` block and the README state this plainly.

## (c) What production deployment would require from a medical governance standpoint

1. **Clinical Advisory Board sign-off** on every weight, red-flag, modifier, and action in `v1.0.0-IMCI-NG`, with PR review for every subsequent version. Ruleset files are immutable; new versions ship as `v1.1.0-IMCI-NG`, never edits in place.
2. **Calibration against a real cohort** — retrospective analysis comparing engine triage to consultant final diagnosis. Weights move on evidence, not opinion.
3. **Live monitoring of overrides.** Disposition data (`accepted | ignored | overridden`) feeds a weekly MDT review. Override patterns are the strongest signal that the ruleset is mis-calibrated for the local population.
4. **NDPR / NHIA-compliant storage** of audit records, with role-based access.
5. **Deprecation policy** — old ruleset versions are never deleted; they are read-only forever so past clinical decisions remain reproducible.
