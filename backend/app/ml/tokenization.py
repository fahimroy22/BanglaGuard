"""Unicode word tokens that retain Bengali vowel signs and conjunct marks."""
import unicodedata


def unicode_word_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    word: list[str] = []
    for character in text:
        category = unicodedata.category(character)
        if category[0] in {'L', 'N'} or character == '_':
            word.append(character)
        elif word and (category[0] == 'M' or character in {'\u200c', '\u200d'}):
            word.append(character)
        else:
            if word:
                tokens.append(''.join(word))
                word = []
    if word:
        tokens.append(''.join(word))
    return tokens
