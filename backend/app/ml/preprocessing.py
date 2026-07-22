import html
import re
import unicodedata
from dataclasses import dataclass


URL_PATTERN = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
EMAIL_PATTERN = re.compile(
    r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b"
)
PHONE_PATTERN = re.compile(
    r"(?:\+?88)?01[3-9]\d{8}"
)
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
WHITESPACE_PATTERN = re.compile(r"\s+")

BANGLA_CHARACTER_PATTERN = re.compile(r"[\u0980-\u09FF]")
LATIN_CHARACTER_PATTERN = re.compile(r"[A-Za-z]")


@dataclass(frozen=True)
class PreprocessingResult:
    raw_text: str
    normalized_text: str
    language_form: str


def normalize_repeated_characters(text: str) -> str:
    """Reduce a character repeated more than three times."""

    return re.sub(r"(.)\1{3,}", r"\1\1", text)


def detect_language_form(text: str) -> str:
    bangla_count = len(
        BANGLA_CHARACTER_PATTERN.findall(text)
    )
    latin_count = len(
        LATIN_CHARACTER_PATTERN.findall(text)
    )

    if bangla_count > 0 and latin_count > 0:
        return "code_mixed"

    if bangla_count > 0:
        return "bangla"

    if latin_count > 0:
        return "banglish_or_english"

    return "unknown"


def preprocess_text(text: str) -> PreprocessingResult:
    raw_text = text

    normalized = unicodedata.normalize("NFKC", text)
    normalized = html.unescape(normalized)

    normalized = HTML_TAG_PATTERN.sub(" ", normalized)
    normalized = URL_PATTERN.sub(" <URL> ", normalized)
    normalized = EMAIL_PATTERN.sub(" <EMAIL> ", normalized)
    normalized = PHONE_PATTERN.sub(" <PHONE> ", normalized)

    normalized = normalize_repeated_characters(
        normalized
    )

    normalized = WHITESPACE_PATTERN.sub(
        " ",
        normalized,
    ).strip()

    language_form = detect_language_form(normalized)

    return PreprocessingResult(
        raw_text=raw_text,
        normalized_text=normalized,
        language_form=language_form,
    )