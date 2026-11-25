import { ImagePlus, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '../../backend';
import { FieldRow } from '../../components/FieldRow';
import { PricingEditor } from '../../components/PricingEditor';
import { FIELD_DEFS, SECTIONS } from '../../domain/fields';
import type { GlobalVenue, Photo, SourceInfo, VenueFields } from '../../domain/types';
import { blankUserVenue } from '../../domain/venues';
import type { PricingRules } from '../../lib/pricing';
import { useApp } from '../../store/app';

async function shrink(file: File, max = 1000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ManualAdd({ target, provenance }: { target: 'mine' | 'global'; provenance?: SourceInfo }) {
  const user = useApp((s) => s.user);
  const s = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loc, setLoc] = useState('');
  const [full, setFull] = useState(false);
  const [fields, setFields] = useState<VenueFields>({ name: '' });
  const [pricing, setPricing] = useState<PricingRules>({ currency: 'USD', components: [] });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!user || !name.trim()) return;
    setBusy(true);
    const f: VenueFields = { ...fields, name: name.trim(), area: fields.area ?? (loc.split(',')[0]?.trim() || undefined), address: fields.address ?? (loc || undefined), photos };
    if (loc || f.address) {
      try {
        const r = await backend.geocode(loc || f.address!);
        if (r) {
          f.lat = r.lat;
          f.lng = r.lng;
        } else s.toast({ text: 'We couldn’t find that location on the map. You can fix the address later.' });
      } catch {
        s.toast({ text: 'Location lookup is unavailable right now — saved without map coordinates.' });
      }
    }
    try {
      if (target === 'global') {
        const g: GlobalVenue = { id: crypto.randomUUID(), fields: f, pricing, provenance: provenance!, isSample: false, published: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await backend.saveGlobal(g);
        await s.reloadGlobals();
        navigate('/admin');
        return;
      }
      const v = blankUserVenue(user.id, f);
      v.pricing = pricing;
      const now = new Date().toISOString();
      for (const k of Object.keys(f)) if ((f as unknown as Record<string, unknown>)[k] != null) (v.provenance as Record<string, unknown>)[k] = { source: 'manual', detail: 'You entered', at: now };
      if (f.lat != null) v.provenance.lat = { source: 'geocoder', detail: `Located from “${loc || f.address}”`, at: now };
      await s.saveVenue(v);
      s.toast({ text: `Added ${f.name}`, tone: 'success' });
      navigate(`/venue/u/${v.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5 space-y-4">
        <h2 className="text-2xl">Quick add</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Venue name
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Linden Barn" data-testid="manual-name" />
          </label>
          <label className="text-sm font-medium">
            Location
            <span className="relative block mt-1">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Town or full address" />
            </span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!name.trim() || busy} onClick={() => void create()} data-testid="manual-save">
            {busy ? 'Saving…' : 'Add venue'}
          </button>
          <button className="btn-ghost" onClick={() => setFull(!full)} aria-expanded={full}>
            {full ? 'Hide full form' : 'Fill in more details'}
          </button>
        </div>
      </div>
      {full && (
        <>
          <div className="card p-5">
            <h3 className="text-xl mb-2">Photos</h3>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <img key={i} src={p.url} alt="" className="h-20 w-28 rounded-lg object-cover" />
              ))}
              <label className="h-20 w-28 rounded-lg border-2 border-dashed border-line flex flex-col items-center justify-center text-xs text-muted cursor-pointer hover:border-ink/30">
                <ImagePlus size={18} /> Add photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])].slice(0, 6);
                    const urls = await Promise.all(files.map((f) => shrink(f)));
                    setPhotos([...photos, ...urls.map((url) => ({ url, source: 'upload' }))]);
                  }}
                />
              </label>
            </div>
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec.key} className="card px-4">
              <h3 className="text-lg pt-3">{sec.title}</h3>
              {FIELD_DEFS.filter((d) => d.section === sec.key && d.key !== 'name').map((d) => (
                <FieldRow key={d.key} def={d} value={fields[d.key]} editable onSave={(v) => setFields({ ...fields, [d.key]: v })} />
              ))}
            </div>
          ))}
          <div>
            <h3 className="text-xl mb-3">Pricing</h3>
            <PricingEditor value={pricing} onChange={setPricing} />
          </div>
        </>
      )}
    </div>
  );
}
