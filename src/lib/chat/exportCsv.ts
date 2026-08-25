// CSV export for the chat screens.
//
// Written by hand rather than with a spreadsheet library: the whole job is
// quoting and a byte order mark, and a megabyte of dependency to write a
// comma-separated file is a poor trade for a shop that wants a phone list.
//
// The BOM is the part that matters. Excel on Windows reads a UTF-8 file without
// one as the system codepage, which turns every Mongolian name into mojibake —
// the file is correct, and the shop sees rubbish and concludes the export is
// broken.

const BOM = '\uFEFF';

/**
 * One CSV cell. Quotes anything that could otherwise break the row, and doubles
 * any quote inside it, which is how CSV escapes itself.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula. Customer
  // names and notes are not formulas, and one starting with "=" should not run.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  // CRLF, because that is what Excel expects and every other reader tolerates.
  return BOM + lines.join('\r\n');
}

/** Hands the file to the browser. Named with the date so downloads do not collide. */
export function downloadCsv(baseName: string, headers: string[], rows: Array<Array<unknown>>): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick: revoking immediately races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
