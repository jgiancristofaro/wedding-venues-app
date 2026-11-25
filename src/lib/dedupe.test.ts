import { describe, expect, it } from 'vitest';
import { DUPLICATE_THRESHOLD, findDuplicates, jaroWinkler, normalizeName, similarity } from './dedupe';
import { milesBetween } from './geo';

describe('dedupe', () => {
  it('normalizes names', () => {
    expect(normalizeName('The Larkspur Rooms')).toBe('larkspur rooms');
    expect(normalizeName('Bramble & Bay')).toBe('bramble bay');
    expect(normalizeName('Café Lumière Weddings')).toBe('cafe lumiere');
  });
  it('jaro-winkler sanity', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 2);
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });
  it('treats "Larkspur Rooms" and "The Larkspur Rooms" as duplicates', () => {
    expect(similarity({ ref: 'a', name: 'Larkspur Rooms' }, { ref: 'b', name: 'The Larkspur Rooms' }).score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
  it('typos still match; different venues do not', () => {
    expect(similarity({ ref: 'a', name: 'Willowmere Farms' }, { ref: 'b', name: 'Willowmere Farm' }).score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    expect(similarity({ ref: 'a', name: 'Ironwood Foundry' }, { ref: 'b', name: 'Heron Hall' }).score).toBeLessThan(0.7);
  });
  it('location: same name far apart is penalized, nearby is boosted', () => {
    const far = similarity({ ref: 'a', name: 'Harbor House', lat: 40.7, lng: -74 }, { ref: 'b', name: 'Harbor House', lat: 41.3, lng: -72 });
    const near = similarity({ ref: 'a', name: 'Harbour House', lat: 40.7, lng: -74 }, { ref: 'b', name: 'Harbor House', lat: 40.701, lng: -74.001 });
    expect(far.score).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(near.score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
  it('same website is a duplicate regardless of name', () => {
    expect(similarity({ ref: 'a', name: 'X', website: 'https://www.foo.com/weddings' }, { ref: 'b', name: 'Y', website: 'foo.com' }).score).toBeGreaterThan(0.95);
  });
  it('findDuplicates ranks best first', () => {
    const pool = [
      { ref: 'g:1', name: 'Willowmere Farm' },
      { ref: 'g:2', name: 'Willow Creek Barn' },
      { ref: 'g:3', name: 'Something Else' },
    ];
    const m = findDuplicates({ ref: 'new', name: 'Willowmere Farm' }, pool);
    expect(m[0].ref).toBe('g:1');
    expect(m.find((x) => x.ref === 'g:3')).toBeUndefined();
  });
  it('miles between NYC and Hudson ≈ 110', () => {
    expect(milesBetween(40.7128, -74.006, 42.2529, -73.791)).toBeGreaterThan(100);
  });
});
