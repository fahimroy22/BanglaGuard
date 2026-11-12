# Reproducible experiments and background training

## Researcher workflow

1. Open **Experiments → New experiment**. Choose a built-in classical/BanglaBERT preset, or save/load a named preset associated with your account.
2. To reuse a run, open its details, select **Duplicate experiment**, then **Load copy**. The new setup shows every changed configuration field beside its original value. Preparing creates a new experiment; results and artifacts are not copied.
3. Enter the research question and method notes. Select the dataset, seed, model and training settings. The run summary explains checkpoint selection and validation/test roles.
4. **Check readiness** runs the expanded preflight: dataset integrity/labels/splits, available RAM, free disk, requested compute, local model configuration, tokenizer configuration and cached weights. Missing remote files are a warning because the worker can download them; an invalid local model path blocks the run. Memory/disk availability cannot guarantee a model will fit.
5. Prepare the experiment, then **Start background training**. Submission returns HTTP 202 with a durable job ID; it does not wait for training.
6. The progress panel shows queued/preparing/training/evaluating/saving/completed, measured optimizer steps/epochs, recorded loss and validation F1, training ETA after five new steps, device, process CPU/RAM and system RAM. Stage animations respect reduced-motion preferences. Classical fitting has stage progress, not fabricated epoch curves.
7. Leave the page and return at any time. The header notification inbox retains completed/failed/cancelled updates until dismissed.
8. Cancellation requires confirmation. Retry uses the saved configuration. To change parameters, duplicate instead. Resume is offered only for a complete checkpoint carrying matching configuration and dataset hashes and matching Torch/Transformers versions. An atomic marker is written after checkpoint saving finishes. Older checkpoints without this marker are not offered.

Validation is used during fitting/checkpoint selection. The test split is evaluated only after fitting and checkpoint selection. Existing execution services still perform final test evaluation for each completed run: researchers must choose configurations using validation results rather than repeatedly selecting against test results. A separate “evaluate test only once” approval workflow is not part of this change.

## Persistence and isolation

- PostgreSQL retains experiment records and results. `storage/training-jobs/queue.sqlite3` retains queued jobs, progress, bounded metric history, presets and notification acknowledgements. Keep both stores and experiment artifact directories in backups.
- This is a **single-host local worker**, matching the current macOS deployment. File locks and a SQLite unique active-experiment index prevent duplicate local execution. One worker runs training at a time; numerical libraries/Torch use two CPU threads. Heavy model work is in a separate process, so HTTP requests and browser lifetimes do not own it. Shared GPU/memory load can still affect inference latency.
- The API starts a detached supervisor when work is queued and wakes it for pending work at startup. The supervisor survives API reloads and browser closure. After a machine restart or worker crash, interrupted jobs become failed with retry/resume guidance; no run is silently restarted from a different state.
- Worker logs live at `storage/training-jobs/<job-id>.log`. Per-attempt provenance and prior results live in `storage/training-jobs/<job-id>/`. Logs are currently retained without automatic rotation; the UI reads only the last 20 KB. Metric history retains the latest 2,000 entries.
- Provenance includes actual dataset-file SHA-256 values, registered dataset checksum, configuration hash, Git revision/dirty state, package versions, random seed and resolved device. GPU utilization is not measured.
- Cancelling a queued job leaves its unstarted experiment prepared. Cancelling a running experiment uses the existing `failed` experiment enum; the job preserves the distinct `cancelled` state. No PostgreSQL migration or new dependency is required.
- Training control requires `training_execute`; retry/cancel/resume are restricted to the original job owner or an admin. Setup/presets require `experiment_create`; viewing progress uses `research_view`. Presets and notification acknowledgements belong to the current account.
- Existing `/execute-classical` and `/execute-transformer` now return accepted job responses (HTTP 202), not final metric responses. Frontend callers are updated.

## Worker operation

The API launches the worker automatically. To run it manually from `backend` in the project's virtual environment:

```sh
python -m app.workers.training supervisor
```

Only one supervisor can hold the queue lock. Stop running training through the UI before intentionally changing training code or managing the supervisor. Do not delete the SQLite queue to clear jobs.

## Validation

Regression coverage includes concurrent enqueue attempts, persistent cross-process queue state, cancellation/notification ownership, interrupted-worker reconciliation, compatible checkpoint filtering, Trainer callback progress, actual classical model fitting/artifact creation with isolated fixtures, and progress HTTP responses while a separate synthetic worker runs.
