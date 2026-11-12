# Evaluation and model promotion

## Explore a completed experiment

Open **Experiments → a completed run → Evaluation & error explorer**.

- Start with validation. Select test only for the final evaluation of your chosen configuration.
- Click a confusion-matrix cell to select actual/predicted labels. Reset filters if an earlier confidence/source filter hides its examples.
- Filter correct or incorrect examples by labels, confidence range, character-length range and source. Source uses the saved `source` column if available; otherwise the dataset name.
- Select **View** for saved text and class probabilities. **Explain with this model** computes a fresh attribution using that experiment's model artifact, independently of prediction history. A differing fresh prediction is flagged. Attribution scores describe influence, not probabilities.
- Reliability bins compare mean predicted confidence against observed accuracy. Missing probability outputs remain unavailable. The calibration gap is the sample-weighted absolute difference across ten bins.
- Accuracy uses a 95% Wilson interval. Macro F1 uses 1,000 deterministic multinomial bootstrap draws over confusion-matrix cells, equivalent to IID row resampling with a fixed label set. These intervals describe sampling variation, not model superiority, and do not account for correlated examples or seed variability.
- Seed summaries select the earliest run per distinct seed with identical fitting configuration, dataset, labels and evaluation examples. They show mean and sample standard deviation; one seed has no estimated standard deviation. Seed summaries and bootstrap intervals measure different kinds of variation.
- Compare another completed run to check dataset version, split, labels, saved label schema and evaluation-example checksum before interpreting scores.
- **Research report** downloads a ZIP containing metrics and intervals, configuration, available provenance, saved examples and interpretation notes. It includes dataset text.

## Evidence compatibility

New classical and BanglaBERT runs save an immutable row snapshot under `metrics/validation_evidence.json` and `metrics/test_evidence.json`. Dataset label schemas are captured when preparing new experiments. Text is the input passed to each model's training pipeline; classical text has already undergone its configured normalization. Missing source columns use a dataset-level source.

Existing transformer prediction JSONL files can supply matrices, probabilities and uncertainty, but they did not save immutable text or label definitions. The explorer explicitly marks those fields unavailable and does not guess row alignment with a potentially changed dataset. Older classical runs have no row predictions. Duplicate and train an older run to obtain complete evidence. Missing evidence is never fabricated, and existing metrics are not overwritten.

## Model lifecycle

In **Models**, open **Model card & lifecycle**:

1. **Registered candidate:** registration keeps the model inactive. The generated card links its experiment and dataset and includes metrics, configuration, available provenance and limitations.
2. **Evaluated:** a researcher or admin reviews a completed originating experiment, records known limitations and important-example behavior, then selects **Record evaluation review**.
3. The researcher records an **activation request** with notes.
4. **Approved:** an admin reviews the candidate against the current active model and approves or rejects it. Missing/incompatible evidence requires explicit acknowledgement and a reason; scores never trigger automatic approval.
5. **Active:** an admin activates the approved candidate with a reason. Changes to configuration/metrics or the current active version invalidate the approval. Artifact readiness is rechecked. The previously active version is recorded.
6. **Archived:** the existing admin archive controls remain available for inactive models. Restoring does not activate a model.

**Rollback** is available on an active model when a previous active version was recorded by this workflow. It requires admin access, a reason and a valid, unarchived previous artifact for the same task. Legacy active models keep working, but a prior-version link is not invented for activations that predate this feature.

Decisions are retained in the model configuration's server-owned promotion history and in the audit log. Per-task PostgreSQL transaction locks serialize promotion decisions. The old direct activation endpoint now returns a conflict directing callers to the approval workflow. No database schema migration is needed.

## Validation scope

Tests cover evaluation math, missing probabilities, path containment, legacy evidence limits, filters, report exports, admin access, promotion sequencing, stale approvals, rollback reasons and transformer row capture. Existing classical training/registration, archive and worker tests remain part of regression validation. No production model is activated, archived, retrained or rolled back by these tests.
