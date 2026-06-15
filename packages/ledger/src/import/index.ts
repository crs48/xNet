/**
 * Statement import parsers (exploration 0187).
 *
 * Every parser normalizes to `ImportedRow[]` (positive = money in), which then
 * flows through the same dedupe → categorize → ledger pipeline regardless of
 * source (file or bank sync).
 */

export { importCsv, parseCsv, type CsvMapping, type Column, type CsvImportResult } from './csv'
export { importOfx, ofxCurrency, type OfxImportResult } from './ofx'
export { importQif, type QifImportResult } from './qif'
export { parseStatementDate, parseOfxDate } from './dates'
