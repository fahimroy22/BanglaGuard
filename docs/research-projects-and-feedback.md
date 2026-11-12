# Research projects and the feedback loop

## Where to start

Open **Research projects** in the sidebar, or follow the link from **Feedback**. Create a project with a task, research question, team, annotation guidelines, and reviewed-example notification threshold.

- Regular users submit corrections from Prediction/Feedback. They cannot access research projects or review assignments.
- Researchers create projects and access projects they own or belong to. Members link resources, add notes/reports, submit assigned reviews, and create feedback dataset versions.
- Project owners and admins assign two to five distinct active researchers/admins from the project team. The feedback author cannot review their own correction.
- Admins can access all projects and adjudicate disagreements with a recorded reason.

## Review assignments

Choose a pending feedback record and reviewers under **Review assignments**. Each form includes a snapshot of the project's guidelines and the model's recorded label choices. Reviewers can choose a label or reject an ambiguous/unsuitable example. Other votes remain hidden until they submit; admins can inspect votes for adjudication.

All reviewers must vote. Matching labels accept the record, unanimous rejection rejects it, and different decisions require admin adjudication. Final decisions and original votes are retained. The older single-review endpoint cannot override an assigned record. Progress shows submitted assignments per reviewer.

If a database interruption occurs after a decision was saved, **Restore saved decision** synchronizes that immutable decision back to feedback. Export requires both the accepted decision and the matching saved feedback state.

## New dataset versions and duplicate checks

**Dataset and lineage → Create dataset version** collects up to 500 unused accepted project records. It creates a separate, unsplit training pool. Existing dataset files and established validation/test splits are never modified. Open the new version's dataset workspace for analysis and deliberate preparation before training; document any new evaluation version and its split policy.

Duplicate matching uses Unicode NFC normalization, whitespace normalization and case folding. It checks within the selection, prior tracked feedback exports, retained dataset fingerprints, and all datasets explicitly linked to the project. All conflicting-label groups are skipped; identical same-label examples retain one representative. A failed linked-dataset scan blocks export rather than silently skipping the check. This is exact normalized matching, not semantic or near-duplicate detection.

The manifest includes included feedback IDs, skipped IDs/reasons, fingerprints and duplicate-check scope. Dataset metadata also stores provenance, so deleting an export-history entry does not erase its dataset lineage. Legacy exports without fingerprints are counted explicitly in the report; link their readable datasets to include them in scanning. Historical inclusion is not guessed from selection IDs.

## Keeping the project connected

Resources can include datasets/versions, experiments, models, compatible-task model comparison pairs, your saved prediction suites and feedback. Pick resources by name (the picker lists up to 500 recent resources per category). Saved suites retain their existing owner/admin access rules. Notes and text reports are stored with their author; experiment reports remain available from the linked experiment.

The next-action panel uses recorded state: linked dataset → check readiness/create baseline; completed experiment → review errors; evaluated candidate → request activation. It does not equate registration with training readiness or automatically activate models.

A header badge and project notice appear when distinct accepted, unexported examples reach the configured threshold. Counts exclude conflicting-label groups and previously fingerprinted examples; final export performs the full linked-dataset duplicate check. Notifications refresh in the interface every minute while it is open. No email is sent.

## Persistence

Projects, assignments, guideline snapshots, votes, adjudication reasons and notes live in `storage/research-loop/loop.sqlite3`; override with `BANGLAGUARD_LOOP_ROOT`. Back this up together with PostgreSQL, datasets and manifests. This follows the platform's current single-host storage design. Final annotation decisions are immutable; submit a new correction when new evidence changes a label.
