import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.domain.enums import (
    AnalysisTask,
    BatchJobStatus,
    ExperimentStatus,
    FeedbackStatus,
    FeedbackVerdict,
    ModelStatus,
    PredictionStatus,
    UserRole,
)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        default=UserRole.USER,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="user",
    )

    feedback_items: Mapped[list["Feedback"]] = relationship(
        back_populates="user",
        foreign_keys="Feedback.user_id",
    )

    batch_jobs: Mapped[list["BatchJob"]] = relationship(
        back_populates="user",
    )


class DatasetVersion(TimestampMixin, Base):
    __tablename__ = "dataset_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    version: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
    )

    source_name: Mapped[str | None] = mapped_column(
        String(255),
    )

    source_url: Mapped[str | None] = mapped_column(
        String(500),
    )

    license_name: Mapped[str | None] = mapped_column(
        String(150),
    )

    task: Mapped[AnalysisTask] = mapped_column(
        Enum(AnalysisTask, name="dataset_analysis_task"),
        nullable=False,
    )

    total_samples: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    train_samples: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    validation_samples: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    test_samples: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    manifest_path: Mapped[str | None] = mapped_column(
        String(500),
    )

    checksum: Mapped[str | None] = mapped_column(
        String(128),
    )

    label_schema: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    preprocessing_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    experiments: Mapped[list["Experiment"]] = relationship(
        back_populates="dataset_version",
    )


class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    version: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    task: Mapped[AnalysisTask] = mapped_column(
        Enum(AnalysisTask, name="model_analysis_task"),
        nullable=False,
    )

    architecture: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    status: Mapped[ModelStatus] = mapped_column(
        Enum(ModelStatus, name="model_status"),
        default=ModelStatus.DRAFT,
        nullable=False,
    )

    artifact_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    tokenizer_path: Mapped[str | None] = mapped_column(
        String(500),
    )

    preprocessing_version: Mapped[str | None] = mapped_column(
        String(100),
    )

    metrics: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    configuration: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    is_explainable: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    activated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    predictions: Mapped[list["Prediction"]] = relationship(
        back_populates="model_version",
    )

    experiments: Mapped[list["Experiment"]] = relationship(
        back_populates="model_version",
    )


class Experiment(TimestampMixin, Base):
    __tablename__ = "experiments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
    )

    status: Mapped[ExperimentStatus] = mapped_column(
        Enum(ExperimentStatus, name="experiment_status"),
        default=ExperimentStatus.PLANNED,
        nullable=False,
    )

    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dataset_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )

    model_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("model_versions.id", ondelete="SET NULL"),
    )

    random_seed: Mapped[int | None] = mapped_column(
        Integer,
    )

    code_version: Mapped[str | None] = mapped_column(
        String(100),
    )

    configuration: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    results: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    dataset_version: Mapped["DatasetVersion"] = relationship(
        back_populates="experiments",
    )

    model_version: Mapped["ModelVersion | None"] = relationship(
        back_populates="experiments",
    )


class Prediction(TimestampMixin, Base):
    __tablename__ = "predictions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )

    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("model_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )

    task: Mapped[AnalysisTask] = mapped_column(
        Enum(AnalysisTask, name="prediction_analysis_task"),
        nullable=False,
    )

    status: Mapped[PredictionStatus] = mapped_column(
        Enum(PredictionStatus, name="prediction_status"),
        default=PredictionStatus.COMPLETED,
        nullable=False,
    )

    input_text: Mapped[str | None] = mapped_column(
        Text,
    )

    normalized_text: Mapped[str | None] = mapped_column(
        Text,
    )

    language_form: Mapped[str | None] = mapped_column(
        String(50),
    )

    predicted_label: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    confidence: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    probabilities: Mapped[dict[str, float] | None] = mapped_column(
        JSONB,
    )

    explanation: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
    )

    latency_ms: Mapped[float | None] = mapped_column(
        Float,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
    )

    user: Mapped["User | None"] = relationship(
        back_populates="predictions",
    )

    model_version: Mapped["ModelVersion"] = relationship(
        back_populates="predictions",
    )

    feedback_items: Mapped[list["Feedback"]] = relationship(
        back_populates="prediction",
        cascade="all, delete-orphan",
    )


class Feedback(TimestampMixin, Base):
    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    prediction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("predictions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    verdict: Mapped[FeedbackVerdict] = mapped_column(
        Enum(FeedbackVerdict, name="feedback_verdict"),
        nullable=False,
    )

    status: Mapped[FeedbackStatus] = mapped_column(
        Enum(FeedbackStatus, name="feedback_status"),
        default=FeedbackStatus.PENDING,
        nullable=False,
    )

    corrected_label: Mapped[str | None] = mapped_column(
        String(100),
    )

    comment: Mapped[str | None] = mapped_column(
        Text,
    )

    reviewer_note: Mapped[str | None] = mapped_column(
        Text,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    prediction: Mapped["Prediction"] = relationship(
        back_populates="feedback_items",
    )

    user: Mapped["User | None"] = relationship(
        back_populates="feedback_items",
        foreign_keys=[user_id],
    )

    reviewer: Mapped["User | None"] = relationship(
        foreign_keys=[reviewed_by_id],
    )


class BatchJob(TimestampMixin, Base):
    __tablename__ = "batch_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    task: Mapped[AnalysisTask] = mapped_column(
        Enum(AnalysisTask, name="batch_analysis_task"),
        nullable=False,
    )

    status: Mapped[BatchJobStatus] = mapped_column(
        Enum(BatchJobStatus, name="batch_job_status"),
        default=BatchJobStatus.PENDING,
        nullable=False,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    input_path: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    output_path: Mapped[str | None] = mapped_column(
        String(500),
    )

    total_rows: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    processed_rows: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    failed_rows: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    error_message: Mapped[str | None] = mapped_column(
        Text,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
    )

    user: Mapped["User | None"] = relationship(
        back_populates="batch_jobs",
    )