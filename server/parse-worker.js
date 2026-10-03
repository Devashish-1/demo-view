import { parentPort, workerData } from 'node:worker_threads';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
try {
  const buffer = Buffer.from(workerData.buffer);
  let records;
  if (workerData.filename.toLowerCase().endsWith('.csv')) {
    const parsed = Papa.parse(buffer.toString('utf8'), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ''),
    });
    if (parsed.errors.length)
      throw new Error(`CSV row ${parsed.errors[0].row ?? 0}: ${parsed.errors[0].message}`);
    records = parsed.data;
  } else {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      sheetRows: 10002,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }
  if (!records.length)
    throw new Error('The file is empty. Include a header row and at least one lead.');
  if (records.length > 10000) throw new Error('Upload up to 10,000 rows at a time.');
  if (Object.keys(records[0]).length > 50) throw new Error('Files may contain up to 50 columns.');
  parentPort.postMessage({ records });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
