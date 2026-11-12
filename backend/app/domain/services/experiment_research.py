from __future__ import annotations

import hashlib
import importlib.metadata
import json
import shutil
import subprocess
from pathlib import Path

import psutil
from app.core.config import ROOT_DIR
from app.domain.services.training_jobs import fingerprint
from app.domain.services.training_readiness import TrainingReadinessService
from app.schemas.training import ClassicalTrainingRequest, TransformerTrainingRequest


def training_request(configuration):
    schema = (
        TransformerTrainingRequest
        if configuration.get("model_family") == "banglabert_sequence_classification"
        else ClassicalTrainingRequest
    )
    return schema.model_validate(configuration)


def duplicate_payload(experiment):
    config = dict(experiment.configuration or {})
    config.update(
        dataset_version_id=str(experiment.dataset_version_id),
        experiment_name=experiment.name,
        experiment_description=experiment.description,
        random_seed=experiment.random_seed or 42,
    )
    return training_request(config).model_dump(mode="json")


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dataset_hashes(configuration):
    paths = configuration.get("dataset", {}).get("artifact_paths", {})
    return {
        name: file_hash(path)
        for name, path in paths.items()
        if path and Path(path).is_file()
    }


def provenance(configuration, device=None):
    def git(*args):
        try:
            return subprocess.check_output(
                ["git", *args],
                cwd=ROOT_DIR,
                text=True,
                stderr=subprocess.DEVNULL,
                timeout=5,
            ).strip()
        except (OSError, subprocess.SubprocessError):
            return None

    packages = {}
    for name in (
        "torch",
        "transformers",
        "scikit-learn",
        "numpy",
        "pandas",
        "datasets",
        "accelerate",
        "tokenizers",
        "csebuetnlp-normalizer",
    ):
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    working_status = git("status", "--porcelain")
    return {
        "dataset_checksum": configuration.get("dataset", {}).get("checksum"),
        "dataset_file_sha256": dataset_hashes(configuration),
        "configuration_sha256": fingerprint(configuration),
        "code_revision": git("rev-parse", "HEAD"),
        "working_tree_dirty": None if working_status is None else bool(working_status),
        "packages": packages,
        "seed": configuration.get("random_seed"),
        "device": device,
        "validation_role": "Checkpoint selection and configuration tuning",
        "test_role": "Final evaluation after model fitting and validation selection",
    }


def preflight(dataset, payload):
    checks = []

    def add(name, status, detail):
        checks.append({"name": name, "status": status, "detail": detail})

    readiness = None
    try:
        readiness = TrainingReadinessService().evaluate(
            dataset_version=dataset, payload=payload
        )
        add(
            "Dataset and labels",
            "passed",
            f"{readiness['train_samples']} training, {readiness['validation_samples']} validation and {readiness['test_samples']} test rows.",
        )
        for warning in readiness.get("warnings", []):
            add("Dataset concern", "warning", str(warning))
    except Exception as exc:
        add("Dataset and labels", "blocked", str(exc)[:1500])
    disk = shutil.disk_usage(ROOT_DIR)
    add(
        "Disk space",
        "passed" if disk.free >= 1024**3 else "blocked",
        f"{disk.free / 1024**3:.1f} GB free. At least 1 GB is required; large checkpoints may need more.",
    )
    memory = psutil.virtual_memory()
    add(
        "Memory",
        "warning" if memory.available < 4 * 1024**3 else "passed",
        f"{memory.available / 1024**3:.1f} GB available. This is a snapshot, not a guarantee that the model fits.",
    )
    resolved = "cpu"
    if isinstance(payload, TransformerTrainingRequest):
        from app.domain.services.transformer_training_execution import (
            TransformerTrainingExecutionService,
        )

        try:
            _, resolved = TransformerTrainingExecutionService(None)._resolve_device(
                payload.model_dump(mode="json")
            )
            add(
                "Compute device",
                "passed",
                f"Requested {payload.runtime.device_preference}; resolved {resolved}. One training job runs at a time.",
            )
        except Exception as exc:
            add("Compute device", "blocked", str(exc))
        from transformers.utils.hub import cached_file

        targets = [
            (
                "Model configuration",
                payload.model.pretrained_model_name_or_path,
                "config.json",
            ),
            (
                "Tokenizer",
                payload.model.tokenizer_name_or_path
                or payload.model.pretrained_model_name_or_path,
                "tokenizer_config.json",
            ),
        ]
        for title, source, filename in targets:
            try:
                found = cached_file(source, filename, local_files_only=True)
                add(
                    title,
                    "passed" if found else "warning",
                    f"{source}: local file available."
                    if found
                    else f"{source}: may require a download.",
                )
            except Exception:
                is_local = Path(source).is_absolute() or source.startswith(".")
                add(
                    title,
                    "blocked" if is_local else "warning",
                    f"{source}: local files unavailable. "
                    + (
                        "Correct the local path."
                        if is_local
                        else "The worker may need internet access to download this checkpoint."
                    ),
                )
        source = payload.model.pretrained_model_name_or_path
        weights = False
        for filename in (
            "model.safetensors",
            "pytorch_model.bin",
            "model.safetensors.index.json",
            "pytorch_model.bin.index.json",
        ):
            try:
                if cached_file(source, filename, local_files_only=True):
                    weights = True
                    break
            except Exception:
                pass
        add(
            "Model weights",
            "passed"
            if weights
            else "blocked"
            if Path(source).is_absolute() or source.startswith(".")
            else "warning",
            "Cached weights found."
            if weights
            else "Weights not found in the local cache; downloading and loading are checked again by the worker.",
        )
    else:
        add(
            "Compute device",
            "passed",
            "CPU training in a separate process; numerical libraries limited to two threads.",
        )
    return {
        "ready": not any(c["status"] == "blocked" for c in checks),
        "checks": checks,
        "readiness": readiness,
        "device": resolved,
    }


def compatible_checkpoints(experiment, job):
    if (
        not job
        or job["configuration"].get("model_family")
        != "banglabert_sequence_classification"
    ):
        return []
    if fingerprint(experiment.configuration) != job["configuration_hash"]:
        return []
    try:
        if dataset_hashes(experiment.configuration) != job.get("provenance", {}).get(
            "dataset_file_sha256"
        ):
            return []
        root = Path(experiment.configuration["output"]["checkpoints"]).resolve()
        root.relative_to(
            (ROOT_DIR / "storage" / "experiments" / str(experiment.id)).resolve()
        )
    except (KeyError, ValueError, OSError):
        return []
    result = []
    for path in root.glob("checkpoint-*"):
        if path.is_symlink() or not path.is_dir():
            continue
        required = (
            "trainer_state.json",
            "optimizer.pt",
            "scheduler.pt",
            "rng_state.pth",
            "banglaguard-resume.json",
        )
        if not all((path / f).is_file() for f in required):
            continue
        if not (
            (path / "model.safetensors").is_file()
            or (path / "pytorch_model.bin").is_file()
        ):
            continue
        try:
            state = json.loads((path / "trainer_state.json").read_text())
            marker = json.loads((path / "banglaguard-resume.json").read_text())
            if (
                marker.get("configuration_sha256") != job["configuration_hash"]
                or marker.get("dataset_file_sha256")
                != job.get("provenance", {}).get("dataset_file_sha256")
                or marker.get("step") != state.get("global_step")
            ):
                continue
            if any(
                marker.get("packages", {}).get(name) != importlib.metadata.version(name)
                for name in ("torch", "transformers")
            ):
                continue
            result.append(
                {
                    "name": path.name,
                    "step": int(state["global_step"]),
                    "epoch": state.get("epoch"),
                }
            )
        except (
            OSError,
            ValueError,
            KeyError,
            TypeError,
            importlib.metadata.PackageNotFoundError,
        ):
            continue
    return sorted(result, key=lambda item: item["step"], reverse=True)
