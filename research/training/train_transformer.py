from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
from datasets import DatasetDict, load_dataset
from normalizer import normalize
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EvalPrediction,
    Trainer,
    TrainingArguments,
)


DEFAULT_MODEL_NAME = "csebuetnlp/banglabert"
DEFAULT_RANDOM_SEED = 42


def set_random_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def save_json(
    path: Path,
    content: dict[str, Any],
) -> None:
    path.write_text(
        json.dumps(
            content,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fine-tune BanglaBERT for text classification."
    )

    parser.add_argument(
        "--dataset-dir",
        type=Path,
        required=True,
        help=(
            "Directory containing train.csv, "
            "validation.csv and test.csv."
        ),
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directory in which to save the fine-tuned model.",
    )

    parser.add_argument(
        "--model-name",
        type=str,
        default=DEFAULT_MODEL_NAME,
    )

    parser.add_argument(
        "--task",
        choices=["hate_speech", "sentiment"],
        default="hate_speech",
    )

    parser.add_argument(
        "--epochs",
        type=float,
        default=3.0,
    )

    parser.add_argument(
        "--train-batch-size",
        type=int,
        default=4,
    )

    parser.add_argument(
        "--eval-batch-size",
        type=int,
        default=8,
    )

    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-5,
    )

    parser.add_argument(
        "--max-length",
        type=int,
        default=128,
    )

    parser.add_argument(
        "--random-seed",
        type=int,
        default=DEFAULT_RANDOM_SEED,
    )

    return parser.parse_args()


def load_local_dataset(
    dataset_directory: Path,
) -> DatasetDict:
    data_files = {
        "train": str(dataset_directory / "train.csv"),
        "validation": str(
            dataset_directory / "validation.csv"
        ),
        "test": str(dataset_directory / "test.csv"),
    }

    for split_name, file_path in data_files.items():
        if not Path(file_path).exists():
            raise FileNotFoundError(
                f"Missing {split_name} file: {file_path}"
            )

    dataset = load_dataset(
        "csv",
        data_files=data_files,
    )

    required_columns = {"text", "label"}

    for split_name, split in dataset.items():
        missing_columns = (
            required_columns - set(split.column_names)
        )

        if missing_columns:
            raise ValueError(
                f"{split_name} is missing columns: "
                f"{sorted(missing_columns)}"
            )

    return dataset


def build_label_mappings(
    dataset: DatasetDict,
) -> tuple[
    list[str],
    dict[str, int],
    dict[int, str],
]:
    labels: set[str] = set()

    for split in dataset.values():
        labels.update(
            str(label)
            for label in split["label"]
        )

    label_names = sorted(labels)

    label2id = {
        label: index
        for index, label in enumerate(label_names)
    }

    id2label = {
        index: label
        for label, index in label2id.items()
    }

    return label_names, label2id, id2label


def create_compute_metrics(
    label_names: list[str],
):
    label_ids = list(range(len(label_names)))

    def compute_metrics(
        evaluation_prediction: EvalPrediction,
    ) -> dict[str, float]:
        logits = evaluation_prediction.predictions
        references = evaluation_prediction.label_ids

        predictions = np.argmax(
            logits,
            axis=-1,
        )

        return {
            "accuracy": float(
                accuracy_score(
                    references,
                    predictions,
                )
            ),
            "macro_precision": float(
                precision_score(
                    references,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_recall": float(
                recall_score(
                    references,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "macro_f1": float(
                f1_score(
                    references,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),
            "weighted_f1": float(
                f1_score(
                    references,
                    predictions,
                    average="weighted",
                    zero_division=0,
                )
            ),
        }

    return compute_metrics


def main() -> None:
    arguments = parse_arguments()

    set_random_seed(arguments.random_seed)

    dataset_directory = (
        arguments.dataset_dir.expanduser().resolve()
    )

    output_directory = (
        arguments.output_dir.expanduser().resolve()
    )

    checkpoints_directory = (
        output_directory / "checkpoints"
    )

    final_model_directory = (
        output_directory / "model"
    )

    output_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    dataset = load_local_dataset(
        dataset_directory
    )

    (
        label_names,
        label2id,
        id2label,
    ) = build_label_mappings(dataset)

    tokenizer = AutoTokenizer.from_pretrained(
        arguments.model_name,
        use_fast=True,
    )

    def preprocess_batch(
        examples: dict[str, list[Any]],
    ) -> dict[str, Any]:
        normalized_texts = [
            normalize(str(text))
            for text in examples["text"]
        ]

        encoded = tokenizer(
            normalized_texts,
            truncation=True,
            max_length=arguments.max_length,
        )

        encoded["labels"] = [
            label2id[str(label)]
            for label in examples["label"]
        ]

        return encoded

    tokenized_dataset = dataset.map(
        preprocess_batch,
        batched=True,
        remove_columns=dataset["train"].column_names,
    )

    model = (
        AutoModelForSequenceClassification
        .from_pretrained(
            arguments.model_name,
            num_labels=len(label_names),
            label2id=label2id,
            id2label=id2label,
        )
    )

    data_collator = DataCollatorWithPadding(
        tokenizer=tokenizer,
    )

    training_arguments = TrainingArguments(
        output_dir=str(checkpoints_directory),
        learning_rate=arguments.learning_rate,
        per_device_train_batch_size=(
            arguments.train_batch_size
        ),
        per_device_eval_batch_size=(
            arguments.eval_batch_size
        ),
        num_train_epochs=arguments.epochs,
        weight_decay=0.01,
        warmup_ratio=0.1,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_strategy="steps",
        logging_steps=1,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        save_total_limit=2,
        report_to="none",
        seed=arguments.random_seed,
        data_seed=arguments.random_seed,
        push_to_hub=False,
        fp16=False,
    )

    trainer = Trainer(
        model=model,
        args=training_arguments,
        train_dataset=tokenized_dataset["train"],
        eval_dataset=tokenized_dataset[
            "validation"
        ],
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=create_compute_metrics(
            label_names
        ),
    )

    train_result = trainer.train()

    validation_metrics = trainer.evaluate(
        tokenized_dataset["validation"],
        metric_key_prefix="validation",
    )

    test_prediction = trainer.predict(
        tokenized_dataset["test"],
        metric_key_prefix="test",
    )

    test_predictions = np.argmax(
        test_prediction.predictions,
        axis=-1,
    )

    test_references = (
        test_prediction.label_ids
    )

    test_report = classification_report(
        test_references,
        test_predictions,
        labels=list(range(len(label_names))),
        target_names=label_names,
        output_dict=True,
        zero_division=0,
    )

    test_matrix = confusion_matrix(
        test_references,
        test_predictions,
        labels=list(range(len(label_names))),
    )

    trainer.save_model(
        str(final_model_directory)
    )

    tokenizer.save_pretrained(
        str(final_model_directory)
    )

    label_configuration = {
        "labels": label_names,
        "label2id": label2id,
        "id2label": {
            str(key): value
            for key, value in id2label.items()
        },
    }

    save_json(
        output_directory / "labels.json",
        label_configuration,
    )

    experiment_results = {
        "task": arguments.task,
        "base_model": arguments.model_name,
        "dataset_directory": str(
            dataset_directory
        ),
        "artifact_path": str(
            final_model_directory
        ),
        "random_seed": arguments.random_seed,
        "max_length": arguments.max_length,
        "epochs": arguments.epochs,
        "learning_rate": (
            arguments.learning_rate
        ),
        "train_batch_size": (
            arguments.train_batch_size
        ),
        "eval_batch_size": (
            arguments.eval_batch_size
        ),
        "sample_counts": {
            split_name: len(split)
            for split_name, split in dataset.items()
        },
        "labels": label_configuration,
        "train_metrics": train_result.metrics,
        "validation_metrics": (
            validation_metrics
        ),
        "test_metrics": (
            test_prediction.metrics
        ),
        "test_classification_report": (
            test_report
        ),
        "test_confusion_matrix": (
            test_matrix.tolist()
        ),
        "test_confusion_matrix_labels": (
            label_names
        ),
    }

    save_json(
        output_directory
        / "experiment_results.json",
        experiment_results,
    )

    print("\nTransformer training completed.")
    print(
        "Saved model:",
        final_model_directory,
    )
    print(
        "Validation macro F1:",
        validation_metrics.get(
            "validation_macro_f1"
        ),
    )
    print(
        "Test macro F1:",
        test_prediction.metrics.get(
            "test_macro_f1"
        ),
    )


if __name__ == "__main__":
    main()