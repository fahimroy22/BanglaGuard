# Prediction research workspace

Open **Prediction**, then scroll to the research testing workspace below the main result.

## Access

- Users: production-model prediction, CSV batches, and feedback on their own predictions.
- Researchers: candidate-model prediction, side-by-side comparisons, private test suites, regression runs, and activation requests.
- Admins: researcher features, access to all saved suites/runs, and approval/activation decisions.
- API permissions enforce these restrictions independently of visible controls.

## Workflow

1. Compare two models on the same input and task. Check the label compatibility notice before interpreting differences.
2. Upload a UTF-8 CSV, preview its columns, select the text column and model, and download results. Batches allow up to 50 rows and 2 MB. Invalid text rows receive an error column; successful predictions enter your history. CSV explanations are off in the interface. Spreadsheet formula-like values are escaped in downloads.
3. Create a named test suite with expected labels, categories, and notes. Save edits before running. Categories organize cases; expected labels determine correctness.
4. Run a candidate against the saved suite and the current production model. Inspect errors and cases where production was correct but the candidate was wrong. Download the immutable run report.
5. Attach the run in **Models → promotion review → activation request**. Candidate configuration, metrics, artifact path, suite version, and production baseline must still match. Execution errors block approval. Failed examples require explicit admin acknowledgement and a reason. Emergency rollback retains its existing separate process.

## Results

Each new prediction records the actual model used and whether it was explicitly selected or was the production default. Changing the selection does not relabel previous results.

Review policy `review-v1` marks **Needs review** when confidence is below 60%, the top-two class margin is below 15 percentage points, or a usable margin is unavailable. Scores and predictions are unchanged. This heuristic does not claim calibrated confidence.

Model loading, prediction, and explanation time are shown separately. Disabling explanations skips attribution computation. Input preview shows normalization and, for transformers, decoded tokens after truncation. Decoded spacing may differ. Text-storage policy controls retained text previews. Older results may lack timing metadata.

Inline feedback follows existing ownership and one-feedback-per-prediction rules. Comparison results also belong to the requesting account.

## Operations and limits

Inference runs off the API event loop. Transformer prediction/explanation accesses are serialized to protect shared cached model gradients; unrelated API endpoints remain available. CSV and regression runs are bounded HTTP requests, not persistent background jobs, and should be allowed to finish before leaving the page.

Suites and immutable runs use `storage/prediction-research/research.sqlite3` (override with `BANGLAGUARD_RESEARCH_ROOT`). Include this folder in backups. This store targets the existing single-host deployment. Suite rows are private to the owner and admins; attached promotion cards share the run summary without example text. Small suites supplement, rather than replace, held-out dataset evaluation.
