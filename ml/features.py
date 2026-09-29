"""Narration cleaning and feature extraction for the V3 classifier.

THIS DOCSTRING IS THE SHARED SPEC. src/engine/classifier.ts re-implements everything below for
inference in the browser. Change both together, and keep the parity test passing.

Input (mirrors ClassifierInput in src/engine/types.ts)
------------------------------------------------------
    narration : str      raw narration from the statement
    dir       : "C"|"D"  C = deposit (money in), D = withdrawal (money out)
    amount    : float    positive amount
    day       : int      day of month, 1-31
    rail      : str      detect_rail(narration), same as detectRail() in src/engine/narration.ts

1. Cleaning (clean_narration)
-----------------------------
    a. ASCII letters A-Z -> a-z. Nothing else is case-mapped (JS and Python disagree on some
       non-ASCII case rules, so we don't touch them).
    b. Every run of digits 0-9 -> a single "#". Reference numbers carry no meaning; masking them
       stops each row from producing its own n-grams.
    c. Every character that is not a-z, "#" or "@" -> a space. "@" is kept so a VPA handle stays one
       word ("shop@upi", "abc#@okhdfcbank").
    d. Runs of spaces -> one space; strip both ends.
    Example: "UPI/CR/363020409019/UPI" -> "upi cr # upi"

2. Text features: TF-IDF over character 3-5 grams inside word boundaries (sklearn char_wb)
------------------------------------------------------------------------------------------
    For each word w of the cleaned text (split on " "), pad it as " " + w + " ", then for
    n = 3, 4, 5 take every substring of length n, left to right. If the padded word is shorter
    than or equal to n, it yields the whole padded word once and larger n are skipped for that
    word. (This is sklearn's _char_wb_ngrams, including that quirk.)
    tf[g]  = raw count of n-gram g in the row (only n-grams in the vocabulary count)
    idf[g] = ln((1 + N) / (1 + df[g])) + 1          (smooth_idf=True; stored in model.json)
    x_text = tf * idf, then divided by its L2 norm (left all-zero if the norm is 0)
    Vocabulary: n-grams in at least MIN_DF training rows. Column order = model.json "vocabulary"
    index.

3. Extra (dense) features, appended after the text columns in this order
------------------------------------------------------------------------
    is_credit   1.0 if dir == "C" else 0.0
    log_amount  ln(1 + amount) / 10        (≈0.3-1.4 for ₹10 to ₹10 lakh; keeps it on the TF-IDF scale)
    day         (day - 1) / 30             (0 on the 1st, 1 on the 31st)
    rail_<R>    one-hot, one column per rail in RAILS order (exactly one is 1.0)

    Full vector: [x_text (len(vocabulary)) | is_credit | log_amount | day | rail_* (13)]
"""

from __future__ import annotations

import math
import re
from typing import Iterable, Sequence

import numpy as np
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer

NGRAM_RANGE = (3, 5)
MIN_DF = 2

# Same order as the Rail type in src/engine/types.ts.
RAILS: tuple[str, ...] = (
    "UPI", "NEFT", "IMPS", "RTGS", "NACH", "ATM", "Charge", "Interest", "Cash", "Cheque", "Bill pay", "Card", "Other",
)
DENSE_NAMES: tuple[str, ...] = ("is_credit", "log_amount", "day") + tuple(f"rail_{r}" for r in RAILS)

_UPPER = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")
_DIGITS = re.compile(r"[0-9]+")
_OTHER = re.compile(r"[^a-z#@]+")


def clean_narration(narration: str) -> str:
    """Steps 1a-1d of the spec."""
    s = str(narration).translate(_UPPER)
    s = _DIGITS.sub("#", s)
    s = _OTHER.sub(" ", s)
    return s.strip()


# --- Rail detection: a line-by-line port of detectRail() in src/engine/narration.ts.
# re.ASCII makes \b behave like JavaScript's (ASCII word characters only).
_A = re.ASCII
_RAIL_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(^|[^A-Z])UPI([^A-Z]|$)", _A), "UPI"),
    (re.compile(r"NEFT", _A), "NEFT"),
    (re.compile(r"IMPS", _A), "IMPS"),
    (re.compile(r"RTGS", _A), "RTGS"),
    (re.compile(r"NACH|\bACH\b|\bECS\b", _A), "NACH"),
    (re.compile(r"\bATM\b|\bATW\b|\bNWD\b|CASH WDL", _A), "ATM"),
    (re.compile(r"CHRG|\bCHG\b|CHARGES|\bAMC\b", _A), "Charge"),
    (re.compile(r"INT\.?\s?PD|INTEREST|\bINT CR", _A), "Interest"),
    (re.compile(r"CASH DEP|BY CASH|\bCDM\b", _A), "Cash"),
    (re.compile(r"\bCHQ\b|CHEQUE|\bCLG\b|CLEARING", _A), "Cheque"),
    (re.compile(r"BILLDESK|\bBBPS\b|BILLPAY", _A), "Bill pay"),
    (re.compile(r"\bPOS\b", _A), "Card"),
)


def detect_rail(narration: str) -> str:
    u = str(narration).upper()
    for pattern, rail in _RAIL_RULES:
        if pattern.search(u):
            return rail
    return "Other"


def char_wb_ngrams(cleaned: str, ngram_range: tuple[int, int] = NGRAM_RANGE) -> list[str]:
    """Spec step 2, written out by hand. Must equal sklearn's analyzer (tested in test_features.py);
    classifier.ts copies this function, not sklearn."""
    lo, hi = ngram_range
    out: list[str] = []
    for word in cleaned.split(" "):
        if not word:
            continue
        w = " " + word + " "
        for n in range(lo, hi + 1):
            if len(w) <= n:
                out.append(w)
                break
            for i in range(len(w) - n + 1):
                out.append(w[i : i + n])
    return out


def dense_features(direction: str, amount: float, day: int, rail: str) -> list[float]:
    """Spec step 3."""
    if rail not in RAILS:
        raise ValueError(f"unknown rail {rail!r}")
    return [
        1.0 if direction == "C" else 0.0,
        math.log1p(float(amount)) / 10.0,
        (int(day) - 1) / 30.0,
        *(1.0 if r == rail else 0.0 for r in RAILS),
    ]


def make_vectorizer() -> TfidfVectorizer:
    """The training-time TF-IDF. Input must already be cleaned (lowercase=False, no preprocessor)."""
    return TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=NGRAM_RANGE,
        lowercase=False,
        min_df=MIN_DF,
        norm="l2",
        use_idf=True,
        smooth_idf=True,
        sublinear_tf=False,
        dtype=np.float64,
    )


class FeatureBuilder:
    """Fits the TF-IDF on training rows and builds the full feature matrix (text | dense)."""

    def __init__(self) -> None:
        self.vectorizer = make_vectorizer()

    def fit(self, narrations: Iterable[str]) -> "FeatureBuilder":
        self.vectorizer.fit([clean_narration(n) for n in narrations])
        return self

    def transform(
        self,
        narrations: Sequence[str],
        directions: Sequence[str],
        amounts: Sequence[float],
        days: Sequence[int],
        rails: Sequence[str] | None = None,
    ) -> sp.csr_matrix:
        text = self.vectorizer.transform([clean_narration(n) for n in narrations])
        if rails is None:
            rails = [detect_rail(n) for n in narrations]
        dense = np.array(
            [dense_features(d, a, dy, r) for d, a, dy, r in zip(directions, amounts, days, rails)],
            dtype=np.float64,
        ).reshape(len(narrations), len(DENSE_NAMES))
        return sp.hstack([text, sp.csr_matrix(dense)], format="csr")

    @property
    def vocabulary(self) -> list[str]:
        """N-grams in column order."""
        vocab = self.vectorizer.vocabulary_
        out = [""] * len(vocab)
        for gram, idx in vocab.items():
            out[idx] = gram
        return out

    @property
    def idf(self) -> list[float]:
        return self.vectorizer.idf_.tolist()

    @property
    def n_features(self) -> int:
        return len(self.vectorizer.vocabulary_) + len(DENSE_NAMES)


def features_reference(
    narration: str, direction: str, amount: float, day: int, vocabulary: Sequence[str], idf: Sequence[float]
) -> np.ndarray:
    """The whole spec in plain Python, using only what model.json stores (vocabulary + idf).
    This is what classifier.ts does; FeatureBuilder must produce the same vector."""
    index = {g: i for i, g in enumerate(vocabulary)}
    x = np.zeros(len(vocabulary) + len(DENSE_NAMES))
    for g in char_wb_ngrams(clean_narration(narration)):
        i = index.get(g)
        if i is not None:
            x[i] += 1.0
    x[: len(vocabulary)] *= np.asarray(idf)
    norm = math.sqrt(float(np.dot(x[: len(vocabulary)], x[: len(vocabulary)])))
    if norm > 0:
        x[: len(vocabulary)] /= norm
    x[len(vocabulary):] = dense_features(direction, amount, day, detect_rail(narration))
    return x
