from dataclasses import dataclass
from typing import Any

from app.domain.enums import AnalysisTask


HATEFUL_TERMS = {
    "ঘৃণা",
    "মার",
    "মেরে",
    "ধ্বংস",
    "জানোয়ার",
    "কুত্তা",
    "হারামি",
    "বেইমান",
    "gadha",
    "kutta",
    "harami",
}

OFFENSIVE_TERMS = {
    "বোকা",
    "গাধা",
    "মূর্খ",
    "অসভ্য",
    "idiot",
    "stupid",
    "fool",
}

POSITIVE_TERMS = {
    "ভালো",
    "সুন্দর",
    "চমৎকার",
    "দারুণ",
    "অসাধারণ",
    "খুশি",
    "পছন্দ",
    "good",
    "great",
    "excellent",
    "happy",
    "love",
}

NEGATIVE_TERMS = {
    "খারাপ",
    "দুঃখ",
    "ভয়ংকর",
    "বিরক্ত",
    "ঘৃণা",
    "অপছন্দ",
    "bad",
    "terrible",
    "sad",
    "hate",
    "angry",
}


@dataclass(frozen=True)
class BaselineResult:
    label: str
    confidence: float
    probabilities: dict[str, float]
    explanation: dict[str, Any]


def find_matches(
    text: str,
    terms: set[str],
) -> list[str]:
    lowered_text = text.casefold()

    return sorted(
        term
        for term in terms
        if term.casefold() in lowered_text
    )


def predict_hate_speech(
    text: str,
) -> BaselineResult:
    hateful_matches = find_matches(
        text,
        HATEFUL_TERMS,
    )

    offensive_matches = find_matches(
        text,
        OFFENSIVE_TERMS,
    )

    if hateful_matches:
        return BaselineResult(
            label="hateful",
            confidence=0.80,
            probabilities={
                "non_hateful": 0.05,
                "offensive": 0.15,
                "hateful": 0.80,
            },
            explanation={
                "method": "keyword_baseline",
                "matched_terms": hateful_matches,
                "warning": (
                    "This is a temporary rule-based "
                    "baseline, not the final research model."
                ),
            },
        )

    if offensive_matches:
        return BaselineResult(
            label="offensive",
            confidence=0.70,
            probabilities={
                "non_hateful": 0.20,
                "offensive": 0.70,
                "hateful": 0.10,
            },
            explanation={
                "method": "keyword_baseline",
                "matched_terms": offensive_matches,
                "warning": (
                    "This is a temporary rule-based "
                    "baseline, not the final research model."
                ),
            },
        )

    return BaselineResult(
        label="non_hateful",
        confidence=0.65,
        probabilities={
            "non_hateful": 0.65,
            "offensive": 0.20,
            "hateful": 0.15,
        },
        explanation={
            "method": "keyword_baseline",
            "matched_terms": [],
            "warning": (
                "No listed terms were detected. "
                "This does not prove that the text is safe."
            ),
        },
    )


def predict_sentiment(
    text: str,
) -> BaselineResult:
    positive_matches = find_matches(
        text,
        POSITIVE_TERMS,
    )

    negative_matches = find_matches(
        text,
        NEGATIVE_TERMS,
    )

    positive_score = len(positive_matches)
    negative_score = len(negative_matches)

    if positive_score > negative_score:
        return BaselineResult(
            label="positive",
            confidence=0.72,
            probabilities={
                "positive": 0.72,
                "negative": 0.10,
                "neutral": 0.18,
            },
            explanation={
                "method": "keyword_baseline",
                "matched_terms": positive_matches,
            },
        )

    if negative_score > positive_score:
        return BaselineResult(
            label="negative",
            confidence=0.72,
            probabilities={
                "positive": 0.10,
                "negative": 0.72,
                "neutral": 0.18,
            },
            explanation={
                "method": "keyword_baseline",
                "matched_terms": negative_matches,
            },
        )

    return BaselineResult(
        label="neutral",
        confidence=0.60,
        probabilities={
            "positive": 0.20,
            "negative": 0.20,
            "neutral": 0.60,
        },
        explanation={
            "method": "keyword_baseline",
            "matched_terms": (
                positive_matches + negative_matches
            ),
        },
    )


def run_baseline_prediction(
    text: str,
    task: AnalysisTask,
) -> BaselineResult:
    if task == AnalysisTask.HATE_SPEECH:
        return predict_hate_speech(text)

    if task == AnalysisTask.SENTIMENT:
        return predict_sentiment(text)

    raise ValueError(
        f"Unsupported analysis task: {task}"
    )