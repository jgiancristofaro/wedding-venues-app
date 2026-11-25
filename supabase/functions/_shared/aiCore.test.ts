import { describe, expect, it, vi } from 'vitest';
import { buildParseUser, envFlag, runWithRepair, validateEnrich, validateExtraction, type CallModel } from './aiCore';

const good = {
  fields: [{ field: 'capacitySeated', value: 180, confidence: 0.9, page: 1, snippet: 'seats up to 180' }],
  pricing: {
    components: [{ kind: 'per_person', name: 'Silver', rates: [{ amount: 165, when: { days: [6] } }] }],
    charges: { serviceChargePct: 22, taxPct: 8.875 },
  },
};

const reply = (obj: unknown) => ({ text: typeof obj === 'string' ? obj : JSON.stringify(obj), model: 'mock-model', inputTokens: 100, outputTokens: 50 });

describe('AI core (mocked model)', () => {
  it('accepts a valid extraction on the first try', async () => {
    const call: CallModel = vi.fn(async () => reply(good));
    const r = await runWithRepair(call, { system: 's', user: 'u', schema: {} }, validateExtraction);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 50, model: 'mock-model' });
  });

  it('repairs once after a schema violation, passing errors back', async () => {
    const bad = { ...good, pricing: { components: [{ kind: 'per_person', rates: [{ amount: 'lots' }] }] } };
    const call = vi.fn<CallModel>().mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(good));
    const r = await runWithRepair(call, { system: 's', user: 'u', schema: {} }, validateExtraction);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(call.mock.calls[1][0].repairOf?.errors.join(' ')).toMatch(/amount: expected number/);
  });

  it('gives up after one failed repair', async () => {
    const call = vi.fn<CallModel>().mockResolvedValue(reply('not json at all'));
    const r = await runWithRepair(call, { system: 's', user: 'u', schema: {} }, validateExtraction);
    expect(r.ok).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('accepts fenced JSON', async () => {
    const call: CallModel = async () => reply('```json\n' + JSON.stringify(good) + '\n```');
    expect((await runWithRepair(call, { system: 's', user: 'u', schema: {} }, validateExtraction)).ok).toBe(true);
  });

  it('rejects unknown fields and unexpected properties', () => {
    expect(validateExtraction({ ...good, fields: [{ field: 'ssn', value: 'x', confidence: 0.5 }] }).ok).toBe(false);
    expect(validateExtraction({ ...good, extra: 1 }).ok).toBe(false);
    expect(validateExtraction({ fields: [], pricing: { components: [{ kind: 'mystery', rates: [] }] } }).ok).toBe(false);
  });

  it('enrichment proposals require public source URLs', () => {
    expect(validateEnrich({ proposals: [{ field: 'parking', value: 'Valet', confidence: 0.7, sourceUrl: 'https://venue.example/faq' }] }).ok).toBe(true);
    expect(validateEnrich({ proposals: [{ field: 'parking', value: 'Valet', confidence: 0.7, sourceUrl: 'file:///etc' }] }).ok).toBe(false);
    expect(validateEnrich({ proposals: [{ field: 'parking', value: 'x', confidence: 0.7, sourceUrl: 'https://a.b' }] }, new Set(['noiseCurfew'])).ok).toBe(false);
  });

  it('caps pages sent to the model', () => {
    const u = buildParseUser(['a', 'b', 'c'], 2, 'x.pdf');
    expect(u).toMatch(/truncated from 3/);
    expect(u).not.toMatch(/PAGE 3/);
  });

  it('flags default to off', () => {
    expect(envFlag(undefined)).toBe(false);
    expect(envFlag('')).toBe(false);
    expect(envFlag('true')).toBe(true);
  });
});
