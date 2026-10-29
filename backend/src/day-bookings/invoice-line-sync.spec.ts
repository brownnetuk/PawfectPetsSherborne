import { BookedSide, syncBookedLines, TravelContext } from './invoice-line-sync.util';

const walk30 = { name: '30 Minute Walk', price: 12 };
const walk60 = { name: '60 Minute Walk', price: 20 };
const visit = { name: '1 x Visit', price: 15 };
const twoVisits = { name: '2 x Visit', price: 28 };
const travelProduct = { name: 'Travel', price: 3 };
const travel: TravelContext = {
  product: travelProduct,
  visitCountByName: new Map([
    [visit.name, 1],
    [twoVisits.name, 2],
  ]),
};

const line = (p: { name: string; price: number }, quantity: number, discountPercent = 0) => ({
  description: p.name,
  quantity,
  unitPrice: p.price,
  discountPercent,
});
const walk = (product: { name: string; price: number }, quantity = 1): BookedSide => ({ product, quantity, visitCount: null });
const visits = (product: { name: string; price: number }, count: 1 | 2, quantity = 1): BookedSide => ({
  product,
  quantity,
  visitCount: count,
});

describe('syncBookedLines', () => {
  it('moves one walk from the 30 minute line onto a new 60 minute line at its price', () => {
    expect(syncBookedLines([line(walk30, 4)], walk(walk30), walk(walk60), null)).toEqual([
      line(walk30, 3),
      line(walk60, 1),
    ]);
  });

  it('adds onto an existing 60 minute line and drops the emptied 30 minute one', () => {
    expect(syncBookedLines([line(walk30, 1), line(walk60, 2)], walk(walk30), walk(walk60), null)).toEqual([
      line(walk60, 3),
    ]);
  });

  it('keeps a replaced line in the same place and carries its discount', () => {
    expect(
      syncBookedLines([line(visit, 2), line(walk30, 1, 10), line(travelProduct, 2)], walk(walk30), walk(walk60), travel),
    ).toEqual([line(visit, 2), line(walk60, 1, 10), line(travelProduct, 2)]);
  });

  it('takes a deleted booking off its line', () => {
    expect(syncBookedLines([line(walk30, 3)], walk(walk30), null, null)).toEqual([line(walk30, 2)]);
  });

  it('applies a quantity change on the same product', () => {
    expect(syncBookedLines([line(walk30, 3)], walk(walk30, 1), walk(walk30, 2), null)).toEqual([line(walk30, 4)]);
  });

  it('leaves the invoice alone when it has no matching line', () => {
    expect(syncBookedLines([line(walk60, 3)], walk(walk30), walk(walk60), null)).toBeNull();
  });

  it('leaves walk-only travel alone when walk travel was not ticked', () => {
    // 2 visits -> 2 travel: no walk travel on this invoice.
    const lines = [line(visit, 2), line(walk30, 1), line(travelProduct, 2)];
    expect(syncBookedLines(lines, walk(walk30), null, travel)).toEqual([line(visit, 2), line(travelProduct, 2)]);
  });

  it('takes walk travel off with the walk when walk travel was ticked', () => {
    // 2 visits + 1 walk -> 3 travel.
    const lines = [line(visit, 2), line(walk30, 1), line(travelProduct, 3)];
    expect(syncBookedLines(lines, walk(walk30), null, travel)).toEqual([line(visit, 2), line(travelProduct, 2)]);
  });

  it('keeps walk travel the same when only the walk length changes', () => {
    const lines = [line(walk30, 2), line(travelProduct, 2)];
    expect(syncBookedLines(lines, walk(walk30), walk(walk60), travel)).toEqual([
      line(walk30, 1),
      line(walk60, 1),
      line(travelProduct, 2),
    ]);
  });

  it('recounts visit travel when 1 x Visit becomes 2 x Visit', () => {
    const lines = [line(visit, 3), line(travelProduct, 3)];
    expect(syncBookedLines(lines, visits(visit, 1), visits(twoVisits, 2), travel)).toEqual([
      line(visit, 2),
      line(twoVisits, 1),
      line(travelProduct, 4),
    ]);
  });

  it('removes the travel line once no travel is left', () => {
    const lines = [line(visit, 1), line(travelProduct, 1)];
    expect(syncBookedLines(lines, visits(visit, 1), null, travel)).toEqual([]);
  });

  it('adds visit travel when a walk becomes a visit on an invoice with none', () => {
    expect(syncBookedLines([line(walk30, 1)], walk(walk30), visits(visit, 1), travel)).toEqual([
      line(visit, 1),
      line(travelProduct, 1),
    ]);
  });

  it('never adds travel for day care or boarding', () => {
    const dayCare = { name: 'Day Care - Full Day', price: 30 };
    const halfDay = { name: 'Day Care - Half Day', price: 18 };
    const side = (p: typeof dayCare): BookedSide => ({ product: p, quantity: 1, visitCount: 0 });
    expect(syncBookedLines([line(dayCare, 1)], side(dayCare), side(halfDay), travel)).toEqual([line(halfDay, 1)]);
  });
});
