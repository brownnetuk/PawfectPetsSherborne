import { Types } from 'mongoose';
import { overridePrice } from './pricing-override.util';

describe('overridePrice', () => {
  const walk = new Types.ObjectId();
  const visit = new Types.ObjectId();

  it('uses the customer override for a matching product', () => {
    expect(overridePrice([{ product: walk, price: 12.5 }], String(walk), 15)).toBe(12.5);
    expect(overridePrice([{ product: String(walk), price: 0 }], { _id: walk }, 15)).toBe(0);
  });

  it('falls back to the standard price otherwise', () => {
    expect(overridePrice([{ product: walk, price: 12.5 }], visit, 20)).toBe(20);
    expect(overridePrice(undefined, walk, 20)).toBe(20);
    expect(overridePrice([], walk, 20)).toBe(20);
  });
});
