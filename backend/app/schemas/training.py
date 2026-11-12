from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ORMModel

ClassicalModelFamily = Literal["tfidf_logistic_regression",]

TfidfAnalyzer = Literal[
    "word",
    "char",
    "char_wb",
]

LogisticRegressionSolver = Literal[
    "lbfgs",
    "liblinear",
    "newton-cg",
    "newton-cholesky",
    "sag",
    "saga",
]

ClassWeightValue = Literal["balanced",]


class TfidfTrainingConfiguration(ORMModel):
    analyzer: TfidfAnalyzer = "word"

    lowercase: bool = False
    strip_accents: None = None

    ngram_min: int = Field(
        default=1,
        ge=1,
        le=5,
    )

    ngram_max: int = Field(
        default=2,
        ge=1,
        le=6,
    )

    min_df: int = Field(
        default=2,
        ge=1,
        le=10_000,
    )

    max_df: float = Field(
        default=0.98,
        gt=0.0,
        le=1.0,
    )

    max_features: int | None = Field(
        default=100_000,
        ge=1_000,
        le=1_000_000,
    )

    sublinear_tf: bool = True
    use_idf: bool = True
    smooth_idf: bool = True
    norm: Literal["l1", "l2"] | None = "l2"

    @model_validator(mode="after")
    def validate_ngram_range(
        self,
    ) -> TfidfTrainingConfiguration:
        if self.ngram_min > self.ngram_max:
            raise ValueError("ngram_min must be less than or equal to ngram_max.")

        return self


class LogisticRegressionTrainingConfiguration(ORMModel):
    penalty: (
        Literal[
            "l1",
            "l2",
            "elasticnet",
        ]
        | None
    ) = "l2"

    solver: LogisticRegressionSolver = "liblinear"

    regularization_c: float = Field(
        default=1.0,
        gt=0.0,
        le=1_000.0,
    )

    max_iter: int = Field(
        default=2_000,
        ge=100,
        le=100_000,
    )

    class_weight: ClassWeightValue | None = "balanced"

    tolerance: float = Field(
        default=0.0001,
        gt=0.0,
        le=0.1,
    )

    fit_intercept: bool = True

    l1_ratio: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
    )

    @model_validator(mode="after")
    def validate_solver_and_penalty(
        self,
    ) -> LogisticRegressionTrainingConfiguration:
        supported_penalties = {
            "liblinear": {
                "l1",
                "l2",
            },
            "lbfgs": {
                "l2",
                None,
            },
            "newton-cg": {
                "l2",
                None,
            },
            "newton-cholesky": {
                "l2",
                None,
            },
            "sag": {
                "l2",
                None,
            },
            "saga": {
                "l1",
                "l2",
                "elasticnet",
                None,
            },
        }

        if self.penalty not in supported_penalties[self.solver]:
            raise ValueError(
                f"Penalty {self.penalty!r} is not supported by solver {self.solver!r}."
            )

        if self.penalty == "elasticnet":
            if self.solver != "saga":
                raise ValueError("Elastic-net penalty requires the saga solver.")

            if self.l1_ratio is None:
                raise ValueError("l1_ratio is required for elastic-net penalty.")

        elif self.l1_ratio is not None:
            raise ValueError("l1_ratio may only be provided with elastic-net penalty.")

        return self


class ClassicalTrainingRequest(ORMModel):
    research_question: str = Field(default="", max_length=3000)
    research_notes: str = Field(default="", max_length=10000)
    dataset_version_id: uuid.UUID

    experiment_name: str = Field(
        min_length=2,
        max_length=200,
    )

    experiment_description: str | None = None

    model_name: str = Field(
        default="BanglaGuard Classical Hate Speech Model",
        min_length=2,
        max_length=150,
    )

    model_version: str = Field(
        default="1.0.0",
        min_length=1,
        max_length=50,
    )

    model_family: ClassicalModelFamily = "tfidf_logistic_regression"

    random_seed: int = Field(
        default=42,
        ge=0,
        le=2_147_483_647,
    )

    code_version: str | None = Field(
        default=None,
        max_length=100,
    )

    preprocessing_version: str = Field(
        default="banglaguard-text-v1",
        min_length=1,
        max_length=100,
    )

    tfidf: TfidfTrainingConfiguration = Field(
        default_factory=TfidfTrainingConfiguration,
    )

    classifier: LogisticRegressionTrainingConfiguration = Field(
        default_factory=(LogisticRegressionTrainingConfiguration),
    )

    save_probabilities: bool = True
    save_classification_report: bool = True
    save_confusion_matrix: bool = True

    @field_validator(
        "experiment_name",
        "model_name",
        "model_version",
        "preprocessing_version",
    )
    @classmethod
    def clean_required_text(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Training text fields must not be empty.")

        return cleaned


class TrainingArtifactPaths(ORMModel):
    manifest: str
    processed: str
    train: str
    validation: str
    test: str


class TrainingReadinessRead(ORMModel):
    dataset_version_id: uuid.UUID

    dataset_name: str
    dataset_version: str
    task: str

    training_ready: bool
    quality_status: str
    quality_score: float

    total_samples: int
    train_samples: int
    validation_samples: int
    test_samples: int

    labels: list[str]
    label_distribution: dict[str, int]

    artifact_paths: TrainingArtifactPaths

    warnings: list[str]
    errors: list[str]
    recommendations: list[str]

    configuration: dict[str, Any]


class TrainingExperimentPaths(ORMModel):
    workspace: str
    configuration: str
    metadata: str
    logs: str
    artifacts: str
    metrics: str


class PreparedClassicalExperimentRead(ORMModel):
    experiment_id: uuid.UUID

    name: str
    status: str

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None

    task: str
    random_seed: int
    code_version: str | None

    training_ready: bool
    quality_score: float

    workspace_paths: TrainingExperimentPaths

    configuration: dict[str, Any]
    created_at: str


class ClassicalTrainingExecutionRead(ORMModel):
    experiment_id: uuid.UUID
    status: str

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None

    model_name: str
    model_version: str
    model_family: str
    task: str

    started_at: Any
    completed_at: Any
    duration_seconds: float

    artifact_path: str
    training_log_path: str
    execution_result_path: str

    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]

    model_version_registered: bool


class ClassicalModelRegistrationRead(ORMModel):
    experiment_id: uuid.UUID
    model_version_id: uuid.UUID

    name: str
    version: str
    task: str
    architecture: str
    status: str

    artifact_path: str
    preprocessing_version: str | None

    metrics: dict[str, Any]
    configuration: dict[str, Any]

    is_explainable: bool
    experiment_linked: bool

    created_at: Any


# ---------------------------------------------------------------------------
# Transformer training schemas
# ---------------------------------------------------------------------------

TransformerModelFamily = Literal["banglabert_sequence_classification",]

TransformerDevicePreference = Literal[
    "auto",
    "cuda",
    "mps",
    "cpu",
]

TransformerEvaluationStrategy = Literal[
    "no",
    "steps",
    "epoch",
]

TransformerSaveStrategy = Literal[
    "no",
    "steps",
    "epoch",
]

TransformerSchedulerType = Literal[
    "linear",
    "cosine",
    "cosine_with_restarts",
    "polynomial",
    "constant",
    "constant_with_warmup",
]

TransformerOptimizerName = Literal[
    "adamw_torch",
    "adamw_hf",
]


class TransformerModelConfiguration(ORMModel):
    pretrained_model_name_or_path: str = Field(
        default="csebuetnlp/banglabert",
        min_length=2,
        max_length=500,
    )

    tokenizer_name_or_path: str | None = Field(
        default=None,
        min_length=2,
        max_length=500,
    )

    max_sequence_length: int = Field(
        default=256,
        ge=16,
        le=512,
    )

    use_fast_tokenizer: bool = True
    trust_remote_code: bool = False

    gradient_checkpointing: bool = False

    @field_validator(
        "pretrained_model_name_or_path",
        "tokenizer_name_or_path",
    )
    @classmethod
    def clean_model_paths(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Transformer model and tokenizer paths must not be empty.")

        return cleaned


class TransformerOptimizationConfiguration(ORMModel):
    num_train_epochs: float = Field(
        default=3.0,
        gt=0.0,
        le=100.0,
    )

    train_batch_size: int = Field(
        default=8,
        ge=1,
        le=512,
    )

    evaluation_batch_size: int = Field(
        default=16,
        ge=1,
        le=512,
    )

    learning_rate: float = Field(
        default=2e-5,
        gt=0.0,
        le=1.0,
    )

    weight_decay: float = Field(
        default=0.01,
        ge=0.0,
        le=1.0,
    )

    warmup_ratio: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
    )

    gradient_accumulation_steps: int = Field(
        default=1,
        ge=1,
        le=1_024,
    )

    max_gradient_norm: float = Field(
        default=1.0,
        gt=0.0,
        le=100.0,
    )

    optimizer: TransformerOptimizerName = "adamw_torch"

    scheduler_type: TransformerSchedulerType = "linear"


class TransformerEvaluationConfiguration(ORMModel):
    evaluation_strategy: TransformerEvaluationStrategy = "epoch"
    save_strategy: TransformerSaveStrategy = "epoch"

    logging_steps: int = Field(
        default=50,
        ge=1,
        le=1_000_000,
    )

    evaluation_steps: int | None = Field(
        default=None,
        ge=1,
        le=1_000_000,
    )

    save_steps: int | None = Field(
        default=None,
        ge=1,
        le=1_000_000,
    )

    save_total_limit: int | None = Field(
        default=2,
        ge=1,
        le=100,
    )

    load_best_model_at_end: bool = True

    metric_for_best_model: str = Field(
        default="macro_f1",
        min_length=1,
        max_length=100,
    )

    greater_is_better: bool = True

    early_stopping_patience: int | None = Field(
        default=2,
        ge=1,
        le=100,
    )

    early_stopping_threshold: float = Field(
        default=0.0,
        ge=0.0,
    )

    @field_validator("metric_for_best_model")
    @classmethod
    def clean_best_model_metric(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("metric_for_best_model must not be empty.")

        return cleaned

    @model_validator(mode="after")
    def validate_evaluation_and_save_settings(
        self,
    ) -> TransformerEvaluationConfiguration:
        if self.evaluation_strategy == "steps" and self.evaluation_steps is None:
            raise ValueError(
                "evaluation_steps is required when evaluation_strategy is 'steps'."
            )

        if self.save_strategy == "steps" and self.save_steps is None:
            raise ValueError("save_steps is required when save_strategy is 'steps'.")

        if self.load_best_model_at_end:
            if self.evaluation_strategy == "no":
                raise ValueError("load_best_model_at_end requires evaluation.")

            if self.save_strategy == "no":
                raise ValueError("load_best_model_at_end requires checkpoint saving.")

            if self.evaluation_strategy != self.save_strategy:
                raise ValueError(
                    "The evaluation and save strategies must match "
                    "when load_best_model_at_end is enabled."
                )

            if (
                self.evaluation_strategy == "steps"
                and self.evaluation_steps is not None
                and self.save_steps is not None
                and self.save_steps % self.evaluation_steps != 0
            ):
                raise ValueError(
                    "save_steps must be a multiple of "
                    "evaluation_steps when loading the best model."
                )

        if self.early_stopping_patience is not None and not self.load_best_model_at_end:
            raise ValueError(
                "Early stopping requires load_best_model_at_end to be enabled."
            )

        return self


class TransformerRuntimeConfiguration(ORMModel):
    device_preference: TransformerDevicePreference = "auto"

    fp16: bool = False
    bf16: bool = False

    dataloader_num_workers: int = Field(
        default=0,
        ge=0,
        le=64,
    )

    dataloader_pin_memory: bool = False

    disable_tqdm: bool = True

    @model_validator(mode="after")
    def validate_precision_mode(
        self,
    ) -> TransformerRuntimeConfiguration:
        if self.fp16 and self.bf16:
            raise ValueError("fp16 and bf16 cannot both be enabled.")

        if self.device_preference == "cpu" and (self.fp16 or self.bf16):
            raise ValueError(
                "Mixed precision cannot be requested with the CPU device preference."
            )

        return self


class TransformerTrainingRequest(ORMModel):
    research_question: str = Field(default="", max_length=3000)
    research_notes: str = Field(default="", max_length=10000)
    dataset_version_id: uuid.UUID

    experiment_name: str = Field(
        min_length=2,
        max_length=200,
    )

    experiment_description: str | None = Field(
        default=None,
        max_length=5_000,
    )

    model_name: str = Field(
        default="BanglaGuard BanglaBERT Model",
        min_length=2,
        max_length=150,
    )

    model_version: str = Field(
        default="1.0.0",
        min_length=1,
        max_length=50,
    )

    model_family: TransformerModelFamily = "banglabert_sequence_classification"

    random_seed: int = Field(
        default=42,
        ge=0,
        le=2_147_483_647,
    )

    code_version: str | None = Field(
        default=None,
        max_length=100,
    )

    preprocessing_version: str = Field(
        default="banglaguard-transformer-text-v1",
        min_length=1,
        max_length=100,
    )

    model: TransformerModelConfiguration = Field(
        default_factory=TransformerModelConfiguration,
    )

    optimization: TransformerOptimizationConfiguration = Field(
        default_factory=TransformerOptimizationConfiguration,
    )

    evaluation: TransformerEvaluationConfiguration = Field(
        default_factory=TransformerEvaluationConfiguration,
    )

    runtime: TransformerRuntimeConfiguration = Field(
        default_factory=TransformerRuntimeConfiguration,
    )

    save_probabilities: bool = True
    save_classification_report: bool = True
    save_confusion_matrix: bool = True
    save_predictions: bool = True

    @field_validator(
        "experiment_name",
        "model_name",
        "model_version",
        "preprocessing_version",
    )
    @classmethod
    def clean_transformer_training_text(
        cls,
        value: str,
    ) -> str:
        cleaned = value.strip()

        if not cleaned:
            raise ValueError("Transformer training text fields must not be empty.")

        return cleaned

    @field_validator(
        "experiment_description",
        "code_version",
    )
    @classmethod
    def clean_optional_transformer_text(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()

        return cleaned or None


class TransformerTrainingReadinessRead(ORMModel):
    dataset_version_id: uuid.UUID

    dataset_name: str
    dataset_version: str
    task: str

    training_ready: bool
    quality_status: str
    quality_score: float

    total_samples: int
    train_samples: int
    validation_samples: int
    test_samples: int

    labels: list[str]
    label_distribution: dict[str, int]

    artifact_paths: TrainingArtifactPaths

    requested_device: str
    resolved_device: str

    pretrained_model_name_or_path: str
    tokenizer_name_or_path: str

    warnings: list[str]
    errors: list[str]
    recommendations: list[str]

    configuration: dict[str, Any]


class PreparedTransformerExperimentRead(ORMModel):
    experiment_id: uuid.UUID

    name: str
    status: str

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None

    task: str
    model_family: str

    random_seed: int
    code_version: str | None

    training_ready: bool
    quality_score: float

    requested_device: str
    resolved_device: str

    workspace_paths: TrainingExperimentPaths

    configuration: dict[str, Any]
    created_at: str


class TransformerTrainingExecutionRead(ORMModel):
    experiment_id: uuid.UUID
    status: str

    dataset_version_id: uuid.UUID
    model_version_id: uuid.UUID | None

    model_name: str
    model_version: str
    model_family: str
    task: str

    pretrained_model_name_or_path: str
    tokenizer_path: str

    requested_device: str
    resolved_device: str

    started_at: Any
    completed_at: Any
    duration_seconds: float

    artifact_path: str
    best_checkpoint_path: str | None

    training_log_path: str
    trainer_state_path: str | None
    execution_result_path: str

    training_metrics: dict[str, float]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]

    checkpoint_paths: list[str]

    model_version_registered: bool


class TransformerModelRegistrationRead(ORMModel):
    experiment_id: uuid.UUID
    model_version_id: uuid.UUID

    name: str
    version: str
    task: str
    architecture: str
    status: str

    artifact_path: str
    tokenizer_path: str
    preprocessing_version: str | None

    metrics: dict[str, Any]
    configuration: dict[str, Any]

    is_explainable: bool
    experiment_linked: bool

    created_at: Any
