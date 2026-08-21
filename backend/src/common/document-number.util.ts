// Shared by InvoicesService and QuotesService to turn a staff-editable
// template (e.g. "INV-{year}-{seq}") plus the next sequence number into an
// actual invoice/quote number -- {seq} is always zero-padded to 5 digits so
// numbers sort and align the same way regardless of how large the count gets.
export function formatDocumentNumber(template: string, seq: number): string {
  return template
    .replace(/\{year\}/g, String(new Date().getFullYear()))
    .replace(/\{seq\}/g, String(seq).padStart(5, '0'));
}
