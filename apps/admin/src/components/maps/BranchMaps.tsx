"use client";

import { Fragment, useEffect, useState } from "react";
import { Circle, MapContainer, Marker, Tooltip, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker image paths don't resolve through Next.js's bundler, so use the CDN copies (same as the storefront).
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const RED = "#ED2320";
const DEFAULT_CENTER: [number, number] = [30.3753, 69.3451]; // Pakistan
const TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

function ClickToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Keep the whole delivery circle in view: on first render, when the radius changes, and when the pin is moved far away (search / GPS). */
function FitCircle({ center, radiusKm }: { center: [number, number] | null; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    if (radiusKm > 0) map.fitBounds(L.latLng(center).toBounds(radiusKm * 2000), { padding: [24, 24], animate: true });
    else map.setView(center, Math.max(map.getZoom(), 15));
    // Intentionally not depending on center: dragging the pin shouldn't keep re-zooming the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm, map]);
  return null;
}

function FlyTo({ target }: { target: { lat: number; lng: number; key: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [target, map]);
  return null;
}

type SearchHit = { display_name: string; lat: string; lon: string };

/** Branch location picker: search an address (free OpenStreetMap Nominatim), drag the pin or click the map, and see the delivery radius as a circle. */
export function LocationMap({
  lat,
  lng,
  radiusKm,
  showRadius,
  onMove,
  others = [],
}: {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  showRadius: boolean;
  onMove: (lat: number, lng: number) => void;
  others?: { id: string; name: string; lat: number; lng: number; radiusKm: number }[];
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fly, setFly] = useState<{ lat: number; lng: number; key: number } | null>(null);

  const center: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;

  function moveTo(la: number, ln: number) {
    onMove(la, ln);
    setFly({ lat: la, lng: ln, key: Date.now() });
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
      const data = (await res.json()) as SearchHit[];
      setHits(data);
      if (data.length === 0) setMessage("No place found. Try a nearby landmark or area name, or click the map.");
    } catch {
      setMessage("Search is unavailable right now. You can still click the map or drag the pin.");
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMessage("Your browser can't share its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => moveTo(pos.coords.latitude, pos.coords.longitude),
      () => setMessage("Couldn't get your location. Allow location access, or search instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Search the branch address or area, e.g. DHA Phase 6 Karachi"
          className="input min-w-0 flex-1"
        />
        <button type="button" onClick={() => void search()} disabled={searching || !query.trim()} className="shrink-0 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50">
          {searching ? "..." : "Search"}
        </button>
        <button type="button" onClick={useMyLocation} className="shrink-0 rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          My location
        </button>
      </div>

      {hits.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-neutral-200 bg-white text-sm shadow-sm">
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  moveTo(Number(h.lat), Number(h.lon));
                  setHits([]);
                }}
                className="block w-full px-3 py-2 text-left text-neutral-700 hover:bg-red-50"
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-xs text-amber-700">{message}</p>}

      <div className="relative overflow-hidden rounded-xl border border-neutral-200">
        <MapContainer center={center ?? DEFAULT_CENTER} zoom={center ? 14 : 5} scrollWheelZoom className="h-72 w-full" style={{ zIndex: 0 }}>
          <TileLayer attribution={TILES.attribution} url={TILES.url} />
          {others.map((o) => (
            <Circle key={o.id} center={[o.lat, o.lng]} radius={o.radiusKm * 1000} pathOptions={{ color: "#737373", weight: 1, fillOpacity: 0.05, dashArray: "4" }}>
              <Tooltip>{o.name}</Tooltip>
            </Circle>
          ))}
          {center && showRadius && radiusKm > 0 && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: RED, weight: 2, fillColor: RED, fillOpacity: 0.12 }} />}
          {center && (
            <Marker
              position={center}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const p = (e.target as L.Marker).getLatLng();
                  onMove(p.lat, p.lng);
                },
              }}
            />
          )}
          <ClickToMove onMove={onMove} />
          <FitCircle center={center} radiusKm={showRadius ? radiusKm : 0} />
          <FlyTo target={fly} />
        </MapContainer>
        {!center && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-neutral-700 shadow">Click the map or search to place the branch pin</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only overview of every branch's delivery circle, so gaps and overlaps are visible at a glance. */
export function CoverageMap({ branches }: { branches: { id: string; name: string; code: string; lat: number; lng: number; radiusKm: number; delivery: boolean }[] }) {
  const pts = branches.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng));
  const bounds = pts.length
    ? pts.reduce((acc, b) => acc.extend(L.latLng(b.lat, b.lng).toBounds(Math.max(b.radiusKm, 0.5) * 2000)), L.latLngBounds([pts[0]!.lat, pts[0]!.lng], [pts[0]!.lat, pts[0]!.lng]))
    : null;

  return (
    <MapContainer
      bounds={bounds ?? undefined}
      boundsOptions={{ padding: [30, 30] }}
      center={DEFAULT_CENTER}
      zoom={5}
      scrollWheelZoom
      className="h-[26rem] w-full rounded-xl"
      style={{ zIndex: 0 }}
    >
      <TileLayer attribution={TILES.attribution} url={TILES.url} />
      {pts.map((b) => (
        <Fragment key={b.id}>
          {b.delivery && b.radiusKm > 0 && (
            <Circle center={[b.lat, b.lng]} radius={b.radiusKm * 1000} pathOptions={{ color: RED, weight: 2, fillColor: RED, fillOpacity: 0.1 }} />
          )}
          <Marker position={[b.lat, b.lng]} icon={markerIcon}>
            <Tooltip>
              {b.name} ({b.code}){b.delivery ? ` · ${b.radiusKm} km` : " · no delivery"}
            </Tooltip>
          </Marker>
        </Fragment>
      ))}
    </MapContainer>
  );
}
