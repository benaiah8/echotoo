import {
  GoogleMap,
  Marker,
  Autocomplete,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";

const defaultCenter = { lat: 9.017, lng: 38.746 };

export default function LocationPickerGoogle({
  onSelect,
  onClose,
}: {
  onSelect: (loc: {
    lat: number;
    lng: number;
    formattedAddress?: string;
  }) => void;
  onClose: () => void;
}) {
  const [center, setCenter] = useState(defaultCenter);
  const [marker, setMarker] = useState(defaultCenter);
  const [formattedAddress, setFormattedAddress] = useState<string>();
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  // measure footer height to lift the floating button automatically
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerH, setFooterH] = useState<number>(120);

  const autoRef = useRef<google.maps.places.Autocomplete | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: ["places"],
  });

  // recalc footer height
  useEffect(() => {
    const measure = () => {
      if (footerRef.current) setFooterH(footerRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (footerRef.current) ro.observe(footerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // center on user location and zoom in for meter-level accuracy
  const goToMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng, accuracy } = coords;
        setCenter({ lat, lng });
        setMarker({ lat, lng });
        if (mapInstance) {
          mapInstance.panTo({ lat, lng });
          // zoom tighter if device reports good accuracy
          mapInstance.setZoom(accuracy && accuracy < 30 ? 18 : 17);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
    );
  };

  useEffect(() => {
    // get current location on mount
    goToMyLocation();
  }, [mapInstance]); // once map is ready

  if (!isLoaded) return <div className="text-[var(--text)]">Loading map…</div>;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]/50">
      {/* MAP */}
      <GoogleMap
        onLoad={(m) => setMapInstance(m)}
        mapContainerClassName="w-full flex-1"
        center={center}
        zoom={14}
        onClick={(e) => {
          const lat = e.latLng!.lat();
          const lng = e.latLng!.lng();
          setMarker({ lat, lng });
          setFormattedAddress(undefined);
          mapInstance?.panTo({ lat, lng });
        }}
        options={{
          restriction: {
            latLngBounds: {
              north: 9.13,
              south: 8.87,
              west: 38.64,
              east: 38.86,
            },
            strictBounds: false,
          },
          streetViewControl: false,
          mapTypeControl: true,
          zoomControl: true,
        }}
      >
        <Marker
          position={marker}
          draggable
          onDragEnd={(e) => {
            const lat = e.latLng!.lat();
            const lng = e.latLng!.lng();
            setMarker({ lat, lng });
            setFormattedAddress(undefined);
            mapInstance?.panTo({ lat, lng });
          }}
        />
      </GoogleMap>

      {/* FLOATING: Go To My Location (aligned with map controls, auto-lifted above footer) */}
      <div
        className="absolute right-2 z-20"
        style={{ bottom: footerH + 12 }} // auto offset
      >
        <button
          onClick={goToMyLocation}
          className="bg-white/95 p-3 rounded-full drop-shadow-lg border border-gray-300"
          title="Go to my location"
        >
          📍
        </button>
      </div>

      {/* FOOTER: Search + Buttons (search is BELOW the map, inside black area) */}
      <div
        ref={footerRef}
        className="bg-[var(--surface-2)] text-[var(--text)] w-full p-4 pt-3 space-y-3"
      >
        <div className="max-w-2xl mx-auto">
          <Autocomplete
            onLoad={(auto) => (autoRef.current = auto)}
            options={{ componentRestrictions: { country: "et" } }}
            onPlaceChanged={() => {
              const place = autoRef.current?.getPlace();
              if (!place?.geometry) return;
              const lat = place.geometry.location!.lat();
              const lng = place.geometry.location!.lng();
              setCenter({ lat, lng });
              setMarker({ lat, lng });
              setFormattedAddress(place.formatted_address!);
              mapInstance?.panTo({ lat, lng });
              mapInstance?.setZoom(18);
            }}
          >
            <input
              type="text"
              placeholder="Search location…"
              className="w-full p-3 rounded-md border border-gray-300 bg-white text-black drop-shadow-lg"
            />
          </Autocomplete>
          {formattedAddress && (
            <p className="text-xs text-gray-300 mt-2">📍 {formattedAddress}</p>
          )}
        </div>

        <div className="max-w-2xl mx-auto flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-400 py-2 rounded-lg bg-[var(--surface)]/60"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSelect({ lat: marker.lat, lng: marker.lng, formattedAddress })
            }
            className="flex-1 bg-primary text-black py-2 font-semibold rounded-lg drop-shadow-lg"
          >
            Set Location
          </button>
        </div>
      </div>
    </div>
  );
}
