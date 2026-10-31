'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type MapSelection = {
  latitude: number | null;
  longitude: number | null;
  mapAddress: string;
};

type SearchHit = {
  label: string;
  latitude: number;
  longitude: number;
};

const DEFAULT_CENTER = { lat: 24.4539, lng: 54.3773 }; // Abu Dhabi
const DEFAULT_ZOOM = 12;

export function LocationMapPicker({
  value,
  onChange,
  className,
}: {
  value: MapSelection;
  onChange: (next: MapSelection) => void;
  className?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    let map: import('leaflet').Map | null = null;

    async function boot() {
      if (!mapEl.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      // Ensure Leaflet stylesheet is present once (avoid TS CSS module typing).
      if (
        typeof document !== 'undefined' &&
        !document.getElementById('leaflet-css')
      ) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href =
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(link);
      }

      // Fix default marker icons under webpack/Next
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (cancelled || !mapEl.current) return;

      const start =
        value.latitude != null && value.longitude != null
          ? { lat: value.latitude, lng: value.longitude }
          : DEFAULT_CENTER;

      map = L.map(mapEl.current, {
        center: [start.lat, start.lng],
        zoom: value.latitude != null ? 15 : DEFAULT_ZOOM,
        scrollWheelZoom: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on('click', (e) => {
        void placePin(e.latlng.lat, e.latlng.lng, true);
      });

      mapRef.current = map;
      setMapReady(true);

      if (value.latitude != null && value.longitude != null) {
        await placePin(value.latitude, value.longitude, false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // intentionally mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function placePin(
    latitude: number,
    longitude: number,
    reverse: boolean,
  ) {
    const L = (await import('leaflet')).default;
    const map = mapRef.current;
    if (!map) return;

    if (!markerRef.current) {
      markerRef.current = L.marker([latitude, longitude], {
        draggable: true,
      }).addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current?.getLatLng();
        if (!pos) return;
        void placePin(pos.lat, pos.lng, true);
      });
    } else {
      markerRef.current.setLatLng([latitude, longitude]);
    }
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15));

    let mapAddress = value.mapAddress;
    if (reverse) {
      try {
        const result = await apiFetch<{ label: string }>(
          `/places/map-reverse?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
          { token: getAccessToken() },
        );
        mapAddress = result.label;
      } catch {
        mapAddress =
          mapAddress ||
          `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
    }

    onChange({
      latitude,
      longitude,
      mapAddress: mapAddress || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    });
  }

  // Sync external value → marker when editing an existing place after map ready
  useEffect(() => {
    if (!mapReady) return;
    if (value.latitude == null || value.longitude == null) return;
    const marker = markerRef.current;
    const current = marker?.getLatLng();
    if (
      current &&
      Math.abs(current.lat - value.latitude) < 1e-6 &&
      Math.abs(current.lng - value.longitude) < 1e-6
    ) {
      return;
    }
    void placePin(value.latitude, value.longitude, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, value.latitude, value.longitude]);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const results = await apiFetch<SearchHit[]>(
        `/places/map-search?q=${encodeURIComponent(q)}`,
        { token: getAccessToken() },
      );
      setHits(results);
      if (results.length === 0) {
        setSearchError('No places found. Try a broader search.');
      }
    } catch (err) {
      setHits([]);
      setSearchError((err as Error).message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function clearPin() {
    markerRef.current?.remove();
    markerRef.current = null;
    onChange({ latitude: null, longitude: null, mapAddress: '' });
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">Map location</label>
        {value.latitude != null ? (
          <button
            type="button"
            onClick={clearPin}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            <X className="h-3.5 w-3.5" />
            Clear pin
          </button>
        ) : null}
      </div>

      <div className="relative flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search venue, area, or address…"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          loading={searching}
          onClick={() => void runSearch()}
          disabled={query.trim().length < 2}
        >
          Search
        </Button>
      </div>

      {hits.length > 0 ? (
        <ul className="max-h-36 overflow-y-auto rounded-xl border border-[var(--border)] bg-white">
          {hits.map((hit) => (
            <li key={`${hit.latitude}-${hit.longitude}-${hit.label}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2 border-b border-[var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--accent-soft)]/50"
                onClick={() => {
                  setHits([]);
                  setQuery(hit.label);
                  onChange({
                    latitude: hit.latitude,
                    longitude: hit.longitude,
                    mapAddress: hit.label,
                  });
                  void placePin(hit.latitude, hit.longitude, false);
                }}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 leading-snug">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchError ? (
        <p className="text-xs text-rose-700">{searchError}</p>
      ) : null}

      <div
        ref={mapEl}
        className="h-56 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] z-0"
      />
      {value.mapAddress ? (
        <p className="truncate text-xs text-[var(--muted)]">{value.mapAddress}</p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Search or click the map to set a pin.
        </p>
      )}
    </div>
  );
}
