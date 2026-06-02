import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { uploadNormalizedPostImage } from "../../api/services/mediaUpload";
import { prepareImageForUpload } from "../../lib/prepareImageForUpload";
import { mapMediaUploadError } from "../../lib/mapMediaUploadError";
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
  /** Remove a failed upload job from the inline error list (re-add via picker). */
  dismissFailedUpload: (jobId: string) => void;
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

  const dismissFailedUpload = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const markJobError = useCallback(
    (jobId: string, err: unknown, logLabel: string, logExtra?: object) => {
      const raw =
        err instanceof Error ? err.message : String(err ?? "unknown error");
      const friendly = mapMediaUploadError(err, "post");
      console.error(`[CreatePostMedia] ${logLabel}`, {
        ...logExtra,
        raw,
        friendly,
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "error" as const, errorMessage: friendly }
            : j
        )
      );
      toast.error(friendly);
    },
    []
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
        const friendly = mapMediaUploadError(new Error("not authenticated"), "post");
        console.error("[CreatePostMedia] not authenticated");
        toast.error(friendly);
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
            markJobError(id, normErr, "normalization failed", {
              file: file.name,
            });
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
            markJobError(
              id,
              new Error(
                "Upload succeeded but could not attach image to this activity."
              ),
              "merge returned null after upload",
              {
                activityIndex,
                path: path.slice(0, 80),
              }
            );
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
          markJobError(id, e, "upload failed", { file: file.name });
        }
      }

      console.log("[CreatePostMedia] batch finished for activity", {
        activityIndex,
      });
    },
    [markJobError]
  );

  const value = useMemo<CreatePostMediaContextValue>(
    () => ({
      jobs,
      hasPendingUploads,
      startPostImageUploads,
      getPendingJobsForActivity,
      dismissFailedUpload,
    }),
    [
      jobs,
      hasPendingUploads,
      startPostImageUploads,
      getPendingJobsForActivity,
      dismissFailedUpload,
    ]
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
