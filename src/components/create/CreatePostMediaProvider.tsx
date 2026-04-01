import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { uploadNormalizedPostImage } from "../../api/services/mediaUpload";
import { prepareImageForUpload } from "../../lib/prepareImageForUpload";
import { isProbablyPostImageFile } from "../../lib/postImagePipeline";
import { supabase } from "../../lib/supabaseClient";
import {
  dispatchPostImageMerged,
  syncActivityPostImagesInDraftStorage,
} from "../../lib/createFlowDraftStorage";

/** In-memory jobs only; successful uploads are removed (no terminal `done` row kept). */
export type PostImageJobStatus = "uploading" | "error";

export type PostImageUploadJob = {
  id: string;
  activityIndex: number;
  fileName: string;
  status: PostImageJobStatus;
  errorMessage?: string;
};

export type CreatePostMediaContextValue = {
  /** Jobs still tracked in UI (uploading or error). Successful uploads are removed from this list. */
  jobs: PostImageUploadJob[];
  hasPendingUploads: boolean;
  startPostImageUploads: (
    files: File[],
    activityIndex: number
  ) => Promise<void>;
  getPendingJobsForActivity: (activityIndex: number) => PostImageUploadJob[];
};

const CreatePostMediaContext =
  createContext<CreatePostMediaContextValue | null>(null);

export function CreatePostMediaProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<PostImageUploadJob[]>([]);

  const hasPendingUploads = useMemo(
    () => jobs.some((j) => j.status === "uploading"),
    [jobs]
  );

  const getPendingJobsForActivity = useCallback(
    (activityIndex: number) =>
      jobs.filter(
        (j) =>
          j.activityIndex === activityIndex &&
          (j.status === "uploading" || j.status === "error")
      ),
    [jobs]
  );

  const startPostImageUploads = useCallback(
    async (files: File[], activityIndex: number) => {
      const toUpload = Array.from(files).filter((f) =>
        isProbablyPostImageFile(f)
      );
      if (!toUpload.length) {
        console.log(
          "[CreatePostMedia] start skipped: no accepted post image files"
        );
        return;
      }

      console.log("[CreatePostMedia] start post uploads", {
        count: toUpload.length,
        activityIndex,
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.error("[CreatePostMedia] not authenticated");
        alert("User not authenticated");
        return;
      }

      const uploadedInBatch: string[] = [];

      // Enqueue all jobs immediately so UI (e.g. shared upload notice) can show the
      // full batch count while this loop processes files sequentially.
      const batchJobs: PostImageUploadJob[] = toUpload.map((file) => ({
        id: crypto.randomUUID(),
        activityIndex,
        fileName: file.name,
        status: "uploading" as const,
      }));
      setJobs((prev) => [...prev, ...batchJobs]);

      for (let i = 0; i < toUpload.length; i++) {
        const file = toUpload[i];
        const id = batchJobs[i].id;

        try {
          let normalized;
          try {
            normalized = await prepareImageForUpload(file, "post");
          } catch (normErr) {
            const message =
              normErr instanceof Error
                ? normErr.message
                : "Could not process this image. Try another photo.";
            console.error("[CreatePostMedia] normalization failed", {
              file: file.name,
              message,
            });
            setJobs((prev) =>
              prev.map((j) =>
                j.id === id
                  ? { ...j, status: "error" as const, errorMessage: message }
                  : j
              )
            );
            alert(message);
            continue;
          }

          const path = await uploadNormalizedPostImage(normalized, {
            userId,
          });

          uploadedInBatch.push(path);
          const mergedImages = syncActivityPostImagesInDraftStorage(
            activityIndex,
            uploadedInBatch
          );
          if (!mergedImages) {
            uploadedInBatch.pop();
            const msg =
              "Upload succeeded but could not attach image to this activity. Try again or go back a step.";
            console.error(
              "[CreatePostMedia] merge returned null after upload",
              {
                activityIndex,
                path: path.slice(0, 80),
              }
            );
            setJobs((prev) =>
              prev.map((j) =>
                j.id === id
                  ? { ...j, status: "error" as const, errorMessage: msg }
                  : j
              )
            );
            alert(msg);
            continue;
          }

          dispatchPostImageMerged({
            activityIndex,
            images: mergedImages,
          });

          setJobs((prev) => prev.filter((j) => j.id !== id));
          console.log("[CreatePostMedia] upload success", {
            file: file.name,
            path: path.slice(0, 80),
          });
        } catch (e) {
          const message =
            e instanceof Error
              ? e.message
              : "Image upload failed. Please try again.";
          console.error("[CreatePostMedia] upload failed", {
            file: file.name,
            message,
          });
          setJobs((prev) =>
            prev.map((j) =>
              j.id === id
                ? { ...j, status: "error" as const, errorMessage: message }
                : j
            )
          );
          alert(message);
        }
      }

      console.log("[CreatePostMedia] batch finished for activity", {
        activityIndex,
      });
    },
    []
  );

  const value = useMemo<CreatePostMediaContextValue>(
    () => ({
      jobs,
      hasPendingUploads,
      startPostImageUploads,
      getPendingJobsForActivity,
    }),
    [jobs, hasPendingUploads, startPostImageUploads, getPendingJobsForActivity]
  );

  return (
    <CreatePostMediaContext.Provider value={value}>
      {children}
    </CreatePostMediaContext.Provider>
  );
}

export function useCreatePostMedia(): CreatePostMediaContextValue {
  const ctx = useContext(CreatePostMediaContext);
  if (ctx == null) {
    throw new Error(
      "useCreatePostMedia must be used within CreatePostMediaProvider (create flow layout)."
    );
  }
  return ctx;
}
