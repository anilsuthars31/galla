/* Reading an uploaded statement and saving a file. The file never leaves the browser. */
import { MESSAGES, StatementError, fileKind, isPdfBytes, parseStatementText, rowsToTxns, type RawTxn } from '../engine';

export async function readStatementFile(file: File): Promise<RawTxn[]> {
  if (file.size === 0) throw new StatementError(MESSAGES.empty);
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (isPdfBytes(head)) throw new StatementError(MESSAGES.pdf);

  const kind = fileKind(file.name);
  if (kind === 'pdf') throw new StatementError(MESSAGES.pdf);
  if (kind === 'excel') {
    // SheetJS is loaded only when an Excel file is uploaded.
    const { rowsFromExcel } = await import('../engine/excel');
    return rowsToTxns(rowsFromExcel(await file.arrayBuffer()));
  }
  if (kind === 'csv' || file.type.startsWith('text/')) return parseStatementText(await file.text());
  throw new StatementError(MESSAGES.unsupported);
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
