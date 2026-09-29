"""Read-only sanity report for the statement CSVs. Never modifies data.

Usage (from ml/):  python check_data.py [folder ...]      default: ../data/synthetic ../data/labels

Checks, per file:
  - schema: expected columns, valid category ids, valid source, parseable dates, exactly one of
    withdrawal/deposit filled
  - row count and category counts (with share of rows)
  - monthly withdrawal / deposit ratio
  - running balance: balance[i] == balance[i-1] + deposit[i] - withdrawal[i]  (to 1 paisa)
  - direction vs category: income categories must be deposits, expense categories withdrawals;
    refunds/reversals listed with their side (a refund received is a deposit, other_income;
    a reversal of a sale going back out is a withdrawal)
Across files:
  - narration patterns (digits masked) that appear with more than one category
  - CHANGELOG.csv cross-check: each logged edit is present at the stated line
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = ["date", "narration", "withdrawal", "deposit", "balance", "category", "source", "hard_case"]
INCOME = {"sales", "other_income"}
EXPENSE = {"suppliers", "salary", "rent", "utilities", "emi", "tax", "personal", "charges", "other"}
CATEGORIES = INCOME | EXPENSE
SOURCES = {"synthetic", "real", "correction"}
REFUND_RE = re.compile(r"REFUND|REVERSAL|\bREV\b|CASHBACK|RETURN", re.I)
MAX_LIST = 15  # max example rows printed per issue


def pattern(narration: str) -> str:
    """Narration with digit runs masked, so reference numbers don't make every row unique."""
    return re.sub(r"\d+", "#", str(narration).upper().strip())


def fmt_rows(df: pd.DataFrame, cols=("line", "date", "narration", "withdrawal", "deposit", "category")) -> str:
    shown = df.head(MAX_LIST)[list(cols)].to_string(index=False)
    more = f"\n      ... and {len(df) - MAX_LIST} more" if len(df) > MAX_LIST else ""
    return "      " + shown.replace("\n", "\n      ") + more


def load(path: Path) -> tuple[pd.DataFrame, list[str]]:
    problems: list[str] = []
    df = pd.read_csv(path, dtype={"narration": str, "category": str, "source": str})
    missing = [c for c in EXPECTED if c not in df.columns]
    extra = [c for c in df.columns if c not in EXPECTED]
    if missing:
        problems.append(f"missing columns: {missing}")
    if extra:
        problems.append(f"unexpected columns: {extra}")
    df["line"] = df.index + 2  # 1-based file line; line 1 is the header
    for c in ("withdrawal", "deposit", "balance"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["parsed_date"] = pd.to_datetime(df.get("date"), format="%Y-%m-%d", errors="coerce")
    return df, problems


def check_file(path: Path) -> tuple[pd.DataFrame | None, list[str]]:
    print(f"\n{'=' * 100}\n{path.relative_to(ROOT)}\n{'=' * 100}")
    df, problems = load(path)
    if "narration" not in df.columns:
        print("  SKIPPED: not a statement file (no narration column)")
        return None, []
    issues = list(problems)

    # --- schema-level checks
    bad_dates = df[df["parsed_date"].isna()]
    if len(bad_dates):
        issues.append(f"{len(bad_dates)} rows with unparseable date")
    bad_cat = df[~df["category"].isin(CATEGORIES)]
    if len(bad_cat):
        issues.append(f"{len(bad_cat)} rows with unknown category: {sorted(bad_cat['category'].astype(str).unique())}")
    if "source" in df.columns:
        bad_src = df[~df["source"].isin(SOURCES)]
        if len(bad_src):
            issues.append(f"{len(bad_src)} rows with unknown source: {sorted(bad_src['source'].astype(str).unique())}")
    both = df[df["withdrawal"].notna() & df["deposit"].notna()]
    neither = df[df["withdrawal"].isna() & df["deposit"].isna()]
    nonpos = df[(df["withdrawal"] <= 0) | (df["deposit"] <= 0)]
    if len(both):
        issues.append(f"{len(both)} rows with both withdrawal and deposit filled")
    if len(neither):
        issues.append(f"{len(neither)} rows with neither withdrawal nor deposit")
    if len(nonpos):
        issues.append(f"{len(nonpos)} rows with zero/negative amount")
    unsorted = (df["parsed_date"].diff().dt.days < 0).sum()
    if unsorted:
        issues.append(f"{unsorted} places where date goes backwards")

    df["dir"] = df["deposit"].notna().map({True: "C", False: "D"})
    df["amount"] = df["deposit"].fillna(df["withdrawal"])

    # --- counts
    n = len(df)
    span = f"{df['parsed_date'].min():%Y-%m-%d} .. {df['parsed_date'].max():%Y-%m-%d}"
    hc = int(df["hard_case"].fillna(0).astype(int).sum()) if "hard_case" in df.columns else None
    print(f"  rows: {n}   dates: {span}   hard_case rows: {hc if hc is not None else 'n/a (no column)'}")
    counts = df.groupby(["category", "dir"]).size().unstack(fill_value=0)
    counts["total"] = counts.sum(axis=1)
    counts["share"] = (counts["total"] / n * 100).round(1).astype(str) + "%"
    counts = counts.sort_values("total", ascending=False)
    print("\n  category counts (C = deposit, D = withdrawal):")
    print("    " + counts.to_string().replace("\n", "\n    "))

    # --- monthly ratio
    m = df.assign(month=df["parsed_date"].dt.to_period("M")).groupby("month")
    monthly = pd.DataFrame(
        {
            "rows": m.size(),
            "deposits": m["deposit"].sum().round(0),
            "withdrawals": m["withdrawal"].sum().round(0),
        }
    )
    monthly["wd/dep"] = (monthly["withdrawals"] / monthly["deposits"]).round(3)
    monthly["net"] = (monthly["deposits"] - monthly["withdrawals"]).round(0)
    print("\n  monthly withdrawal/deposit ratio:")
    print("    " + monthly.to_string().replace("\n", "\n    "))

    # --- balance
    delta = df["deposit"].fillna(0) - df["withdrawal"].fillna(0)
    opening = df["balance"].iloc[0] - delta.iloc[0]
    expected = opening + delta.cumsum()
    df["bal_err"] = (df["balance"] - expected).round(2)
    # Row-to-row check too, so one bad row shows once instead of shifting everything after it.
    step_err = (df["balance"] - df["balance"].shift(1) - delta).round(2)
    step_err.iloc[0] = 0.0
    bad_steps = df[step_err.abs() > 0.011]
    print(f"\n  balance: opening {opening:,.2f}, closing {df['balance'].iloc[-1]:,.2f}, "
          f"min {df['balance'].min():,.2f}; row-to-row mismatches: {len(bad_steps)}")
    if len(bad_steps):
        issues.append(f"{len(bad_steps)} running-balance mismatches")
        print(fmt_rows(bad_steps.assign(step_err=step_err[bad_steps.index]),
                       ("line", "date", "narration", "withdrawal", "deposit", "balance", "step_err")))
    neg = df[df["balance"] < 0]
    if len(neg):
        print(f"  note: {len(neg)} rows with negative balance (overdraft?)")

    # --- direction vs category
    income_out = df[(df["dir"] == "D") & df["category"].isin(INCOME)]
    expense_in = df[(df["dir"] == "C") & df["category"].isin(EXPENSE)]
    print(f"\n  direction vs category: income category on a withdrawal: {len(income_out)}, "
          f"expense category on a deposit: {len(expense_in)}")
    if len(income_out):
        issues.append(f"{len(income_out)} withdrawals labelled as income ({dict(income_out['category'].value_counts())})")
        print(fmt_rows(income_out))
    if len(expense_in):
        issues.append(f"{len(expense_in)} deposits labelled as expense ({dict(expense_in['category'].value_counts())})")
        print(fmt_rows(expense_in))

    refunds = df[df["narration"].str.contains(REFUND_RE, na=False)]
    # Per CLAUDE.md: refund received = deposit + other_income; reversal going out = withdrawal.
    wrong_refund = refunds[
        ((refunds["dir"] == "C") & (refunds["category"] != "other_income"))
        | ((refunds["dir"] == "D") & refunds["category"].isin(INCOME))
    ]
    print(f"\n  refunds/reversals: {len(refunds)} rows "
          f"({(refunds['dir'] == 'C').sum()} deposits, {(refunds['dir'] == 'D').sum()} withdrawals); "
          f"on the wrong side or wrong category: {len(wrong_refund)}")
    if len(refunds):
        print(fmt_rows(refunds.assign(dir=refunds["dir"]),
                       ("line", "date", "narration", "withdrawal", "deposit", "category")))
    if len(wrong_refund):
        issues.append(f"{len(wrong_refund)} refund/reversal rows on the wrong side or with the wrong category")

    print("\n  ISSUES: " + ("none" if not issues else "\n    - " + "\n    - ".join(issues)))
    df["file"] = path.name
    return df, issues


def cross_file(all_rows: pd.DataFrame) -> None:
    print(f"\n{'=' * 100}\nNARRATION PATTERNS WITH MORE THAN ONE CATEGORY (digits masked as #; all files)\n{'=' * 100}")
    all_rows = all_rows.assign(pattern=all_rows["narration"].map(pattern))
    g = all_rows.groupby("pattern")
    multi = g["category"].nunique()
    multi = multi[multi > 1].index
    if not len(multi):
        print("  none")
        return
    rows = []
    for p in multi:
        sub = all_rows[all_rows["pattern"] == p]
        by = sub.groupby(["category", "dir"]).size()
        rows.append(
            {
                "pattern": p,
                "rows": len(sub),
                "same direction": "yes" if sub["dir"].nunique() == 1 else "no",
                "hard_case": int(sub["hard_case"].fillna(0).sum()) if "hard_case" in sub else "",
                "categories (dir:count)": ", ".join(f"{c}/{d}:{k}" for (c, d), k in by.items()),
                "files": sub["file"].nunique(),
            }
        )
    out = pd.DataFrame(rows).sort_values("rows", ascending=False)
    with pd.option_context("display.max_colwidth", 80, "display.width", 250):
        print(out.to_string(index=False))
    same_dir = out[out["same direction"] == "yes"]
    print(f"\n  {len(out)} ambiguous patterns; {len(same_dir)} of them are ambiguous even within one direction "
          f"(direction alone cannot separate them).")


def check_changelog(folder: Path, frames: dict[str, pd.DataFrame]) -> None:
    path = folder / "CHANGELOG.csv"
    if not path.exists():
        return
    print(f"\n{'=' * 100}\nCHANGELOG CROSS-CHECK ({path.relative_to(ROOT)})\n{'=' * 100}")
    log = pd.read_csv(path, dtype=str)
    ok, bad = 0, []
    for _, r in log.iterrows():
        df = frames.get(r["file"])
        if df is None:
            bad.append(f"{r['file']}: file not found")
            continue
        hit = df[df["line"] == int(r["line"])]
        if hit.empty:
            bad.append(f"{r['file']}:{r['line']}: no such line")
            continue
        h = hit.iloc[0]
        if h["narration"] != r["new_narration"] or h["category"] != r["category"] or h["date"] != r["date"]:
            bad.append(f"{r['file']}:{r['line']}: file has '{h['narration']}' / {h['category']} / {h['date']}, "
                       f"log says '{r['new_narration']}' / {r['category']} / {r['date']}")
        else:
            ok += 1
    print(f"  {len(log)} logged edits; {ok} match the files; {len(bad)} don't")
    for b in bad[:MAX_LIST]:
        print("   - " + b)

    # What kind of edits were these? Same side (C/D) as the row now sits on?
    merged = []
    for _, r in log.iterrows():
        df = frames.get(r["file"])
        if df is None:
            continue
        hit = df[df["line"] == int(r["line"])]
        if not hit.empty:
            merged.append({"old": r["old_narration"], "new_pattern": pattern(r["new_narration"]), "category": r["category"],
                           "dir": hit.iloc[0]["dir"]})
    if merged:
        m = pd.DataFrame(merged)
        summary = m.groupby(["old", "new_pattern", "category", "dir"]).size().reset_index(name="n")
        print("\n  edit summary (old narration -> new pattern, category, side the row is on):")
        with pd.option_context("display.width", 250):
            print("    " + summary.sort_values("n", ascending=False).to_string(index=False).replace("\n", "\n    "))


def main(folders: list[Path]) -> None:
    pd.set_option("display.width", 200)
    summary = []
    frames: dict[str, pd.DataFrame] = {}
    for folder in folders:
        files = sorted(p for p in folder.glob("*.csv"))
        print(f"\n### {folder.relative_to(ROOT)}: {len(files)} CSV file(s)")
        if not files:
            print("  (empty)")
        for f in files:
            df, issues = check_file(f)
            if df is None:
                continue
            frames[f.name] = df
            summary.append({"file": f.name, "rows": len(df), "issues": len(issues),
                            "has hard_case": "hard_case" in df.columns})
    if frames:
        cross_file(pd.concat(frames.values(), ignore_index=True))
        for folder in folders:
            check_changelog(folder, frames)
        print(f"\n{'=' * 100}\nSUMMARY\n{'=' * 100}")
        print(pd.DataFrame(summary).to_string(index=False))


if __name__ == "__main__":
    args = [Path(a).resolve() for a in sys.argv[1:]] or [ROOT / "data" / "synthetic", ROOT / "data" / "labels"]
    main(args)
