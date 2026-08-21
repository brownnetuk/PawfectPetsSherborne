// Shared by InvoicesService and QuotesService to turn a staff-editable
// template (e.g. "INV-{year}-{seq}") plus the next sequence number into an
// actual invoice/quote number -- {seq} is always zero-padded to 5 digits so
// numbers sort and align the same way regardless of how large the count gets.
export function formatDocumentNumber(template: string, seq: number): string {
  return template
    .replace(/\{year\}/g, String(new Date().getFullYear()))
    .replace(/\{seq\}/g, String(seq).padStart(5, '0'));
}

interface CounterModel {
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>,
  ): { exec(): Promise<Record<string, unknown> | null> };
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): { exec(): Promise<unknown> };
}

// Atomically reads-and-increments a numeric counter field (e.g.
// `invoiceNextNumber`) on a singleton document, returning the value this
// call should use; the stored value is left one higher, ready for the next
// caller. Plain `$inc` on a field that has never been set treats it as
// starting from 0 (MongoDB's own semantics), one lower than this app's
// counters, which are meant to start at 1 -- left uncorrected, the first two
// calls on a truly virgin field return the same number. This only bites the
// very first call a counter ever receives, which is why it went unnoticed
// for invoiceNextNumber/quoteNextNumber (both got an explicit real value
// early on, e.g. via a Settings edit, before the bug could surface) and only
// showed up once paymentNextNumber -- a brand new field -- was added.
export async function nextSequenceNumber(model: CounterModel, field: string): Promise<number> {
  const before = await model.findOneAndUpdate({}, { $inc: { [field]: 1 } }, { upsert: true, new: false }).exec();
  const existing = before?.[field] as number | undefined | null;
  if (existing === undefined || existing === null) {
    await model.updateOne({}, { $set: { [field]: 2 } }).exec();
    return 1;
  }
  return existing;
}
