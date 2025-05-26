// src/components/LocationPicker.tsx
import { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import type { LatLngExpression, LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationPicker({
  onSelect,
}: {
  onSelect: (coords: { lat: number; lng: number }) => void;
}) {
  console.log("LocationIQ key:", import.meta.env.VITE_LOCATIONIQ_KEY);
  const [center, setCenter] = useState<LatLngExpression>([9.017, 38.746]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const debounce = useRef<number | null>(null);

  useEffect(() => {
    // 1) if they cleared the input, clear suggestions and skip the fetch
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    // 2) debounce the LocationIQ call
    const timer = window.setTimeout(() => {
      // compute a ~50 km viewbox around `center`
      const [lat0, lon0] = Array.isArray(center)
        ? center
        : [center.lat!, center.lng!];
      const delta = 0.5;
      const left = lon0 - delta;
      const right = lon0 + delta;
      const top = lat0 + delta;
      const bottom = lat0 - delta;
      const viewbox = `${left},${top},${right},${bottom}`;

      // build LocationIQ URL
      const params = new URLSearchParams({
        key: import.meta.env.VITE_LOCATIONIQ_KEY,
        q: query,
        format: "json",
        limit: "5",
        countrycodes: "et",
        viewbox,
        bounded: "0",
      });

      fetch(`https://us1.locationiq.com/v1/search.php?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setSuggestions(data);
          } else {
            console.error("LocationIQ error:", data);
            setSuggestions([]);
          }
        })
        .catch((err) => {
          console.error("Fetch error:", err);
          setSuggestions([]);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, center]);

  return (
    <div className="relative h-full w-full">
      {/* SEARCH BOX */}
      <div className="absolute z-[1000] top-4 left-1/2 transform -translate-x-1/2 w-11/12 max-w-md">
        <input
          type="text"
          className="w-full p-2 text-black placeholder-gray-500 rounded-t-md border border-gray-400 bg-white"
          placeholder="Search for a place…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!!suggestions.length && (
          <ul className="bg-white rounded-b-md border border-t-0 border-gray-400 max-h-60 overflow-auto shadow-lg text-black">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="px-4 py-2 hover:bg-gray-200 cursor-pointer text-sm"
                onClick={() => {
                  const lat = parseFloat(s.lat),
                    lng = parseFloat(s.lon);
                  setCenter([lat, lng]);
                  setQuery(s.display_name);
                  setSuggestions([]);
                }}
              >
                {s.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* THE MAP */}
      <MapContainer center={center} zoom={13} className="absolute inset-0 z-0">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler />
        {selected && (
          <Marker position={[selected.lat, selected.lng]}>
            <Popup>
              {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
