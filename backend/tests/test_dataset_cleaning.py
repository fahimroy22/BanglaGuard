from unittest.mock import MagicMock

import pandas as pd

from app.domain.services.dataset_cleaning import (
    DatasetCleaningService,
)


def create_service() -> DatasetCleaningService:
    session = MagicMock()

    return DatasetCleaningService(session=session)


def test_clean_dataframe_removes_damaged_rows() -> None:
    dataframe = pd.DataFrame(
        [
            {
                "text": "স্বাভাবিক বাংলা বাক্য",
                "label": "non_hateful",
            },
            {
                "text": "ভাঙা� বাংলা বাক্য",
                "label": "hateful",
            },
            {
                "text": "আরেকটি স্বাভাবিক বাক্য",
                "label": "hateful",
            },
        ]
    )

    service = create_service()

    cleaned, counts = service.clean_dataframe(
        dataframe=dataframe,
        remove_replacement_character_rows=True,
        drop_empty_text=True,
        drop_empty_label=True,
        drop_duplicates=True,
    )

    assert len(cleaned) == 2

    assert (
        not cleaned["text"]
        .str.contains(
            "\ufffd",
            regex=False,
        )
        .any()
    )

    assert counts["source_rows"] == 3
    assert counts["cleaned_rows"] == 2
    assert counts["removed_rows"] == 1

    assert counts["removed_replacement_character_rows"] == 1


def test_clean_dataframe_removes_empty_and_duplicate_rows() -> None:
    dataframe = pd.DataFrame(
        [
            {
                "text": "একই বাক্য",
                "label": "hateful",
            },
            {
                "text": "একই বাক্য",
                "label": "hateful",
            },
            {
                "text": "",
                "label": "hateful",
            },
            {
                "text": "লেবেল নেই",
                "label": "",
            },
            {
                "text": "স্বাভাবিক বাক্য",
                "label": "non_hateful",
            },
        ]
    )

    service = create_service()

    cleaned, counts = service.clean_dataframe(
        dataframe=dataframe,
        remove_replacement_character_rows=True,
        drop_empty_text=True,
        drop_empty_label=True,
        drop_duplicates=True,
    )

    assert len(cleaned) == 2

    assert counts["removed_empty_text_rows"] == 1
    assert counts["removed_empty_label_rows"] == 1
    assert counts["removed_duplicate_text_rows"] == 1


def test_clean_dataframe_can_preserve_replacement_rows() -> None:
    dataframe = pd.DataFrame(
        [
            {
                "text": "ভাঙা� লেখা",
                "label": "hateful",
            },
            {
                "text": "স্বাভাবিক লেখা",
                "label": "non_hateful",
            },
        ]
    )

    service = create_service()

    cleaned, counts = service.clean_dataframe(
        dataframe=dataframe,
        remove_replacement_character_rows=False,
        drop_empty_text=True,
        drop_empty_label=True,
        drop_duplicates=True,
    )

    assert len(cleaned) == 2

    assert counts["removed_replacement_character_rows"] == 0
