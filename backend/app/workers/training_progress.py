import json
import math
import time
from pathlib import Path

from transformers import TrainerCallback


class TrainingProgressCallback(TrainerCallback):
    def __init__(self, store, job_id, provenance):
        self.store = store
        self.job_id = job_id
        self.provenance = provenance

    def on_train_begin(self, args, state, control, **kwargs):
        self.initial_step = state.global_step
        self.started = time.monotonic()
        self.store.event(
            self.job_id,
            state="training",
            progress={
                "step": state.global_step,
                "total_steps": state.max_steps,
                "epoch": state.epoch,
                "total_epochs": args.num_train_epochs,
            },
        )

    def on_step_end(self, args, state, control, **kwargs):
        delta = state.global_step - self.initial_step
        eta = (
            (time.monotonic() - self.started)
            / delta
            * (state.max_steps - state.global_step)
            if delta >= 5
            else None
        )
        self.store.event(
            self.job_id,
            state="training",
            progress={
                "step": state.global_step,
                "total_steps": state.max_steps,
                "epoch": state.epoch,
                "total_epochs": args.num_train_epochs,
                "eta_seconds": eta,
            },
        )

    def on_log(self, args, state, control, logs=None, **kwargs):
        numeric = {
            k: float(v)
            for k, v in (logs or {}).items()
            if isinstance(v, (int, float)) and math.isfinite(v)
        }
        self.store.event(
            self.job_id,
            metrics=dict(numeric, step=state.global_step, epoch=state.epoch),
        )

    def on_save(self, args, state, control, **kwargs):
        directory = Path(args.output_dir) / f"checkpoint-{state.global_step}"
        marker = directory / "banglaguard-resume.json"
        temporary = directory / "banglaguard-resume.tmp"
        temporary.write_text(json.dumps(dict(self.provenance, step=state.global_step)))
        temporary.replace(marker)

    def on_evaluate(self, args, state, control, **kwargs):
        self.store.event(self.job_id, state="training")
