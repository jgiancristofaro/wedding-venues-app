import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import { money } from '../lib/format';

export interface MapItem {
  ref: string;
  name: string;
  lat: number;
  lng: number;
  total: number | null;
  href: string;
  area?: string;
}

function FitBounds({
  items,
  focus,
}: {
  items: MapItem[];
  focus?: { lat: number; lng: number; zoom?: number };
}) {
  const map = useMap();
  const key = items.map((i) => i.ref).join('|');
  useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], focus.zoom ?? 13);
      return;
    }
    if (!items.length) return;
    const b = L.latLngBounds(items.map((i) => [i.lat, i.lng] as [number, number]));
    map.fitBounds(b, { padding: [40, 40], maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focus?.lat, focus?.lng]);
  return null;
}

function priceIcon(label: string, active: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;padding:4px 10px;border-radius:999px;font:600 12px/1.2 Inter Variable,system-ui;box-shadow:0 2px 6px rgba(0,0,0,.25);${
      active ? 'background:#1f1b16;color:#fff;' : 'background:#fff;color:#1f1b16;'
    }">${label}</div>`,
    iconSize: [0, 0],
  });
}

export default function MapView({
  items,
  activeRef,
  onHover,
  focus,
  height = '100%',
  single,
}: {
  items: MapItem[];
  activeRef?: string | null;
  onHover?: (ref: string | null) => void;
  focus?: { lat: number; lng: number; zoom?: number };
  height?: string;
  single?: boolean;
}) {
  const dense = items.length > 250;
  const center = useMemo<[number, number]>(
    () => (items[0] ? [items[0].lat, items[0].lng] : [40.75, -73.98]),
    [items],
  );
  return (
    <div
      style={{ height }}
      className="w-full overflow-hidden rounded-2xl border border-line"
      role="region"
      aria-label="Map of venues"
    >
      <MapContainer
        center={center}
        zoom={single ? 13 : 9}
        scrollWheelZoom
        preferCanvas={dense}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds items={items} focus={focus} />
        {items.map((i) =>
          dense ? (
            <CircleMarker
              key={i.ref}
              center={[i.lat, i.lng]}
              radius={6}
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#34483C', fillOpacity: 0.9 }}
            >
              <Popup>
                <Link to={i.href}>{i.name}</Link>
                <br />
                {money(i.total)}
              </Popup>
            </CircleMarker>
          ) : (
            <Marker
              key={i.ref}
              position={[i.lat, i.lng]}
              icon={priceIcon(
                single ? i.name : i.total == null ? 'Ask' : money(i.total, { compact: true }),
                i.ref === activeRef,
              )}
              eventHandlers={{ mouseover: () => onHover?.(i.ref), mouseout: () => onHover?.(null) }}
              zIndexOffset={i.ref === activeRef ? 1000 : 0}
              title={i.name}
            >
              <Popup>
                <div className="font-sans">
                  <Link to={i.href} className="font-semibold">
                    {i.name}
                  </Link>
                  <div>{i.area}</div>
                  <div>{money(i.total)} est. total</div>
                </div>
              </Popup>
            </Marker>
          ),
        )}
      </MapContainer>
    </div>
  );
}
