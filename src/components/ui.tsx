import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/format';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus trap, Esc to close, restores focus. On phones it renders as a bottom sheet. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  sheet = true,
  footer,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean | 'xl';
  sheet?: boolean;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first =
      el?.querySelector<HTMLElement>('[autofocus]') ??
      el?.querySelector<HTMLElement>(`.overflow-y-auto :is(${FOCUSABLE})`) ??
      el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const a = items[0];
        const b = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-rise" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? id : undefined)}
        className={cx(
          'relative bg-surface text-ink shadow-lift w-full max-h-[92vh] flex flex-col animate-rise',
          sheet ? 'rounded-t-3xl sm:rounded-3xl' : 'rounded-3xl m-4',
          wide === 'xl' ? 'sm:max-w-6xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
          'sm:m-6',
        )}
      >
        {sheet && <div className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" aria-hidden />}
        {title && (
          <div className="flex items-center justify-between gap-4 px-5 sm:px-6 pt-4 pb-2">
            <h2 id={id} className="text-xl font-medium">
              {title}
            </h2>
            <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 sm:px-6 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="border-t border-line px-5 sm:px-6 py-3 flex flex-wrap justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Tooltip({
  text,
  children,
  side = 'top',
}: {
  text: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}) {
  return (
    <span className="relative inline-flex group/tt">
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 w-max max-w-[16rem] rounded-lg bg-ink text-bg text-xs px-2.5 py-1.5 opacity-0 transition',
          'group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {text}
      </span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      {icon && <div className="mb-4 text-gold">{icon}</div>}
      <h2 className="text-2xl mb-2">{title}</h2>
      {children && <p className="text-muted max-w-md">{children}</p>}
      {action && <div className="mt-6 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none min-h-[44px]" htmlFor={id}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition', checked ? 'bg-accent' : 'bg-line')}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
      <span className="text-sm">{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-line bg-surface p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-[13px] transition',
            value === o.value ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
          )}
          title={o.label}
        >
          {o.icon}
          <span className={o.icon ? 'hidden md:inline' : ''}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
