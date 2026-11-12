from enum import StrEnum


class UserRole(StrEnum):
    USER = "user"
    RESEARCHER = "researcher"
    ADMIN = "admin"


class AnalysisTask(StrEnum):
    HATE_SPEECH = "hate_speech"
    SENTIMENT = "sentiment"


class PredictionStatus(StrEnum):
    COMPLETED = "completed"
    FAILED = "failed"


class FeedbackVerdict(StrEnum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    UNSURE = "unsure"


class FeedbackStatus(StrEnum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    REJECTED = "rejected"


class ModelStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    RETIRED = "retired"


class ExperimentStatus(StrEnum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class BatchJobStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DatasetExportStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DatasetExportFormat(StrEnum):
    CSV = "csv"
    JSONL = "jsonl"
