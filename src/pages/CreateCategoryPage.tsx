import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import PrimaryInput from "../components/input/PrimaryInput";
import CreateActivityCategoriesSection from "../sections/create/CreateActivityCategoriesSection";
import CreateTabsSection from "../sections/create/CreateTabsSection";
import { Paths } from "../router/Paths";

export default function CreateCategoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const postType = searchParams.get("type") || "journey";

  const base = `?type=${postType}`;
  const paths = [
    `${Paths.createTitle}${base}`,
    `${Paths.createActivities}${base}`,
    `${Paths.createCategories}${base}`,
    `${Paths.preview}${base}`,
  ];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (tags.length < 2) {
      setError("Please select at least two tags.");
    } else {
      setError("");
      navigate(paths[3]);
    }
  };

  return (
    <PrimaryPageContainer back>
      <div className="flex-1 w-full px-4 flex flex-col">
        {/* Edit Title & Description */}
        <div className="w-full bg-background p-4 rounded-md mt-8 flex flex-col gap-4">
          <PrimaryInput
            label="Title"
            value={title}
            placeholder="Edit your title"
            onChange={(e) => setTitle(e.target.value)}
          />
          <PrimaryInput
            label="Description"
            textarea
            rows={1}
            value={description}
            placeholder="Edit your description"
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Tag selector */}
        <div className="w-full mt-6">
          <CreateActivityCategoriesSection
            selectedTags={tags}
            onAddTag={(t) =>
              t && !tags.includes(t) && setTags([...tags, t])
            }
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>

        <div className="flex-1" />

        <CreateTabsSection step={3} paths={paths} onNext={handleNext} />
      </div>
    </PrimaryPageContainer>
  );
}
