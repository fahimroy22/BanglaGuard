from app.ml.classical_model import softmax

import numpy as np


def test_softmax_sums_to_one() -> None:
    values = np.array(
        [1.0, 2.0, 3.0]
    )

    probabilities = softmax(values)

    assert round(
        float(probabilities.sum()),
        6,
    ) == 1.0


def test_softmax_preserves_highest_score() -> None:
    values = np.array(
        [0.2, 2.5, 1.0]
    )

    probabilities = softmax(values)

    assert int(
        probabilities.argmax()
    ) == 1