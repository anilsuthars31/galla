/* Public engine API. Everything here is pure: same input, same output. */
import type { Analysis, Cell, Classifier, Overrides, RawTxn, Txn } from './types';
import type { PayeeRule } from './profile';
import { rowsToTxns } from './parse';
import { enrich } from './categorize';
import { analyze } from './analyze';

export * from './types';
export * from './months';
export * from './format';
export * from './profile';
export { StatementError, MESSAGES, fileKind, isPdfBytes, parseAmount, parseDate, parseCSV, rowsToTxns, parseStatementText, friendlyError } from './parse';
export { detectRail, extractPayee, payeeKey } from './narration';
export { ruleCategory, RULES } from './rules';
export { categorize, enrich, MODEL_THRESHOLD } from './categorize';
export { buildProfileMatcher, type ProfileMatch, type ProfileMatcher } from './profileMatch';
export { payeeCandidates, type PayeeCandidate } from './candidates';
export { loadClassifier, ModelFormatError, type LoadedClassifier } from './classifier';
export { findRecurring } from './recurring';
export { buildForecast } from './forecast';
export { buildBudget } from './budget';
export { buildAlerts } from './alerts';
export { analyze, summarizeMonths } from './analyze';
export { sampleStatementRows } from './sample';
export { correctionsCsv, countCorrections, CSV_COLUMNS } from './corrections';

export interface Processed {
  txns: Txn[];
  analysis: Analysis;
}

/** Parsed transactions -> categorized transactions + analysis. `payees` are the owner's setup payees. */
export function processStatement(
  raw: readonly RawTxn[],
  overrides: Overrides = {},
  classifier?: Classifier,
  payees: readonly PayeeRule[] = [],
): Processed {
  const txns = enrich(raw, overrides, classifier, undefined, payees);
  return { txns, analysis: analyze(txns) };
}

/** Spreadsheet/CSV rows -> categorized transactions + analysis. */
export function processRows(rows: readonly (readonly Cell[])[], overrides: Overrides = {}, classifier?: Classifier): Processed & { raw: RawTxn[] } {
  const raw = rowsToTxns(rows);
  return { raw, ...processStatement(raw, overrides, classifier) };
}
