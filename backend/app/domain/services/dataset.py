import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ROOT_DIR
from app.db.models import DatasetVersion
from app.db.repositories.dataset_version import (
    DatasetVersionRepository,
)
from app.domain.enums import AnalysisTask
from app.ml.dataset_processing import (
    DatasetProcessingResult,
    DatasetValidationError,
    process_dataset,
)


class UnsupportedDatasetFileError(Exception):
    pass


class DatasetService:
    def __init__(
        self,
        session: AsyncSession,
    ) -> None:
        self.session = session
        self.repository = DatasetVersionRepository(session)

    async def upload_and_register(
        self,
        file: UploadFile,
        name: str,
        version: str,
        task: AnalysisTask,
        description: str | None,
        source_name: str | None,
        source_url: str | None,
        license_name: str | None,
    ) -> DatasetVersion:
        original_filename = file.filename or "dataset.csv"

        if not original_filename.lower().endswith(".csv"):
            raise UnsupportedDatasetFileError

        upload_id = uuid.uuid4()

        raw_directory = (
            ROOT_DIR
            / "research"
            / "data"
            / "external"
            / str(upload_id)
        )

        processed_directory = (
            ROOT_DIR
            / "research"
            / "data"
            / "processed"
            / str(upload_id)
        )

        raw_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        source_path = raw_directory / "source.csv"

        with source_path.open("wb") as destination:
            shutil.copyfileobj(
                file.file,
                destination,
            )

        result: DatasetProcessingResult = process_dataset(
            source_path=source_path,
            output_directory=processed_directory,
        )

        dataset_version = DatasetVersion(
            name=name.strip(),
            version=version.strip(),
            description=description,
            source_name=source_name,
            source_url=source_url,
            license_name=license_name,
            task=task,
            total_samples=result.total_samples,
            train_samples=result.train_samples,
            validation_samples=result.validation_samples,
            test_samples=result.test_samples,
            manifest_path=result.manifest_path,
            checksum=result.checksum,
            label_schema=result.label_schema,
            preprocessing_config={
                "duplicate_key": "text",
                "missing_rows_removed": True,
                "random_seed": 42,
                "split": {
                    "train": 0.80,
                    "validation": 0.10,
                    "test": 0.10,
                },
            },
        )

        return await self.repository.add(
            dataset_version
        )