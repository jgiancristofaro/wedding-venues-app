import { AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, CircleDot, Info } from 'lucide-react';
import { useState } from 'react';
import { CATEGORY_LABEL, CONFIDENCE_LABEL, type Confidence, type Estimate, type LineCategory } from '../lib/pricing';
import { cx, money, range, shortDate } from '../lib/format';
import { Modal } from './ui';

export const CAT_COLORS: Record<LineCategory, string> = {
  rental: '#34483C',
  fnb: '#B58A52',
  addons: '#8E9C7D',
  service: '#C98F7E',
  tax: '#A7A0B8',
};
// patterns so the chart doesn't rely on color alone
export const CAT_PATTERN: Record<LineCategory, string> = {
  rental: 'none',
  fnb: 'repeating-linear-gradient(45deg, rgba(255,255,255,.22) 0 2px, transparent 2px 6px)',
  addons: 'radial-gradient(rgba(255,255,255,.35) 1px, transparent 1.5px) 0 0/5px 5px',
  service: 'repeating-linear-gradient(-45deg, rgba(255,255,255,.25) 0 2px, transparent 2px 6px)',
  tax: 'repeating-linear-gradient(90deg, rgba(255,255,255,.25) 0 1px, transparent 1px 5px)',
};

const CONF_STYLE: Record<Confidence, { cls: string; Icon: typeof CheckCircle2; hint: string }> = {
  complete: { cls: 'text-ok border-ok/30 bg-ok/10', Icon: CheckCircle2, hint: 'All pricing pieces are on file' },
  partial: { cls: 'text-warn border-warn/30 bg-warn/10', Icon: CircleDot, hint: 'Some pieces are assumed' },
  rough: { cls: 'text-bad border-bad/30 bg-bad/10', Icon: CircleDashed, hint: 'Major pieces are estimated' },
  unknown: { cls: 'text-muted border-line bg-sunken', Icon: CircleHelp, hint: 'No pricing on file' },
};

export function ConfidenceBadge({ c, small }: { c: Confidence; small?: boolean }) {
  const s = CONF_STYLE[c];
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full border font-medium', s.cls, small ? 'text-[11px] px-2 h-6' : 'text-xs px-2.5 h-7')}
      title={`${CONFIDENCE_LABEL[c]} pricing — ${s.hint}`}
    >
      <s.Icon size={small ? 12 : 14} aria-hidden />
      {CONFIDENCE_LABEL[c]}
    </span>
  );
}

export function StackedBar({ e, height = 12, showLegend = true }: { e: Estimate; height?: number; showLegend?: boolean }) {
  const total = e.total ?? 0;
  const cats = (Object.keys(e.byCategory) as LineCategory[]).filter((c) => e.byCategory[c] > 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-sunken" style={{ height }} role="img" aria-label={cats.map((c) => `${CATEGORY_LABEL[c]} ${money(e.byCategory[c])}`).join(', ')}>
        {cats.map((c) => (
          <div key={c} style={{ width: `${(e.byCategory[c] / total) * 100}%`, background: `${CAT_PATTERN[c] === 'none' ? '' : CAT_PATTERN[c] + ','}${CAT_COLORS[c]}` }} title={`${CATEGORY_LABEL[c]}: ${money(e.byCategory[c])}`} />
        ))}
      </div>
      {showLegend && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          {cats.map((c) => (
            <li key={c} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `${CAT_PATTERN[c] === 'none' ? '' : CAT_PATTERN[c] + ','}${CAT_COLORS[c]}` }} aria-hidden />
              {CATEGORY_LABEL[c]} <span className="text-ink tabular-nums">{money(e.byCategory[c], { compact: true })}</span> · {Math.round((e.byCategory[c] / total) * 100)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Breakdown({ e, pricingAsOf }: { e: Estimate; pricingAsOf?: string }) {
  if (e.confidence === 'unknown') {
    return <p className="text-sm text-muted">{e.missing[0]}</p>;
  }
  return (
    <div className="space-y-5">
      <StackedBar e={e} />
      <table className="w-full text-sm">
        <caption className="sr-only">Cost breakdown</caption>
        <tbody>
          {e.lines.map((l) => (
            <tr key={l.key + l.label} className="border-b border-line/70 last:border-0 align-top">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: CAT_COLORS[l.category] }} aria-hidden />
                  <span>{l.label}</span>
                  {l.estimated && <span className="text-[10px] uppercase tracking-wider text-warn border border-warn/40 rounded px-1">est.</span>}
                </div>
                {l.detail && <div className="text-xs text-muted ml-[18px]">{l.detail}</div>}
              </td>
              <td className="py-2 text-right tabular-nums whitespace-nowrap">{money(l.amount)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="pt-3">Estimated all-in total</td>
            <td className="pt-3 text-right tabular-nums">{money(e.total)}</td>
          </tr>
          {range(e.low, e.high) && (
            <tr className="text-muted text-xs">
              <td>Likely range</td>
              <td className="text-right tabular-nums">{range(e.low, e.high)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {(e.assumptions.length > 0 || e.missing.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {e.assumptions.length > 0 && (
            <div>
              <div className="label mb-2 flex items-center gap-1.5">
                <Info size={13} /> Assumptions
              </div>
              <ul className="text-sm space-y-1 text-muted list-disc pl-5">
                {e.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {e.missing.length > 0 && (
            <div>
              <div className="label mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Missing or estimated
              </div>
              <ul className="text-sm space-y-1 text-muted list-disc pl-5">
                {e.missing.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {pricingAsOf && <p className="text-xs text-muted">Pricing as of {shortDate(pricingAsOf)}{e.stale ? ' — may be outdated' : ''}.</p>}
    </div>
  );
}

/** Total + per-guest with a "How we got this" affordance. */
export function PriceSummary({
  e,
  name,
  pricingAsOf,
  size = 'md',
}: {
  e: Estimate;
  name: string;
  pricingAsOf?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const r = range(e.low, e.high);
  return (
    <>
      <button
        type="button"
        onClick={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setOpen(true);
        }}
        className="text-left group/price rounded-lg -m-1 p-1 hover:bg-sunken/70 transition"
        aria-label={e.total == null ? `${name}: pricing unknown. How we got this` : `${name}: estimated total ${money(e.total)}, ${money(e.perGuest)} per guest. How we got this`}
      >
        {e.total == null ? (
          <span className={cx('text-muted', size === 'lg' ? 'text-2xl font-serif' : 'text-sm')}>Price on request</span>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cx('font-semibold tabular-nums', size === 'lg' ? 'text-3xl font-serif font-normal' : size === 'md' ? 'text-[17px]' : 'text-sm')}>
              {size === 'sm' ? money(e.total, { compact: true }) : money(e.total)}
            </span>
            <span className="text-sm text-muted tabular-nums">{money(e.perGuest)}/guest</span>
          </span>
        )}
        <span className="block text-[11px] text-muted underline decoration-dotted underline-offset-2 group-hover/price:text-ink">
          {r ? `Range ${r} · ` : ''}How we got this
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={<>How we got this <span className="text-muted text-base font-sans">· {name}</span></>}>
        <div className="flex items-center gap-2 mb-4">
          <ConfidenceBadge c={e.confidence} />
          {e.stale && <span className="text-xs text-warn">Pricing may be outdated</span>}
        </div>
        <Breakdown e={e} pricingAsOf={pricingAsOf} />
      </Modal>
    </>
  );
}
