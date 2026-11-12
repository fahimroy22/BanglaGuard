from __future__ import annotations

from pathlib import Path
from typing import ClassVar

from app.core.config import ROOT_DIR
from app.db.models import ModelVersion


class ModelActivationError(Exception):
    """Base error for model activation failures."""


class UnsupportedModelArchitectureError(ModelActivationError):
    """Raised when the prediction service cannot serve the model."""


class ModelActivationArtifactError(ModelActivationError):
    """Raised when a registered model artifact is not activation-ready."""


class ModelActivationService:
    """Validate whether a registered model can safely become active."""

    classical_architectures: ClassVar[frozenset[str]] = frozenset(
        {
            "tfidf_logistic_regression",
            "tfidf_linear_svm",
        }
    )

    transformer_architectures: ClassVar[frozenset[str]] = frozenset(
        {
            "banglabert_sequence_classification",
            "transformer_sequence_classification",
        }
    )

    supported_architectures: ClassVar[frozenset[str]] = (
        classical_architectures | transformer_architectures
    )

    def validate(
        self,
        model_version: ModelVersion,
    ) -> None:
        if getattr(model_version, "is_archived", False):
            raise ModelActivationArtifactError("Restore this archived model before activating it.")

        architecture = model_version.architecture

        if architecture not in self.supported_architectures:
            raise UnsupportedModelArchitectureError(
                "This model architecture is not supported "
                "by the BanglaGuard prediction service."
            )

        if architecture in self.classical_architectures:
            self._validate_classical(model_version)
            return

        self._validate_transformer(model_version)

    def _validate_classical(
        self,
        model_version: ModelVersion,
    ) -> None:
        artifact_path = self._resolve_path(model_version.artifact_path)

        if artifact_path.is_dir():
            artifact_path = artifact_path / "model.joblib"

        if not artifact_path.is_file():
            raise ModelActivationArtifactError(
                f"The classical model artifact could not be found: {artifact_path}"
            )

        if artifact_path.stat().st_size <= 0:
            raise ModelActivationArtifactError("The classical model artifact is empty.")

    def _validate_transformer(
        self,
        model_version: ModelVersion,
    ) -> None:
        artifact_path = self._resolve_path(model_version.artifact_path)

        if not artifact_path.is_dir():
            raise ModelActivationArtifactError(
                "The Transformer model artifact must be an existing directory."
            )

        required_model_files = [
            artifact_path / "config.json",
        ]

        missing_model_files = [
            path.name for path in required_model_files if not path.is_file()
        ]

        if missing_model_files:
            raise ModelActivationArtifactError(
                "The Transformer model artifact is "
                "missing required files: " + ", ".join(missing_model_files) + "."
            )

        weight_candidates = [
            artifact_path / "model.safetensors",
            artifact_path / "pytorch_model.bin",
        ]

        if not any(path.is_file() for path in weight_candidates):
            raise ModelActivationArtifactError(
                "The Transformer model artifact does not contain model weights."
            )

        tokenizer_path = self._resolve_path(
            model_version.tokenizer_path or model_version.artifact_path
        )

        if not tokenizer_path.is_dir():
            raise ModelActivationArtifactError(
                "The Transformer tokenizer artifact must be an existing directory."
            )

        tokenizer_config = tokenizer_path / "tokenizer_config.json"

        if not tokenizer_config.is_file():
            raise ModelActivationArtifactError(
                "The Transformer tokenizer artifact is missing tokenizer_config.json."
            )

        vocabulary_candidates = [
            tokenizer_path / "tokenizer.json",
            tokenizer_path / "vocab.txt",
            tokenizer_path / "sentencepiece.bpe.model",
            tokenizer_path / "spiece.model",
            tokenizer_path / "vocab.json",
        ]

        if not any(path.is_file() for path in vocabulary_candidates):
            raise ModelActivationArtifactError(
                "The Transformer tokenizer artifact "
                "does not contain a supported "
                "vocabulary file."
            )

    @staticmethod
    def _resolve_path(
        value: str,
    ) -> Path:
        path = Path(value).expanduser()

        if not path.is_absolute():
            path = ROOT_DIR / path

        return path.resolve()
