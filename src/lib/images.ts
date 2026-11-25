/**
 * Procedurally generated, license-free editorial illustrations used as placeholder photography
 * for sample venues (and any venue without photos). Pure SVG, deterministic per venue.
 */
import type { Photo, VenueFields } from '../domain/types';

type Palette = { skyA: string; skyB: string; ground: string; ground2: string; ink: string; accent: string; glow: string; water: string };

const PALETTES: Palette[] = [
  { skyA: '#E8C7B8', skyB: '#F7EBDF', ground: '#8E9C7D', ground2: '#6F7E60', ink: '#3D3833', accent: '#C98F7E', glow: '#FFE8B8', water: '#A9B9BE' },
  { skyA: '#C9D8CF', skyB: '#F3F0E7', ground: '#7E8F69', ground2: '#5F7050', ink: '#33372F', accent: '#B9A27A', glow: '#FFF1C9', water: '#9DB4B8' },
  { skyA: '#F0BE8C', skyB: '#FAE5C9', ground: '#76805A', ground2: '#59633F', ink: '#3A2F27', accent: '#D08A5C', glow: '#FFE2A8', water: '#B7A893' },
  { skyA: '#D5DAE2', skyB: '#F5F2EC', ground: '#8C9488', ground2: '#6E766A', ink: '#2F3338', accent: '#A7A0B8', glow: '#FFF3D6', water: '#A6B3C2' },
  { skyA: '#E3CFD6', skyB: '#F8EFEA', ground: '#93977B', ground2: '#727759', ink: '#3B3236', accent: '#C4919E', glow: '#FFE7C4', water: '#B3B5C4' },
];
const NIGHT: Palette = { skyA: '#1F2840', skyB: '#5C5F7E', ground: '#283024', ground2: '#1B2119', ink: '#12141B', accent: '#E9C27D', glow: '#FFD98A', water: '#3C4A66' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const W = 800;
const H = 600;

function sky(p: Palette, id: string) {
  return `<defs><linearGradient id="s${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.skyA}"/><stop offset="1" stop-color="${p.skyB}"/></linearGradient>
<radialGradient id="g${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#s${id})"/>`;
}

function hills(p: Palette, r: () => number, y = 430) {
  const a = y - 40 - r() * 40;
  const b = y - 20 - r() * 50;
  return `<path d="M0 ${a} C 200 ${a - 60}, 380 ${b + 30}, 520 ${b} S 760 ${a - 30}, 800 ${a + 10} L800 600 L0 600Z" fill="${p.ground}" opacity=".55"/>
<path d="M0 ${y} C 220 ${y - 30}, 500 ${y + 20}, 800 ${y - 20} L800 600 L0 600Z" fill="${p.ground}"/>`;
}

function trees(p: Palette, r: () => number, y: number, count = 6) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const h = 40 + r() * 70;
    s += `<ellipse cx="${x}" cy="${y - h / 2}" rx="${h * 0.38}" ry="${h / 2}" fill="${p.ground2}" opacity="${0.7 + r() * 0.3}"/>`;
  }
  return s;
}

function windowsGrid(x: number, y: number, w: number, h: number, cols: number, rows: number, color: string, op = 0.85) {
  let s = '';
  const gw = w / cols;
  const gh = h / rows;
  for (let c = 0; c < cols; c++)
    for (let rr = 0; rr < rows; rr++)
      s += `<rect x="${x + c * gw + gw * 0.18}" y="${y + rr * gh + gh * 0.15}" width="${gw * 0.64}" height="${gh * 0.7}" rx="2" fill="${color}" opacity="${op}"/>`;
  return s;
}

function building(kind: string, p: Palette, r: () => number, night: boolean) {
  const win = night ? p.glow : '#F7F1E6';
  const k = kind.toLowerCase();
  if (/barn|lodge|saltbox|mill|orchard|farm/.test(k)) {
    return `<g transform="translate(250 230)"><path d="M0 200 L0 90 L40 30 L150 0 L260 30 L300 90 L300 200Z" fill="${p.accent}"/>
<path d="M0 90 L40 30 L150 0 L260 30 L300 90" fill="none" stroke="${p.ink}" stroke-width="6"/>
<rect x="110" y="100" width="80" height="100" fill="${p.ink}" opacity=".85"/><path d="M110 100 L190 200 M190 100 L110 200" stroke="${win}" stroke-width="4" opacity=".6"/>
<rect x="135" y="40" width="30" height="34" fill="${win}" opacity=".9"/></g>`;
  }
  if (/ballroom|estate|mansion|manor|club|hotel|hall|inn|library|university|house/.test(k)) {
    const cols = 6;
    let colsSvg = '';
    for (let i = 0; i < cols; i++) colsSvg += `<rect x="${215 + i * 70}" y="290" width="14" height="140" fill="#F2ECE2"/>`;
    return `<rect x="170" y="250" width="460" height="190" fill="#E9E1D3"/><path d="M160 255 L400 170 L640 255Z" fill="#DCD2C1" stroke="${p.ink}" stroke-opacity=".25"/>
${windowsGrid(185, 300, 430, 120, 7, 2, win, night ? 0.95 : 0.55)}${colsSvg}<rect x="370" y="360" width="60" height="80" rx="30" fill="${p.ink}" opacity=".7"/>
<rect x="150" y="436" width="500" height="14" fill="#D8CEBD"/>`;
  }
  if (/greenhouse|conservatory|glass/.test(k)) {
    let ribs = '';
    for (let i = 0; i <= 8; i++) ribs += `<path d="M${260 + i * 35} 440 L${260 + i * 35} 330" stroke="#fff" stroke-width="3" opacity=".8"/>`;
    return `<path d="M240 440 L240 330 Q400 160 560 330 L560 440Z" fill="${night ? p.glow : '#DCE8E0'}" opacity=".8" stroke="#fff" stroke-width="5"/>${ribs}
<path d="M240 330 Q400 160 560 330" fill="none" stroke="#fff" stroke-width="5"/><ellipse cx="400" cy="420" rx="120" ry="30" fill="${p.ground2}" opacity=".6"/>`;
  }
  if (/rooftop|loft|industrial|warehouse|foundry/.test(k)) {
    let sky = '';
    let x = 0;
    while (x < W) {
      const w = 40 + r() * 70;
      const h = 120 + r() * 220;
      sky += `<rect x="${x}" y="${430 - h}" width="${w}" height="${h}" fill="${p.ink}" opacity="${0.25 + r() * 0.25}"/>`;
      if (night) sky += windowsGrid(x + 4, 440 - h, w - 8, h - 30, 3, Math.floor(h / 30), p.glow, 0.35);
      x += w + 6;
    }
    return `${sky}<rect x="0" y="430" width="${W}" height="170" fill="${p.ink}" opacity=".85"/>
${windowsGrid(40, 450, 720, 60, 12, 1, win, night ? 0.9 : 0.5)}<path d="M0 520 L800 520" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>`;
  }
  if (/restaurant|townhouse|carriage/.test(k)) {
    return `<rect x="230" y="190" width="340" height="260" fill="#9C5E48"/>${windowsGrid(250, 210, 300, 160, 3, 3, win, night ? 0.95 : 0.6)}
<rect x="365" y="370" width="70" height="80" fill="${p.ink}"/><path d="M200 190 L600 190" stroke="${p.ink}" stroke-width="10"/>
<path d="M330 450 L470 450 L490 470 L310 470Z" fill="#B8A894"/>`;
  }
  // waterfront / pavilion / beach / boathouse / vineyard default
  return `<rect x="250" y="300" width="300" height="120" fill="#F2EDE4"/><path d="M230 305 L400 230 L570 305Z" fill="${p.accent}"/>
${windowsGrid(265, 320, 270, 80, 6, 1, win, night ? 0.95 : 0.6)}<rect x="230" y="418" width="340" height="10" fill="${p.ink}" opacity=".5"/>`;
}

function water(p: Palette, r: () => number) {
  let s = `<rect x="0" y="440" width="${W}" height="160" fill="${p.water}"/>`;
  for (let i = 0; i < 14; i++) {
    const y = 450 + r() * 140;
    const x = r() * W;
    s += `<path d="M${x} ${y} h${30 + r() * 80}" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>`;
  }
  return s;
}

function vines(p: Palette) {
  let s = '';
  for (let i = 0; i < 9; i++) {
    const y = 450 + i * 18;
    s += `<path d="M0 ${y} Q 400 ${y - 30 + i * 3} 800 ${y}" stroke="${p.ground2}" stroke-width="${3 + i}" fill="none" opacity=".8" stroke-dasharray="${4 + i} ${6 + i}"/>`;
  }
  return s;
}

function sun(p: Palette, r: () => number, night: boolean, id: string) {
  const x = 120 + r() * 560;
  const y = 120 + r() * 80;
  if (night) {
    let stars = '';
    for (let i = 0; i < 40; i++) stars += `<circle cx="${r() * W}" cy="${r() * 260}" r="${r() * 1.6 + 0.4}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
    return stars + `<circle cx="${x}" cy="${y - 40}" r="26" fill="#F6EED9" opacity=".9"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="160" fill="url(#g${id})"/><circle cx="${x}" cy="${y}" r="42" fill="${p.glow}" opacity=".9"/>`;
}

function exterior(fields: VenueFields, p: Palette, r: () => number, night: boolean, id: string) {
  const type = `${fields.venueType ?? ''} ${(fields.styleTags ?? []).join(' ')}`.toLowerCase();
  const watery = /waterfront|beach|boathouse|pier|harbor|lake/.test(type);
  const vineyard = /vineyard/.test(type);
  return (
    sky(p, id) +
    sun(p, r, night, id) +
    hills(p, r) +
    (watery ? water(p, r) : '') +
    trees(p, r, 440, 5) +
    building(type, p, r, night) +
    (vineyard ? vines(p) : '') +
    (!watery ? `<rect x="0" y="470" width="${W}" height="130" fill="${p.ground2}" opacity=".35"/>` : '')
  );
}

function ceremony(p: Palette, r: () => number, id: string) {
  let chairs = '';
  for (let row = 0; row < 6; row++) {
    const y = 600 - row * 28;
    const spread = 340 - row * 40;
    for (let c = 0; c < 4; c++) {
      const off = 40 + c * ((spread - 60) / 4);
      chairs += `<rect x="${400 - 30 - off - 18}" y="${y - 30}" width="${22 - row * 2}" height="${26 - row * 2}" rx="3" fill="#F6F1E8" stroke="${p.ink}" stroke-opacity=".25"/>`;
      chairs += `<rect x="${400 + 30 + off}" y="${y - 30}" width="${22 - row * 2}" height="${26 - row * 2}" rx="3" fill="#F6F1E8" stroke="${p.ink}" stroke-opacity=".25"/>`;
    }
  }
  let flowers = '';
  for (let i = 0; i < 46; i++) {
    const t = Math.PI * (i / 45);
    const x = 400 - Math.cos(t) * 130 + (r() - 0.5) * 24;
    const y = 400 - Math.sin(t) * 190 + (r() - 0.5) * 24;
    flowers += `<circle cx="${x}" cy="${y}" r="${8 + r() * 12}" fill="${i % 3 ? p.accent : '#F7EEE6'}" opacity="${0.7 + r() * 0.3}"/>`;
  }
  return `${sky(p, id)}${sun(p, r, false, id)}${hills(p, r, 400)}${trees(p, r, 400, 7)}
<path d="M370 600 L392 400 L408 400 L430 600Z" fill="#F4EEE4" opacity=".9"/>
<path d="M270 400 L270 220 Q400 120 530 220 L530 400" fill="none" stroke="${p.ink}" stroke-opacity=".5" stroke-width="5"/>${flowers}${chairs}`;
}

function reception(p: Palette) {
  let lights = '';
  for (let k = 0; k < 4; k++) {
    const y0 = 60 + k * 45;
    lights += `<path d="M0 ${y0} Q 400 ${y0 + 90} 800 ${y0}" stroke="${p.ink}" stroke-opacity=".35" fill="none"/>`;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = t * 800;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + 90) + t * t * y0;
      lights += `<circle cx="${x}" cy="${y + 6}" r="5" fill="${p.glow}"/><circle cx="${x}" cy="${y + 6}" r="14" fill="${p.glow}" opacity=".25"/>`;
    }
  }
  let tables = '';
  for (let t = 0; t < 3; t++) {
    const cx = 160 + t * 240;
    tables += `<path d="M${cx - 30} 330 L${cx + 30} 330 L${cx + 110} 600 L${cx - 110} 600Z" fill="#F7F2EA"/>`;
    for (let i = 0; i < 6; i++) {
      const y = 350 + i * 42;
      const w = 34 + i * 14;
      tables += `<circle cx="${cx - w / 2}" cy="${y}" r="${4 + i}" fill="${p.accent}" opacity=".8"/><circle cx="${cx + w / 2}" cy="${y}" r="${4 + i}" fill="${p.accent}" opacity=".8"/>`;
      tables += `<rect x="${cx - 2}" y="${y - 12 - i * 2}" width="4" height="${12 + i * 2}" fill="${p.glow}"/>`;
    }
  }
  return `<rect width="${W}" height="${H}" fill="${p.ink}"/><rect width="${W}" height="${H}" fill="${p.accent}" opacity=".18"/>${lights}${tables}`;
}

function detail(p: Palette, r: () => number) {
  let fl = '';
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = 120 + r() * 120;
    fl += `<circle cx="${400 + Math.cos(a) * d * 1.6}" cy="${80 + Math.sin(a) * d * 0.4}" r="${10 + r() * 22}" fill="${i % 4 ? p.accent : p.ground}" opacity="${0.6 + r() * 0.4}"/>`;
  }
  return `<rect width="${W}" height="${H}" fill="#EEE7DC"/><rect width="${W}" height="${H}" fill="${p.skyA}" opacity=".35"/>
${fl}<circle cx="400" cy="360" r="150" fill="#FBF8F2" stroke="${p.ink}" stroke-opacity=".15" stroke-width="2"/><circle cx="400" cy="360" r="110" fill="#fff" stroke="${p.accent}" stroke-opacity=".6" stroke-width="3"/>
<rect x="210" y="250" width="10" height="220" rx="5" fill="#C9B79A"/><rect x="580" y="250" width="10" height="220" rx="5" fill="#C9B79A"/>
<circle cx="610" cy="210" r="32" fill="none" stroke="${p.ink}" stroke-opacity=".25" stroke-width="3"/><circle cx="660" cy="250" r="26" fill="none" stroke="${p.ink}" stroke-opacity=".25" stroke-width="3"/>
<rect x="355" y="345" width="90" height="30" rx="4" fill="${p.ground}" opacity=".7"/>`;
}

function toDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${svg}</svg>`,
  )}`;
}

const cache = new Map<string, Photo[]>();

/** Deterministic set of 5 illustrated placeholder photos for a venue. */
export function generatedPhotos(seedKey: string, fields: VenueFields): Photo[] {
  const key = seedKey + '|' + (fields.venueType ?? '') + (fields.styleTags ?? []).join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(key);
  const p = PALETTES[h % PALETTES.length];
  const r = rng(h);
  const id = (h % 100000).toString(36);
  const photos: Photo[] = [
    { url: toDataUri(exterior(fields, p, r, false, id + 'a')), caption: 'Exterior (illustration)', source: 'generated' },
    { url: toDataUri(ceremony(p, r, id + 'b')), caption: 'Ceremony (illustration)', source: 'generated' },
    { url: toDataUri(reception(p)), caption: 'Reception (illustration)', source: 'generated' },
    { url: toDataUri(detail(p, r)), caption: 'Table detail (illustration)', source: 'generated' },
    { url: toDataUri(exterior(fields, NIGHT, rng(h + 7), true, id + 'd')), caption: 'Evening (illustration)', source: 'generated' },
  ];
  cache.set(key, photos);
  return photos;
}

export function venuePhotos(seedKey: string, fields: VenueFields): Photo[] {
  return fields.photos?.length ? fields.photos : generatedPhotos(seedKey, fields);
}
