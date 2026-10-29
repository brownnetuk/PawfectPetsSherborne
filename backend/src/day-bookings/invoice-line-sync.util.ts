// Keeps an unsent invoice's Item Table in step with a booking that's already
// on it. Invoices hold plain copied lines (product name, quantity, price --
// see the admin's Generate Invoice), not links back to the bookings, so a
// booking change is replayed onto the lines by product name: take the old
// product's quantity off its line and put the new product's on. Travel is
// recounted the same way the generators count it (admin
// utils/travelLines.ts): one per Visit (two per 2 x Visit), plus one per Walk
// only if this invoice was generated with walk travel ticked.

export interface SyncLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

export interface SyncProduct {
  name: string;
  price: number;
}

// One side of a booking change: what was (or now is) booked on the row.
// `visitCount` is 1 or 2 for a Visits-mapping product, null for a Walk, and
// 0 for anything that never carries travel (Day Care, Boarding).
export interface BookedSide {
  product: SyncProduct;
  quantity: number;
  visitCount: number | null;
}

export interface TravelContext {
  product: SyncProduct;
  // How many visits each line's product counts for, by line description --
  // for working out whether the travel line also covers Walks.
  visitCountByName: Map<string, number>;
}

function travelUnits(side: BookedSide | null): { visits: number; walks: number } {
  if (!side || side.visitCount === 0) return { visits: 0, walks: 0 };
  if (side.visitCount) return { visits: side.quantity * side.visitCount, walks: 0 };
  return { visits: 0, walks: side.quantity };
}

function addToLine(lines: SyncLine[], product: SyncProduct, quantity: number, at: number, discountPercent = 0): SyncLine[] {
  if (quantity <= 0) return lines;
  const idx = lines.findIndex((l) => l.description === product.name);
  if (idx >= 0) return lines.map((l, i) => (i === idx ? { ...l, quantity: l.quantity + quantity } : l));
  const added = { description: product.name, quantity, unitPrice: product.price, discountPercent };
  return [...lines.slice(0, at), added, ...lines.slice(at)];
}

// Returns the updated lines, or null when the invoice can't be matched to
// the booking (no line for the old product, or fewer on it than the booking
// had -- e.g. it was edited by hand), in which case it's left alone.
// `to` null means the booking was deleted.
export function syncBookedLines(
  lines: SyncLine[],
  from: BookedSide,
  to: BookedSide | null,
  travel: TravelContext | null,
): SyncLine[] | null {
  const fromIdx = lines.findIndex((l) => l.description === from.product.name);
  if (fromIdx < 0 || lines[fromIdx].quantity < from.quantity) return null;

  // Read before any change: does the travel line cover more than its Visits?
  const travelBefore = travel ? (lines.find((l) => l.description === travel.product.name)?.quantity ?? 0) : 0;
  const visitTravelBefore = travel
    ? lines.reduce((sum, l) => sum + l.quantity * (travel.visitCountByName.get(l.description) ?? 0), 0)
    : 0;
  const hasWalkTravel = travelBefore > visitTravelBefore;

  const fromLine = lines[fromIdx];
  let next: SyncLine[] = lines.map((l, i) => (i === fromIdx ? { ...l, quantity: l.quantity - from.quantity } : l));
  if (to) next = addToLine(next, to.product, to.quantity, fromIdx + 1, fromLine.discountPercent ?? 0);
  // addToLine only ever inserts after fromIdx, so it still points at the old
  // product's line -- dropped once nothing's left on it.
  next = next.filter((l, i) => i !== fromIdx || l.quantity > 0);

  if (travel && travelBefore > 0) {
    const before = travelUnits(from);
    const after = travelUnits(to);
    const delta = after.visits - before.visits + (hasWalkTravel ? after.walks - before.walks : 0);
    if (delta !== 0) {
      const travelQty = Math.max(0, travelBefore + delta);
      next = next
        .map((l) => (l.description === travel.product.name ? { ...l, quantity: travelQty } : l))
        .filter((l) => l.description !== travel.product.name || l.quantity > 0);
    }
  } else if (travel) {
    // No travel on the invoice yet: only Visits add it (Walk travel is
    // opt-in at generation, so it isn't started here).
    const delta = travelUnits(to).visits - travelUnits(from).visits;
    if (delta > 0) next = addToLine(next, travel.product, delta, next.length);
  }
  return next;
}
