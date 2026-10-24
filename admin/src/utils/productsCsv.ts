import type { CreateProductInput } from '../api/client';
import type { Product, ProductAvailability } from '../types';
import { AVAILABILITY_LABELS } from './productAvailability';

// Settings > Products CSV export/import. The import reads the same columns
// the export writes, so an exported file can be edited and re-imported.
const HEADER = ['Product Code', 'Name', 'Description', 'Price', 'Availability', 'Price List'];

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads every product as a CSV. */
export function downloadProductsCsv(products: Product[]) {
  const rows = [...products]
    .sort((a, b) => a.productCode.localeCompare(b.productCode))
    .map((p) => [
      p.productCode,
      p.name,
      p.description ?? '',
      p.price.toFixed(2),
      p.availability ? AVAILABILITY_LABELS[p.availability] : '',
      p.displayInPriceList ? 'Yes' : 'No',
    ]);
  // Leading BOM so Excel reads the file as UTF-8 (names with accents etc.).
  const csv = '﻿' + [HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Products.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// RFC 4180-ish: quoted fields may contain commas, doubled quotes and line breaks.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, '');

function parseAvailability(value: string): ProductAvailability | null | undefined {
  const v = normalise(value);
  if (v === '' || v === 'none' || v === 'any') return null;
  for (const [key, label] of Object.entries(AVAILABILITY_LABELS) as [ProductAvailability, string][]) {
    if (v === normalise(key) || v === normalise(label)) return key;
  }
  return undefined;
}

function parseYesNo(value: string): boolean | undefined {
  const v = normalise(value);
  if (['', 'no', 'n', 'false', '0'].includes(v)) return false;
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  return undefined;
}

export interface ParsedProductsCsv {
  products: CreateProductInput[];
  errors: string[];
}

/** Parses an uploaded CSV into product rows, collecting per-row errors. */
export function parseProductsCsv(text: string): ParsedProductsCsv {
  const rows = parseCsvRows(text.replace(/^﻿/, ''));
  if (rows.length === 0) return { products: [], errors: ['The file is empty.'] };

  const header = rows[0].map(normalise);
  const col = (name: string) => header.indexOf(normalise(name));
  const idx = {
    productCode: col('Product Code'),
    name: col('Name'),
    description: col('Description'),
    price: col('Price'),
    availability: col('Availability'),
    priceList: col('Price List'),
  };
  const missing = (['Product Code', 'Name', 'Price'] as const).filter((h) => col(h) === -1);
  if (missing.length > 0) {
    return { products: [], errors: [`Missing required column(s): ${missing.join(', ')}.`] };
  }

  const products: CreateProductInput[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (j: number) => (j === -1 ? '' : (r[j] ?? '').trim());
    const productCode = get(idx.productCode);
    const name = get(idx.name);
    const priceText = get(idx.price).replace(/[£,\s]/g, '');
    const price = Number(priceText);
    const availability = parseAvailability(get(idx.availability));
    const displayInPriceList = parseYesNo(get(idx.priceList));

    const rowErrors: string[] = [];
    if (!productCode) rowErrors.push('product code is blank');
    if (!name) rowErrors.push('name is blank');
    if (priceText === '' || !Number.isFinite(price) || price < 0) rowErrors.push(`price "${get(idx.price)}" isn't valid`);
    if (availability === undefined) rowErrors.push(`availability "${get(idx.availability)}" isn't recognised`);
    if (displayInPriceList === undefined) rowErrors.push(`price list "${get(idx.priceList)}" should be Yes or No`);
    if (productCode && seen.has(productCode)) rowErrors.push(`product code ${productCode} is also on row ${seen.get(productCode)}`);
    if (rowErrors.length > 0) {
      errors.push(`Row ${line}: ${rowErrors.join('; ')}.`);
      return;
    }
    seen.set(productCode, line);
    products.push({
      productCode,
      name,
      description: get(idx.description) || undefined,
      price: Math.round(price * 100) / 100,
      availability: availability ?? null,
      displayInPriceList: displayInPriceList ?? false,
    });
  });
  return { products, errors };
}
