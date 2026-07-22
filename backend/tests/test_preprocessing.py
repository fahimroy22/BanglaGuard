from app.ml.preprocessing import (
    detect_language_form,
    preprocess_text,
)


def test_detect_bangla() -> None:
    assert (
        detect_language_form(
            "আমি ভালো আছি"
        )
        == "bangla"
    )


def test_detect_code_mixed() -> None:
    assert (
        detect_language_form(
            "আজকে project খুব ভালো"
        )
        == "code_mixed"
    )


def test_detect_latin_text() -> None:
    assert (
        detect_language_form(
            "ami valo achi"
        )
        == "banglish_or_english"
    )


def test_preprocessing_replaces_private_data() -> None:
    result = preprocess_text(
        "Email test@example.com এবং "
        "https://example.com দেখুন"
    )

    assert "<EMAIL>" in result.normalized_text
    assert "<URL>" in result.normalized_text


def test_preprocessing_removes_extra_spaces() -> None:
    result = preprocess_text(
        "আমি     ভালো   আছি"
    )

    assert result.normalized_text == "আমি ভালো আছি"