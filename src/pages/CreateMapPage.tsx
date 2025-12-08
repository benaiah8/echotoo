// src/pages/CreateMapPage.tsx
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import LocationPickerGoogle from "../components/LocationPickerGoogle";

export default function CreateMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idx = Number(searchParams.get("activity") || 0);

  const raw = localStorage.getItem("draftActivities") || "[]";
  const activities = JSON.parse(raw);

  const handleSelect = ({
    lat,
    lng,
    formattedAddress,
  }: {
    lat: number;
    lng: number;
    formattedAddress?: string;
  }) => {
    const next = activities.map((a: any, i: number) =>
      i === idx
        ? {
            ...a,
            location: formattedAddress || `${lat.toFixed(5)},${lng.toFixed(5)}`,
          }
        : a
    );
    localStorage.setItem("draftActivities", JSON.stringify(next));
    navigate(-1);
  };

  return (
    <PrimaryPageContainer back>
      <LocationPickerGoogle
        onSelect={handleSelect}
        onClose={() => navigate(-1)}
      />
    </PrimaryPageContainer>
  );
}
