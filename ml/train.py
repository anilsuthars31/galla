"""Train the V3 classifier, validate it leave-one-file-out, and export public/model.json.

Usage (from ml/):  python train.py

Training data (CLAUDE.md "V3 classifier"):
  - data/synthetic/*.csv, except EXCLUDED_FILES
  - data/real/*.csv rows that the app's keyword rules label (canonical CSV columns; category ignored)
  - data/corrections/*.csv owner corrections exported from the ledger
  data/labels/ is NEVER used here. It is the test set (see evaluate.py).

Label policy applied at load time (the CSV files are not changed):
  - A withdrawal labelled with an income category (a sale reversal going back out, "UPI REVERSAL/...")
    is trained as "other". The app never assigns an income category to money out.

Writes:
  public/model.json                        weights + feature config for src/engine/classifier.ts
  tests/fixtures/classifier_parity.json    50 inputs with Python probabilities, for the TS parity test
"""

from __future__ import annotations

import json
import re
import subprocess
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.multiclass import OneVsRestClassifier

import features as F

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"
SYNTHETIC = ROOT / "data" / "synthetic"
REAL = ROOT / "data" / "real"
CORRECTIONS = ROOT / "data" / "corrections"
LABELS = ROOT / "data" / "labels"
MODEL_PATH = ROOT / "public" / "model.json"
PARITY_PATH = ROOT / "tests" / "fixtures" / "classifier_parity.json"
NARRATION_FIXTURES = ROOT / "tests" / "fixtures" / "narrations.ts"

EXCLUDED_FILES = {
    "CHANGELOG.csv": "edit log for the synthetic files, not a statement",
    "hdfc_kirana_bengaluru_v1.csv": "older generator: no hard_case column, 13 refunds/reversals on the wrong side "
    "or with the wrong category (see check_data.py)",
}
INCOME = ("sales", "other_income")
EXPENSE = ("suppliers", "salary", "rent", "utilities", "emi", "tax", "personal", "charges", "other")
CATEGORIES = INCOME + EXPENSE
FORMAT_VERSION = 1
C_REG = 1.0
PARITY_CASES = 50


# ---------------------------------------------------------------- loading

def read_statement(path: Path, source: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"narration": str, "category": str})
    df["narration"] = df["narration"].fillna("")
    df["source"] = source
    df["file"] = path.name
    if "hard_case" not in df.columns:
        df["hard_case"] = 0
    df["hard_case"] = df["hard_case"].fillna(0).astype(int)
    df["dir"] = np.where(pd.to_numeric(df["deposit"], errors="coerce").notna(), "C", "D")
    df["amount"] = pd.to_numeric(df["deposit"], errors="coerce").fillna(pd.to_numeric(df["withdrawal"], errors="coerce"))
    df["day"] = df["date"].astype(str).str[8:10].astype(int)
    return df


def apply_label_policy(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Withdrawals labelled with an income category become "other" (see module docstring)."""
    df = df.copy()
    mask = (df["dir"] == "D") & df["category"].isin(INCOME)
    df.loc[mask, "category"] = "other"
    bad = df[(df["dir"] == "C") & df["category"].isin(EXPENSE)]
    if len(bad):
        raise ValueError(f"{len(bad)} deposits labelled with an expense category, e.g. {bad.iloc[0].to_dict()}")
    unknown = set(df["category"]) - set(CATEGORIES)
    if unknown:
        raise ValueError(f"unknown categories: {sorted(unknown)}")
    return df, int(mask.sum())


def load_synthetic() -> tuple[pd.DataFrame, int]:
    files = [p for p in sorted(SYNTHETIC.glob("*.csv")) if p.name not in EXCLUDED_FILES]
    df = pd.concat([read_statement(p, "synthetic") for p in files], ignore_index=True)
    return apply_label_policy(df)


def load_labels() -> pd.DataFrame:
    """Hand-labelled real rows (the only real-world test set). Empty frame if there are none."""
    files = sorted(LABELS.glob("*.csv"))
    if not files:
        return pd.DataFrame()
    df = pd.concat([read_statement(p, "real") for p in files], ignore_index=True)
    return apply_label_policy(df)[0] if len(df) else df


def rule_categories(narrations: list[str], dirs: list[str]) -> list[str | None]:
    """The app's keyword rules (src/engine/rules.ts), run through Node."""
    if not narrations:
        return []
    out = subprocess.run(
        ["node", str(ML / "rules_bridge.mts")],
        input=json.dumps([[n, d] for n, d in zip(narrations, dirs)]),
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(out.stdout)


def load_extras() -> pd.DataFrame:
    """Rule-labelled real rows + owner corrections. Always added to training, never tested on."""
    frames = []
    for p in sorted(REAL.glob("*.csv")):
        df = read_statement(p, "real_rule")
        df["category"] = rule_categories(df["narration"].tolist(), df["dir"].tolist())
        frames.append(df[df["category"].notna()])
    for p in sorted(CORRECTIONS.glob("*.csv")):
        frames.append(read_statement(p, "correction"))
    if not frames:
        return pd.DataFrame()
    return apply_label_policy(pd.concat(frames, ignore_index=True))[0]


# ---------------------------------------------------------------- model

class Model:
    """FeatureBuilder + one-vs-rest logistic regression. predict_proba columns follow self.classes."""

    def __init__(self, c: float = C_REG) -> None:
        self.features = F.FeatureBuilder()
        self.clf = OneVsRestClassifier(LogisticRegression(C=c, class_weight="balanced", max_iter=5000))

    def _x(self, df: pd.DataFrame):
        return self.features.transform(
            df["narration"].tolist(), df["dir"].tolist(), df["amount"].tolist(), df["day"].tolist()
        )

    def fit(self, df: pd.DataFrame) -> "Model":
        self.features.fit(df["narration"])
        self.clf.fit(self._x(df), df["category"])
        return self

    @property
    def classes(self) -> list[str]:
        return list(self.clf.classes_)

    def predict_proba(self, df: pd.DataFrame) -> np.ndarray:
        return self.clf.predict_proba(self._x(df))

    def to_json(self, meta: dict) -> dict:
        est = self.clf.estimators_
        return {
            "format": FORMAT_VERSION,
            **meta,
            "classes": self.classes,
            "multiclass": "ovr",
            "features": {
                "clean": "ascii A-Z -> a-z; [0-9]+ -> '#'; [^a-z#@]+ -> ' '; trim",
                "analyzer": "char_wb",
                "ngram_range": list(F.NGRAM_RANGE),
                "min_df": F.MIN_DF,
                "norm": "l2",
                "smooth_idf": True,
                "dense": list(F.DENSE_NAMES),
                "rails": list(F.RAILS),
            },
            "vocabulary": self.features.vocabulary,
            "idf": self.features.idf,
            # One row per class (same order as "classes"); columns = vocabulary, then dense features.
            "coef": [e.coef_[0].tolist() for e in est],
            "intercept": [float(e.intercept_[0]) for e in est],
        }


# ---------------------------------------------------------------- validation

def leave_one_file_out(synthetic: pd.DataFrame, extras: pd.DataFrame, c: float = C_REG) -> pd.DataFrame:
    """Train on all synthetic files but one (+ extras), predict the held-out file. Returns one row per
    synthetic row with the true category and a probability column per class ("p_<class>")."""
    parts = []
    for held_out in sorted(synthetic["file"].unique()):
        train = pd.concat([synthetic[synthetic["file"] != held_out], extras], ignore_index=True)
        test = synthetic[synthetic["file"] == held_out].copy()
        model = Model(c).fit(train)
        proba = model.predict_proba(test)
        for i, cls in enumerate(model.classes):
            test[f"p_{cls}"] = proba[:, i]
        parts.append(test)
    out = pd.concat(parts, ignore_index=True)
    for cls in CATEGORIES:  # a class missing from a fold's training data gets probability 0
        out[f"p_{cls}"] = out.get(f"p_{cls}", pd.Series(0.0, index=out.index)).fillna(0.0)
    return out


# ---------------------------------------------------------------- parity fixture

def parity_inputs(synthetic: pd.DataFrame) -> list[dict]:
    """50 inputs: every narration in tests/fixtures/narrations.ts, a few edge cases, then a fixed sample of
    synthetic narrations. Amount and day are varied deterministically."""
    text = NARRATION_FIXTURES.read_text(encoding="utf-8")
    cases = [(n.replace("\\'", "'"), d) for n, d in re.findall(r"\['((?:[^'\\]|\\.)*)',\s*'([CD])'", text)]
    cases += [("", "D"), ("UPI/CR", "C"), ("CAFÉ ₹500 Rs.12,345.00 Dr", "D"), ("QQQQ ZZZZ", "C")]
    sample = synthetic.drop_duplicates("narration").sample(frac=1.0, random_state=7)
    for _, r in sample.iterrows():
        if len(cases) >= PARITY_CASES:
            break
        if (r["narration"], r["dir"]) not in cases:
            cases.append((r["narration"], r["dir"]))
    return [
        {"narration": n, "dir": d, "amount": round(37.5 * (i + 1) ** 1.9, 2), "day": (i * 7) % 31 + 1}
        for i, (n, d) in enumerate(cases[:PARITY_CASES])
    ]


def parity_fixture(model: Model, synthetic: pd.DataFrame, version: str) -> dict:
    inputs = parity_inputs(synthetic)
    proba = model.predict_proba(pd.DataFrame(inputs))
    return {
        "model_version": version,
        "tolerance": 1e-6,
        "cases": [
            {**inp, "rail": F.detect_rail(inp["narration"]), "probabilities": dict(zip(model.classes, map(float, p)))}
            for inp, p in zip(inputs, proba)
        ],
    }


# ---------------------------------------------------------------- main

def macro_f1(y_true, y_pred) -> float:
    return f1_score(y_true, y_pred, labels=sorted(set(y_true)), average="macro", zero_division=0)


def main() -> None:
    synthetic, relabelled = load_synthetic()
    extras = load_extras()
    print(f"synthetic: {len(synthetic)} rows from {synthetic['file'].nunique()} files "
          f"({relabelled} withdrawals relabelled income -> other); excluded: {', '.join(EXCLUDED_FILES)}")
    print(f"extras: {len(extras)} rows (rule-labelled real + corrections)")
    print(f"data/labels/: {len(load_labels())} rows (test set, not used for training)")

    print("\nleave-one-file-out, model only, top-1 (full report: python evaluate.py)")
    lofo = leave_one_file_out(synthetic, extras)
    pcols = [f"p_{c}" for c in CATEGORIES]
    lofo["pred"] = np.array(CATEGORIES)[lofo[pcols].to_numpy().argmax(axis=1)]
    for f, g in lofo.groupby("file"):
        print(f"  {f:45s} macro-F1 {macro_f1(g['category'], g['pred']):.3f}")

    train = pd.concat([synthetic, extras], ignore_index=True)
    model = Model().fit(train)
    today = date.today().isoformat()
    version = f"v3-{today}"
    counts = train["category"].value_counts()
    meta = {
        "version": version,
        "trained_at": today,
        "rows": {
            "total": len(train),
            "by_source": {k: int(v) for k, v in train["source"].value_counts().items()},
            "by_class": {c: int(counts.get(c, 0)) for c in CATEGORIES},
        },
        "training_files": sorted(train["file"].unique().tolist()),
        "excluded_files": EXCLUDED_FILES,
        "label_policy": "withdrawals labelled with an income category are trained as 'other'",
        "hyperparameters": {"C": C_REG, "class_weight": "balanced", "solver": "lbfgs"},
    }
    MODEL_PATH.write_text(json.dumps(model.to_json(meta), separators=(",", ":")), encoding="utf-8")
    PARITY_PATH.write_text(json.dumps(parity_fixture(model, synthetic, version), indent=1, ensure_ascii=False) + "\n",
                           encoding="utf-8")
    print(f"\nwrote {MODEL_PATH.relative_to(ROOT)} ({MODEL_PATH.stat().st_size / 1024:.0f} KB, "
          f"{len(model.features.vocabulary)} n-grams, {len(model.classes)} classes) and "
          f"{PARITY_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
