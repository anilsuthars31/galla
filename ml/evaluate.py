"""Evaluate the V3 classifier and write docs/results.md + docs/confusion_matrix.png.

Usage (from ml/):  python evaluate.py

Two separate evaluations, never mixed:
  1. Synthetic validation: leave-one-file-out over the synthetic files (train on 6, test on the 7th).
     Synthetic data comes from one generator template, so these numbers are optimistic.
  2. Real-world score: the final model tested on data/labels/ (hand-labelled real rows). Only this one
     may be quoted as how well the classifier works.

Each approach is scored the way the app would decide (src/engine/categorize.ts):
  majority  always "sales"
  rules     keyword rule, else the app's fallback ("sales" for money in, "other" for money out)
  model     model only: most likely class of the right direction; confidence = its probability
  hybrid    rule first (confidence 1), else the model as above  <- what the app does
Top-1 metrics (macro-F1, per-class F1, accuracy) use the approach's best guess for every row.
"Auto accuracy" is accuracy on rows the app would decide on its own (confidence >= 0.8);
"review share" is the share of rows below 0.8 that go to the owner.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from sklearn.metrics import confusion_matrix, f1_score  # noqa: E402

import train as T  # noqa: E402

THRESHOLD = 0.8  # MODEL_THRESHOLD in src/engine/categorize.ts
DOCS = T.ROOT / "docs"
RESULTS = DOCS / "results.md"
CM_PATH = DOCS / "confusion_matrix.png"
APPROACHES = ("majority", "rules", "model", "hybrid")


def decide(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Prediction + confidence per approach. df needs dir, rule, and p_<class> columns."""
    cats = np.array(T.CATEGORIES)
    proba = df[[f"p_{c}" for c in T.CATEGORIES]].to_numpy()
    is_income = np.isin(cats, T.INCOME)
    # categorize.ts drops classes of the wrong direction but does not renormalise.
    allowed = np.where((df["dir"].to_numpy() == "C")[:, None], is_income[None, :], ~is_income[None, :])
    masked = np.where(allowed, proba, -1.0)
    top = masked.argmax(axis=1)
    model_pred, model_conf = cats[top], masked[np.arange(len(df)), top]

    fallback = np.where(df["dir"] == "C", "sales", "other")
    has_rule = df["rule"].notna().to_numpy()
    rule = df["rule"].to_numpy()
    return {
        "majority": pd.DataFrame({"pred": "sales", "conf": np.nan}, index=df.index),
        "rules": pd.DataFrame({"pred": np.where(has_rule, rule, fallback), "conf": has_rule.astype(float)}, index=df.index),
        "model": pd.DataFrame({"pred": model_pred, "conf": model_conf}, index=df.index),
        "hybrid": pd.DataFrame(
            {"pred": np.where(has_rule, rule, model_pred), "conf": np.where(has_rule, 1.0, model_conf)}, index=df.index
        ),
    }


def scores(y: pd.Series, d: pd.DataFrame) -> dict:
    labels = sorted(set(y))
    auto = d["conf"] >= THRESHOLD
    has_conf = d["conf"].notna().any()
    return {
        "rows": len(y),
        "macro_f1": f1_score(y, d["pred"], labels=labels, average="macro", zero_division=0),
        "accuracy": float((y == d["pred"]).mean()),
        "auto_acc": float((y[auto] == d["pred"][auto]).mean()) if has_conf and auto.any() else np.nan,
        "review": float((~auto).mean()) if has_conf else np.nan,
    }


def per_class_f1(y: pd.Series, pred: pd.Series) -> dict[str, float]:
    labels = [c for c in T.CATEGORIES if c in set(y)]
    return dict(zip(labels, f1_score(y, pred, labels=labels, average=None, zero_division=0)))


# ---------------------------------------------------------------- markdown helpers

def fmt(v, pct=False) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "–"
    return f"{v * 100:.1f}%" if pct else f"{v:.3f}"


def table(header: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(r) + " |" for r in rows]
    return "\n".join(out)


def approach_table(groups: list[tuple[str, pd.Series, dict[str, pd.DataFrame]]]) -> str:
    rows = []
    for name, y, dec in groups:
        for a in APPROACHES:
            s = scores(y, dec[a])
            rows.append([name, a, str(s["rows"]), fmt(s["macro_f1"]), fmt(s["accuracy"], True),
                         fmt(s["auto_acc"], True), fmt(s["review"], True)])
            name = ""
    return table(["Test set", "Approach", "Rows", "Macro-F1", "Accuracy (top-1)", "Auto accuracy (≥ 0.8)",
                  "Review share (< 0.8)"], rows)


def confusion_png(y: pd.Series, decs: dict[str, pd.DataFrame], path: Path, title: str) -> None:
    labels = [c for c in T.CATEGORIES if c in set(y) | set(decs["hybrid"]["pred"])]
    fig, axes = plt.subplots(1, 2, figsize=(16, 7.5))
    for ax, a in zip(axes, ("hybrid", "model")):
        cm = confusion_matrix(y, decs[a]["pred"], labels=labels)
        norm = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
        ax.imshow(norm, cmap="Blues", vmin=0, vmax=1)
        for i in range(len(labels)):
            for j in range(len(labels)):
                if cm[i, j]:
                    ax.text(j, i, str(cm[i, j]), ha="center", va="center", fontsize=8,
                            color="white" if norm[i, j] > 0.5 else "black")
        ax.set_xticks(range(len(labels)), labels, rotation=45, ha="right")
        ax.set_yticks(range(len(labels)), labels)
        ax.set_xlabel("predicted (top-1)")
        ax.set_ylabel("true")
        ax.set_title({"hybrid": "Hybrid (rules first, then model) — what the app does", "model": "Model only"}[a])
    fig.suptitle(title + "\ncell = row count, colour = share of the true class")
    fig.tight_layout()
    fig.savefig(path, dpi=130)
    plt.close(fig)


# ---------------------------------------------------------------- main

def main() -> None:
    DOCS.mkdir(exist_ok=True)
    synthetic, relabelled = T.load_synthetic()
    extras = T.load_extras()
    labels = T.load_labels()

    lofo = T.leave_one_file_out(synthetic, extras)
    lofo["rule"] = T.rule_categories(lofo["narration"].tolist(), lofo["dir"].tolist())
    dec = decide(lofo)
    y = lofo["category"]

    md: list[str] = []
    md.append("# V3 classifier — evaluation results\n")
    md.append(f"- **Date:** {date.today().isoformat()}")
    md.append(f"- **Command:** `cd ml && python train.py && python evaluate.py`")
    md.append(f"- **Model:** one-vs-rest LogisticRegression(C={T.C_REG}, class_weight='balanced') on char 3-5 gram "
              "TF-IDF + direction, log amount, day of month, rail (see `ml/features.py`)")
    md.append(f"- **Synthetic data:** {len(synthetic)} rows from {synthetic['file'].nunique()} files in "
              f"`data/synthetic/`; {int(synthetic['hard_case'].sum())} rows tagged `hard_case`")
    md.append(f"- **Excluded:** " + "; ".join(f"`{k}` ({v})" for k, v in T.EXCLUDED_FILES.items()))
    md.append(f"- **Label policy:** {relabelled} withdrawals labelled `sales` (sale reversals) scored as `other`, "
              "because the app never gives money out an income category")
    md.append(f"- **Extra training rows** (rule-labelled real + owner corrections): {len(extras)}")
    md.append(f"- **Real hand-labelled rows** (`data/labels/`): {len(labels)}\n")

    # ------------------------------------------------ real-world
    md.append("## Real-world score\n")
    if len(labels):
        final = T.Model().fit(pd.concat([synthetic, extras], ignore_index=True))
        proba = final.predict_proba(labels)
        for i, c in enumerate(final.classes):
            labels[f"p_{c}"] = proba[:, i]
        for c in T.CATEGORIES:
            if f"p_{c}" not in labels:
                labels[f"p_{c}"] = 0.0
        labels["rule"] = T.rule_categories(labels["narration"].tolist(), labels["dir"].tolist())
        ldec = decide(labels)
        md.append(f"Final model (trained on all synthetic files + extras) tested on {len(labels)} hand-labelled real "
                  "rows. **This is the real-world score.**\n")
        md.append(approach_table([("data/labels", labels["category"], ldec)]))
        hc = labels["hard_case"] == 1
        if hc.any():
            md.append("\nHard cases only:\n")
            md.append(approach_table([("data/labels hard_case", labels["category"][hc],
                                       {a: d[hc] for a, d in ldec.items()})]))
        pc = {a: per_class_f1(labels["category"], ldec[a]["pred"]) for a in ("rules", "model", "hybrid")}
        cls = list(pc["hybrid"])
        md.append("\nPer-class F1:\n")
        md.append(table(["Approach"] + cls, [[a] + [fmt(pc[a][c]) for c in cls] for a in pc]))
        confusion_png(labels["category"], ldec, CM_PATH, f"Real hand-labelled rows ({len(labels)})")
        cm_note = "real hand-labelled rows"
    else:
        md.append("> **Synthetic validation only, not a real-world score.** `data/labels/` is empty, so there is no "
                  "real-world number yet. Everything below is measured on synthetic statements generated from one "
                  "template (every file has the same count of salary, rent, tax, EMI… rows), so it will overstate "
                  "how well the classifier does on a real bank statement. Do not quote these numbers as accuracy.\n")
        cm_note = None

    # ------------------------------------------------ synthetic validation
    md.append("## Synthetic validation: leave one file out\n")
    md.append("Train on 6 synthetic files, test on the 7th, repeat for all 7. The TF-IDF vocabulary is fitted on the "
              "training files only.\n")
    md.append("### Summary per held-out file\n")
    groups = [(f, g["category"], {a: d.loc[g.index] for a, d in dec.items()}) for f, g in lofo.groupby("file")]
    groups.append(("**all 7 (pooled)**", y, dec))
    md.append(approach_table(groups))

    md.append("\n### Macro-F1 by held-out file\n")
    rows = []
    for f, g in lofo.groupby("file"):
        rows.append([f] + [fmt(scores(g["category"], dec[a].loc[g.index])["macro_f1"]) for a in APPROACHES])
    means = [np.mean([float(r[i + 1]) for r in rows]) for i in range(len(APPROACHES))]
    stds = [np.std([float(r[i + 1]) for r in rows]) for i in range(len(APPROACHES))]
    rows.append(["**mean ± sd**"] + [f"{m:.3f} ± {s:.3f}" for m, s in zip(means, stds)])
    md.append(table(["Held-out file"] + list(APPROACHES), rows))

    for a in ("hybrid", "model"):
        md.append(f"\n### Per-class F1 by held-out file — {a}\n")
        rows = []
        for f, g in lofo.groupby("file"):
            pc = per_class_f1(g["category"], dec[a].loc[g.index, "pred"])
            rows.append([f] + [fmt(pc.get(c)) for c in T.CATEGORIES])
        pc = per_class_f1(y, dec[a]["pred"])
        rows.append(["**pooled**"] + [fmt(pc.get(c)) for c in T.CATEGORIES])
        md.append(table(["Held-out file"] + list(T.CATEGORIES), rows))

    md.append("\n### Hard cases (`hard_case = 1`, pooled over the 7 folds)\n")
    md.append("Same payee (or a payee-less `UPI/<ref>`) seen as both a customer and a payee. The narration alone can't "
              "tell these apart; ideally they go to review rather than being guessed wrong.\n")
    hc = lofo["hard_case"] == 1
    md.append(approach_table([
        ("hard_case = 1", y[hc], {a: d[hc] for a, d in dec.items()}),
        ("hard_case = 0", y[~hc], {a: d[~hc] for a, d in dec.items()}),
    ]))
    wrong_auto = lofo[hc & (dec["hybrid"]["conf"] >= THRESHOLD) & (dec["hybrid"]["pred"] != y)]
    md.append(f"\nHard cases the hybrid gets wrong *without* sending them to review: {len(wrong_auto)} of {int(hc.sum())}.")
    if len(wrong_auto):
        ex = wrong_auto.assign(pred=dec["hybrid"]["pred"], source=np.where(wrong_auto["rule"].notna(), "rule", "model"))
        top = ex.groupby(["narration", "dir", "category", "pred", "source"]).size().reset_index(name="n")
        top = top.sort_values("n", ascending=False).head(10)
        md.append("\n" + table(["Narration", "Dir", "True", "Predicted", "By", "Rows"],
                              [[f"`{r.narration}`", r.dir, r.category, r.pred, r.source, str(r.n)]
                               for r in top.itertuples()]))

    md.append("\n### Where the rules disagree with the labels\n")
    md.append("A rule match is final (confidence 1) and outranks the model, so every row below is a mistake the app "
              "makes without asking. Digits are masked as `#`.\n")
    bad = lofo[lofo["rule"].notna() & (lofo["rule"] != y)]
    if len(bad):
        bad = bad.assign(pattern=bad["narration"].str.replace(r"\d+", "#", regex=True),
                         model_right=dec["model"]["pred"][bad.index] == bad["category"])
        g = bad.groupby(["pattern", "dir", "category", "rule"]).agg(rows=("file", "size"), hard=("hard_case", "sum"),
                                                                    model_right=("model_right", "sum"))
        g = g.reset_index().sort_values("rows", ascending=False).head(15)
        md.append(table(["Narration pattern", "Dir", "True", "Rule says", "Rows", "Hard cases", "Model alone right"],
                        [[f"`{r.pattern}`", r.dir, r.category, r.rule, str(r.rows), str(r.hard), str(r.model_right)]
                         for r in g.itertuples()]))
    else:
        md.append("None.")

    if cm_note is None:
        confusion_png(y, dec, CM_PATH, "Synthetic validation, leave one file out, pooled over 7 folds "
                                       "(NOT a real-world score)")
        cm_note = "synthetic leave-one-file-out predictions, pooled (not a real-world score)"
    md.append(f"\n## Confusion matrix\n\n![Confusion matrix](confusion_matrix.png)\n\n`docs/confusion_matrix.png`: "
              f"{cm_note}.\n")

    md.append("## How to read this\n")
    md.append("- **majority** shows why accuracy is misleading here: always saying `sales` is right on most rows but "
              "has a very low macro-F1.")
    md.append("- **rules** are always confident when they match; rows with no rule go to review.")
    md.append("- **hybrid** is what the app does. Compare its auto accuracy with its review share: a lower threshold "
              "would send fewer rows to review but make more silent mistakes.")
    md.append("- The spread across held-out files (mean ± sd) matters more than any single number.")

    RESULTS.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"wrote {RESULTS.relative_to(T.ROOT)} and {CM_PATH.relative_to(T.ROOT)}")


if __name__ == "__main__":
    main()
