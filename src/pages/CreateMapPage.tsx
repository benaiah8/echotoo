// src/pages/CreateMapPage.tsx
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import LocationPicker from "../components/LocationPicker";

export default function CreateMapPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const idx = Number(searchParams.get("activity") || 0);

  // pull & write draftActivities from localStorage
  const raw = localStorage.getItem("draftActivities") || "[]";
  const activities = JSON.parse(raw);

  return (
    <PrimaryPageContainer back>
      <div className="flex-1 flex flex-col p-3">
        <h3 className="text-white text-lg mb-2">Pick a Location</h3>
        <div className="w-full h-[80vh]">
          <LocationPicker
            onSelect={({ lat, lng }) => {
              const next = activities.map((a: any, i: number) =>
                i === idx ? { ...a, location: `${lat},${lng}` } : a
              );
              localStorage.setItem("draftActivities", JSON.stringify(next));
              navigate(-1);
            }}
          />
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
