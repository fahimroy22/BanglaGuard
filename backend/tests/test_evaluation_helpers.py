import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


from research.evaluation.check_leakage import (
    normalize_for_comparison,
)


def test_leakage_normalization() -> None:
    result = normalize_for_comparison(
        "  তুমি খুব ভালো!!!  "
    )

    assert result == "তুমি খুব ভালো"


def test_leakage_normalization_casefold() -> None:
    result = normalize_for_comparison(
        "Hello WORLD"
    )

    assert result == "hello world"