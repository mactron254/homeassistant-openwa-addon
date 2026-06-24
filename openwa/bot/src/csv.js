'use strict';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < String(text || '').length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  if (row.some(value => value !== '') || rows.length) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map(value => normalizeHeader(value));
  return rows
    .filter(values => values.some(value => String(value || '').trim()))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, String(values[index] || '').trim()])));
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

module.exports = { parseCsv };
