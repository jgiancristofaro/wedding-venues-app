import { Camera, Loader2 } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/format';

export function DropZone({
  accept,
  onFiles,
  busy,
  icon,
  title,
  subtitle,
  multiple,
  camera,
}: {
  accept: string;
  onFiles: (f: File[]) => void;
  busy?: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  multiple?: boolean;
  camera?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) onFiles(files);
      }}
      className={cx('rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center transition', over ? 'border-gold bg-gold/10 scale-[1.01]' : 'border-line bg-surface')}
    >
      <div className="text-gold mb-3 flex justify-center">{busy ? <Loader2 size={32} className="animate-spin" /> : icon}</div>
      <p className="font-serif text-2xl mb-1">{title}</p>
      <p className="text-sm text-muted max-w-md mx-auto mb-5">{subtitle}</p>
      <div className="flex flex-wrap gap-2 justify-center">
        <button type="button" className="btn-primary" onClick={() => input.current?.click()} disabled={busy}>
          Choose file{multiple ? 's' : ''}
        </button>
        {camera && (
          <button type="button" className="btn-secondary" onClick={() => cam.current?.click()} disabled={busy}>
            <Camera size={16} /> Take a photo
          </button>
        )}
      </div>
      <input
        id={id}
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        aria-label={title}
        data-testid="file-input"
        onChange={(e) => {
          const f = [...(e.target.files ?? [])];
          if (f.length) onFiles(f);
          e.target.value = '';
        }}
      />
      {camera && (
        <input
          ref={cam}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Take a photo of a brochure"
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            if (f.length) onFiles(f);
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}
