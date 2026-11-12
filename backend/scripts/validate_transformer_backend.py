from __future__ import annotations

import ast
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi.routing import APIRoute
from pydantic import ValidationError

from app.api.v1.experiments import router
from app.domain.services.transformer_experiment_preparation import (
    TransformerExperimentPreparationService,
)
from app.domain.services.transformer_model_registration import (
    TransformerModelRegistrationService,
)
from app.domain.services.transformer_training_execution import (
    TransformerTrainingExecutionService,
)
from app.main import app
from app.schemas.training import (
    PreparedTransformerExperimentRead,
    TransformerModelRegistrationRead,
    TransformerTrainingExecutionRead,
    TransformerTrainingReadinessRead,
    TransformerTrainingRequest,
)

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
FRONTEND_ROOT = ROOT / "frontend"
OPENAPI_PATH = ROOT / "docs" / "api" / "openapi.json"

EXPECTED_ROUTE_MODELS = {
    "/experiments/transformer-training-readiness": (
        "POST",
        "TransformerTrainingReadinessRead",
    ),
    "/experiments/prepare-transformer": (
        "POST",
        "PreparedTransformerExperimentRead",
    ),
    "/experiments/{experiment_id}/execute-transformer": (
        "POST",
        "TransformerTrainingExecutionRead",
    ),
    "/experiments/{experiment_id}/register-transformer-model": (
        "POST",
        "TransformerModelRegistrationRead",
    ),
}

EXPECTED_OPENAPI_PATHS = {
    "/api/v1/experiments/transformer-training-readiness",
    "/api/v1/experiments/prepare-transformer",
    "/api/v1/experiments/{experiment_id}/execute-transformer",
    "/api/v1/experiments/{experiment_id}/register-transformer-model",
}

EXPECTED_OPENAPI_SCHEMAS = {
    "TransformerTrainingRequest",
    "TransformerTrainingReadinessRead",
    "PreparedTransformerExperimentRead",
    "TransformerTrainingExecutionRead",
    "TransformerModelRegistrationRead",
}


def check(
    condition: bool,
    message: str,
) -> None:
    if not condition:
        raise AssertionError(message)

    print(f"✓ {message}")


def validate_schema_imports() -> None:
    required = [
        TransformerTrainingRequest,
        TransformerTrainingReadinessRead,
        PreparedTransformerExperimentRead,
        TransformerTrainingExecutionRead,
        TransformerModelRegistrationRead,
    ]

    check(
        all(item is not None for item in required),
        "Transformer request and response schemas import.",
    )


def validate_default_request() -> None:
    request = TransformerTrainingRequest(
        dataset_version_id="11111111-1111-4111-8111-111111111111",
        experiment_name="Transformer smoke experiment",
        experiment_description="Synthetic integration validation.",
        model_name="BanglaGuard BanglaBERT Smoke Model",
        model_version="0.0.1-smoke",
    )

    check(
        request.model_family == "banglabert_sequence_classification",
        "Default Transformer model family is correct.",
    )

    check(
        request.model.pretrained_model_name_or_path == "csebuetnlp/banglabert",
        "Default BanglaBERT checkpoint is correct.",
    )


def validate_service_contracts() -> None:
    service_methods: dict[type[Any], set[str]] = {
        TransformerExperimentPreparationService: {
            "prepare",
        },
        TransformerTrainingExecutionService: {
            "assemble",
            "execute",
            "run_training",
            "evaluate_and_generate_predictions",
            "persist_execution_artifacts",
        },
        TransformerModelRegistrationService: {
            "register",
        },
    }

    for service, methods in service_methods.items():
        missing = sorted(method for method in methods if not hasattr(service, method))

        check(
            not missing,
            (f"{service.__name__} exposes its required integration methods."),
        )


def validate_router_contracts() -> None:
    routes = {
        route.path: route for route in router.routes if isinstance(route, APIRoute)
    }

    for path, (
        expected_method,
        expected_response_name,
    ) in EXPECTED_ROUTE_MODELS.items():
        check(
            path in routes,
            f"Route exists: {path}",
        )

        route = routes[path]

        check(
            expected_method in route.methods,
            f"{path} uses {expected_method}.",
        )

        response_type = route.response_model

        check(
            response_type is not None,
            f"{path} declares a response model.",
        )

        response_name = getattr(
            response_type,
            "__name__",
            str(response_type),
        )

        check(
            response_name == expected_response_name,
            (f"{path} uses response model {expected_response_name}."),
        )


def validate_route_order() -> None:
    paths = [route.path for route in router.routes if isinstance(route, APIRoute)]

    details_path = "/experiments/{experiment_id}"

    check(
        details_path in paths,
        "Dynamic experiment-details route exists.",
    )

    details_index = paths.index(details_path)

    for static_path in (
        "/experiments/transformer-training-readiness",
        "/experiments/prepare-transformer",
    ):
        check(
            paths.index(static_path) < details_index,
            (f"Static route {static_path} appears before the dynamic details route."),
        )


def validate_openapi() -> dict[str, Any]:
    schema = app.openapi()

    actual_paths = set(
        schema.get(
            "paths",
            {},
        )
    )

    missing_paths = sorted(EXPECTED_OPENAPI_PATHS - actual_paths)

    check(
        not missing_paths,
        "OpenAPI contains all Transformer endpoints.",
    )

    components = schema.get(
        "components",
        {},
    )

    actual_schemas = set(
        components.get(
            "schemas",
            {},
        )
    )

    missing_schemas = sorted(EXPECTED_OPENAPI_SCHEMAS - actual_schemas)

    check(
        not missing_schemas,
        "OpenAPI contains all Transformer schemas.",
    )

    return schema


def write_openapi(
    schema: dict[str, Any],
) -> None:
    OPENAPI_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    OPENAPI_PATH.write_text(
        json.dumps(
            schema,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )

    check(
        OPENAPI_PATH.is_file(),
        "OpenAPI document was regenerated.",
    )


def validate_security_contracts(
    schema: dict[str, Any],
) -> None:
    for path in EXPECTED_OPENAPI_PATHS:
        operation = schema["paths"][path]["post"]

        security = operation.get(
            "security",
            [],
        )

        check(
            bool(security),
            f"{path} requires authentication.",
        )


def validate_frontend_paths() -> None:
    library_path = FRONTEND_ROOT / "lib" / "experiment-management.ts"

    check(
        library_path.is_file(),
        "Frontend experiment API library exists.",
    )

    frontend_text = library_path.read_text(
        encoding="utf-8",
    )

    expected_fragments = {
        "/experiments/transformer-training-readiness",
        "/experiments/prepare-transformer",
        "/execute-transformer",
        "/register-transformer-model",
    }

    for fragment in expected_fragments:
        check(
            fragment in frontend_text,
            (f"Frontend API library references {fragment}."),
        )


def validate_execution_response() -> None:
    now = datetime.now(
        timezone.utc,
    )

    payload = {
        "experiment_id": ("11111111-1111-4111-8111-111111111111"),
        "status": "completed",
        "dataset_version_id": ("22222222-2222-4222-8222-222222222222"),
        "model_version_id": None,
        "model_name": "Synthetic BanglaBERT",
        "model_version": "0.0.1-smoke",
        "model_family": ("banglabert_sequence_classification"),
        "task": "hate_speech",
        "pretrained_model_name_or_path": ("csebuetnlp/banglabert"),
        "tokenizer_path": ("/tmp/banglaguard-smoke/final-model"),
        "requested_device": "auto",
        "resolved_device": "cpu",
        "started_at": now,
        "completed_at": now,
        "duration_seconds": 1.25,
        "artifact_path": ("/tmp/banglaguard-smoke/final-model"),
        "best_checkpoint_path": None,
        "training_log_path": ("/tmp/banglaguard-smoke/training.log"),
        "trainer_state_path": ("/tmp/banglaguard-smoke/trainer_state.json"),
        "execution_result_path": ("/tmp/banglaguard-smoke/execution_result.json"),
        "training_metrics": {
            "train_loss": 0.2,
        },
        "validation_metrics": {
            "accuracy": 0.9,
            "macro_f1": 0.89,
        },
        "test_metrics": {
            "accuracy": 0.88,
            "macro_f1": 0.87,
        },
        "checkpoint_paths": [],
        "model_version_registered": False,
    }

    try:
        response = TransformerTrainingExecutionRead(**payload)
    except ValidationError as exc:
        raise AssertionError(
            "Synthetic execution response failed schema validation."
        ) from exc

    check(
        response.status == "completed",
        "Synthetic execution response validates.",
    )


def validate_registration_response() -> None:
    now = datetime.now(
        timezone.utc,
    )

    payload = {
        "experiment_id": ("11111111-1111-4111-8111-111111111111"),
        "model_version_id": ("33333333-3333-4333-8333-333333333333"),
        "name": "Synthetic BanglaBERT",
        "version": "0.0.1-smoke",
        "task": "hate_speech",
        "architecture": ("banglabert_sequence_classification"),
        "status": "draft",
        "artifact_path": ("/tmp/banglaguard-smoke/final-model"),
        "tokenizer_path": ("/tmp/banglaguard-smoke/final-model"),
        "preprocessing_version": ("banglaguard-text-v1"),
        "metrics": {
            "accuracy": 0.88,
            "macro_f1": 0.87,
        },
        "configuration": {
            "model_family": ("banglabert_sequence_classification"),
        },
        "is_explainable": False,
        "experiment_linked": True,
        "created_at": now,
    }

    try:
        response = TransformerModelRegistrationRead(**payload)
    except ValidationError as exc:
        raise AssertionError(
            "Synthetic registration response failed schema validation."
        ) from exc

    check(
        response.experiment_linked is True,
        "Synthetic registration response validates.",
    )


def find_method_calls(
    path: Path,
    attribute_name: str,
) -> list[int]:
    tree = ast.parse(
        path.read_text(
            encoding="utf-8",
        ),
        filename=str(path),
    )

    lines: list[int] = []

    for node in ast.walk(tree):
        if not isinstance(
            node,
            ast.Call,
        ):
            continue

        function = node.func

        if (
            isinstance(
                function,
                ast.Attribute,
            )
            and function.attr == attribute_name
        ):
            lines.append(node.lineno)

    return lines


def validate_training_call_structure() -> None:
    service_path = (
        BACKEND_ROOT
        / "app"
        / "domain"
        / "services"
        / "transformer_training_execution.py"
    )

    train_calls = find_method_calls(
        service_path,
        "train",
    )

    predict_calls = find_method_calls(
        service_path,
        "predict",
    )

    save_model_calls = find_method_calls(
        service_path,
        "save_model",
    )

    check(
        len(train_calls) == 1,
        "Execution service has one Trainer.train() call.",
    )

    check(
        len(predict_calls) == 1,
        "Execution service has one reusable Trainer.predict() call.",
    )

    check(
        len(save_model_calls) == 1,
        "Execution service has one final Trainer.save_model() call.",
    )


def main() -> int:
    print("===== BANGLAGUARD TRANSFORMER BACKEND SMOKE TEST =====")

    validate_schema_imports()
    validate_default_request()
    validate_service_contracts()
    validate_router_contracts()
    validate_route_order()

    schema = validate_openapi()

    validate_security_contracts(schema)

    write_openapi(schema)

    validate_frontend_paths()
    validate_execution_response()
    validate_registration_response()
    validate_training_call_structure()

    print()
    print("✓ Phase 22.4.4.1G backend integration checks passed.")
    print("✓ No model was downloaded.")
    print("✓ No database record was created.")
    print("✓ No training process was started.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        AssertionError,
        ValidationError,
    ) as exc:
        print(
            f"✗ Integration check failed: {exc}",
            file=sys.stderr,
        )

        raise SystemExit(1) from exc
