"""Import CSV splits without shuffling or removing benchmark rows."""
import csv
import io
import json
import shutil
import uuid
from pathlib import Path

import pandas as pd
from fastapi import UploadFile
from app.core.config import ROOT_DIR
from app.domain.services.dataset import DatasetService
from app.ml.dataset_processing import DatasetProcessingResult, calculate_checksum

MAX_BYTES = 50 * 1024 * 1024


def parse_split(data: bytes, text_column: str, label_column: str, mapping: dict[str, str]) -> pd.DataFrame:
    try:
        reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
        headers = reader.fieldnames or []
        if text_column == label_column or text_column not in headers or label_column not in headers or len(headers) != len(set(headers)):
            raise ValueError('Choose distinct text and label columns present in every CSV; duplicate headers are not supported.')
        rows = []
        for number, row in enumerate(reader, 2):
            text_value, label = row.get(text_column), row.get(label_column)
            if None in row or text_value is None or label is None or not text_value.strip() or not label.strip():
                raise ValueError(f'Row {number} has missing text, label, or inconsistent columns.')
            label = label.strip()
            if mapping:
                if label not in mapping:
                    raise ValueError(f'Row {number}: label {label!r} has no mapping.')
                label = mapping[label]
            rows.append({'text': text_value, 'label': label})
        if not rows:
            raise ValueError('Each split must contain at least one row.')
        return pd.DataFrame(rows)
    except csv.Error as exc:
        raise ValueError('CSV could not be parsed; check quoting and field lengths.') from exc
    except UnicodeDecodeError as exc:
        raise ValueError('CSV files must use UTF-8 encoding.') from exc


async def import_splits(session, files: dict[str, UploadFile], metadata: dict, text_column: str, label_column: str, mapping: dict[str, str]):
    frames, originals = {}, {}
    for key, upload in files.items():
        if not (upload.filename or '').lower().endswith('.csv'):
            raise ValueError('Select one CSV file for each split.')
        data = await upload.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('Each CSV must be 50 MB or smaller.')
        frames[key] = parse_split(data, text_column, label_column, mapping)
        originals[key] = data
    train_labels = set(frames['train']['label'])
    if len(train_labels) < 2:
        raise ValueError('Training split must contain at least two sentiment/classes labels.')
    for key in ['validation', 'test']:
        if not set(frames[key]['label']).issubset(train_labels):
            raise ValueError(f'{key} contains labels absent from training.')
    combined = pd.concat(list(frames.values()), ignore_index=True)
    if len(combined) < 20:
        raise ValueError('At least 20 rows are required across the three splits.')
    identity = uuid.uuid4()
    raw = ROOT_DIR / 'research/data/external' / str(identity)
    processed = ROOT_DIR / 'research/data/processed' / str(identity)
    try:
        raw.mkdir(parents=True)
        processed.mkdir(parents=True)
        paths = {}
        for key, frame in {'processed': combined, **frames}.items():
            path = processed / f'{key}.csv'
            frame.to_csv(path, index=False, encoding='utf-8')
            paths[key] = str(path)
        for key, data in originals.items():
            (raw / f'{key}.csv').write_bytes(data)
        counts = {key: len(frame) for key, frame in frames.items()}
        distribution = {str(label): int(count) for label, count in combined.label.value_counts().items()}
        checksum = calculate_checksum(Path(paths['processed']))
        sets = {key: set(frame.text.str.strip()) for key, frame in frames.items()}
        overlaps = {f'{a}_{b}': len(sets[a] & sets[b]) for a, b in [('train', 'validation'), ('train', 'test'), ('validation', 'test')]}
        manifest = {'dataset_id': str(identity), 'required_columns': ['label', 'text'], 'split_strategy': 'preserved', 'samples': {'total': len(combined), **counts}, 'label_distribution': distribution, 'files': paths, 'checksum_sha256': checksum, 'overlapping_text_counts': overlaps}
        manifest_path = processed / 'manifest.json'
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        result = DatasetProcessingResult(identity, len(combined), counts['train'], counts['validation'], counts['test'], {'labels': list(distribution), 'distribution': distribution}, str(manifest_path), checksum)
        service = DatasetService(session)
        record = service._build_dataset_version(**metadata, result=result, preprocessing_config={'workflow': 'predefined_split_import', 'split_strategy': 'preserved', 'rows_removed': 0, 'source_columns': {'text': text_column, 'label': label_column}, 'label_mapping': mapping, 'overlapping_text_counts': overlaps, 'original_files': {k: str(raw / f'{k}.csv') for k in files}})
        return await service.repository.add(record)
    except Exception:
        await session.rollback()
        shutil.rmtree(raw, ignore_errors=True)
        shutil.rmtree(processed, ignore_errors=True)
        raise
