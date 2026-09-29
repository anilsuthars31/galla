"""Tests for features.py. Run from ml/:  python -m unittest -v test_features"""

import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from features import (
    DENSE_NAMES,
    RAILS,
    FeatureBuilder,
    char_wb_ngrams,
    clean_narration,
    dense_features,
    detect_rail,
    features_reference,
    make_vectorizer,
)

DATA = Path(__file__).resolve().parent.parent / "data" / "synthetic"


def load_rows() -> pd.DataFrame:
    df = pd.concat([pd.read_csv(p) for p in sorted(DATA.glob("0*_*.csv"))], ignore_index=True)
    df["dir"] = np.where(df["deposit"].notna(), "C", "D")
    df["amount"] = df["deposit"].fillna(df["withdrawal"])
    df["day"] = df["date"].str[8:10].astype(int)
    return df


class CleanNarration(unittest.TestCase):
    def test_examples(self):
        cases = {
            "UPI/CR/363020409019/UPI": "upi cr # upi",
            "POS SETT/567599/HDFC": "pos sett # hdfc",
            "UPI/abc12@okhdfcbank": "upi abc#@okhdfcbank",
            "CHRG:SMS/AMB/TXN": "chrg sms amb txn",
            "  NEFT--METRO   WH  ": "neft metro wh",
            "₹500 Rs.12,345.00 Dr": "# rs # # # dr",
            "": "",
        }
        for raw, want in cases.items():
            self.assertEqual(clean_narration(raw), want, raw)

    def test_non_ascii_letters_become_spaces(self):
        # Only A-Z is case-mapped; anything else outside [a-z#@] is dropped.
        self.assertEqual(clean_narration("CAFÉ İSTANBUL"), "caf stanbul")


class CharWbNgrams(unittest.TestCase):
    def test_short_words(self):
        # " a " (len 3) yields itself once; " ab " (len 4) yields its 3-grams and itself as a 4-gram.
        self.assertEqual(char_wb_ngrams("a"), [" a "])
        self.assertEqual(char_wb_ngrams("ab"), [" ab", "ab ", " ab "])
        self.assertEqual(char_wb_ngrams(""), [])

    def test_matches_sklearn_on_all_narrations(self):
        analyzer = make_vectorizer().build_analyzer()
        extra = ["a", "ab", "abc", "abcd", "x y z", "#", "@", "a@b#c"]
        for text in [clean_narration(n) for n in load_rows()["narration"]] + extra:
            self.assertEqual(char_wb_ngrams(text), analyzer(text), text)


class Rails(unittest.TestCase):
    def test_examples(self):
        # Mirrors detectRail() in src/engine/narration.ts, including its order of checks.
        cases = {
            "UPI/CR/1234/UPI": "UPI",
            "UPIREFUND/857156": "Other",  # no boundary around UPI
            "NEFT/METRO WH": "NEFT",
            "IMPS/SHREE WHOLE": "IMPS",
            "RTGS/ABC": "RTGS",
            "NACH DR BAJAJ": "NACH",
            "ACH/LOAN": "NACH",
            "ATM CASH WDL": "ATM",
            "CHRG:SMS/AMB/TXN": "Charge",
            "INT.PD 01-06": "Interest",
            "CASH DEP BRANCH": "Cash",
            "CHQ DEP 000123": "Cheque",
            "BILLDESK/BESCOM": "Bill pay",
            "POS SETT/567599/HDFC": "Card",
            "UPI MERCH SETT/1": "UPI",
            "SALARY/MANOJ": "Other",
        }
        for narration, want in cases.items():
            self.assertEqual(detect_rail(narration), want, narration)


class DenseFeatures(unittest.TestCase):
    def test_layout(self):
        v = dense_features("C", 999.0, 31, "Card")
        self.assertEqual(len(v), len(DENSE_NAMES))
        self.assertEqual(v[0], 1.0)
        self.assertAlmostEqual(v[1], np.log(1000.0) / 10, places=12)
        self.assertEqual(v[2], 1.0)
        self.assertEqual(v[3:], [1.0 if r == "Card" else 0.0 for r in RAILS])
        self.assertEqual(dense_features("D", 0.0, 1, "Other")[:3], [0.0, 0.0, 0.0])

    def test_unknown_rail(self):
        with self.assertRaises(ValueError):
            dense_features("C", 1.0, 1, "Bitcoin")


class FullVector(unittest.TestCase):
    """The plain-Python reference (what classifier.ts does) must equal the sklearn pipeline."""

    @classmethod
    def setUpClass(cls):
        cls.rows = load_rows()
        cls.fb = FeatureBuilder().fit(cls.rows["narration"])

    def test_reference_matches_sklearn(self):
        sample = self.rows.sample(400, random_state=0)
        X = self.fb.transform(
            sample["narration"].tolist(), sample["dir"].tolist(), sample["amount"].tolist(), sample["day"].tolist()
        ).toarray()
        self.assertEqual(X.shape[1], self.fb.n_features)
        for i, (_, r) in enumerate(sample.iterrows()):
            ref = features_reference(r["narration"], r["dir"], r["amount"], r["day"], self.fb.vocabulary, self.fb.idf)
            np.testing.assert_allclose(ref, X[i], rtol=0, atol=1e-12, err_msg=r["narration"])

    def test_unseen_narration(self):
        # Nothing in the vocabulary: text part is all zero, dense part is still filled in.
        ref = features_reference("QQQQ", "D", 100.0, 5, self.fb.vocabulary, self.fb.idf)
        n = len(self.fb.vocabulary)
        self.assertEqual(float(np.abs(ref[:n]).sum()), 0.0)
        self.assertEqual(ref[n + 3 + RAILS.index("Other")], 1.0)

    def test_text_part_is_unit_length(self):
        n = len(self.fb.vocabulary)
        ref = features_reference("UPI/CR/1/UPI", "C", 10.0, 1, self.fb.vocabulary, self.fb.idf)
        self.assertAlmostEqual(float(np.linalg.norm(ref[:n])), 1.0, places=12)


if __name__ == "__main__":
    unittest.main()
