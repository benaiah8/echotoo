import { describe, expect, it } from "vitest";
import {
  createAddCropQueue,
  filterImageFiles,
  profilePhotoRemainingSlots,
  sliceFilesToRemainingSlots,
  takeCompletedCrops,
  type ProfilePhotoAddCropQueue,
} from "./profilePhotoAddPipelineUtils";
import { PROFILE_PHOTOS_MAX } from "./profilePhotos";

function file(name: string, type = "image/jpeg"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("profilePhotoRemainingSlots", () => {
  it("returns remaining capacity up to PROFILE_PHOTOS_MAX", () => {
    expect(profilePhotoRemainingSlots(0)).toBe(PROFILE_PHOTOS_MAX);
    expect(profilePhotoRemainingSlots(1)).toBe(PROFILE_PHOTOS_MAX - 1);
    expect(profilePhotoRemainingSlots(2)).toBe(PROFILE_PHOTOS_MAX - 2);
    expect(profilePhotoRemainingSlots(3)).toBe(0);
    expect(profilePhotoRemainingSlots(5)).toBe(0);
  });
});

describe("sliceFilesToRemainingSlots", () => {
  it("slices incoming files to remaining slots", () => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg"), file("d.jpg")];
    const result = sliceFilesToRemainingSlots(files, 2);
    expect(result).not.toBeNull();
    expect(result!.accepted).toHaveLength(2);
    expect(result!.pending).toHaveLength(1);
    expect(result!.ignoredCount).toBe(2);
  });

  it("returns null when no remaining slots", () => {
    expect(sliceFilesToRemainingSlots([file("a.jpg")], 0)).toBeNull();
  });
});

describe("filterImageFiles", () => {
  it("keeps image files and empty-type files", () => {
    const files = [
      file("a.jpg", "image/jpeg"),
      file("b.txt", "text/plain"),
      file("c", ""),
    ];
    expect(filterImageFiles(files)).toHaveLength(2);
  });
});

describe("createAddCropQueue", () => {
  it("preserves completed crop ordering", () => {
    const first = file("first.jpg");
    const second = file("second.jpg");
    const third = file("third.jpg");
    const { session } = createAddCropQueue(first, [second, third]);
    session.completed.push(file("cropped-1.jpg"));
    session.completed.push(file("cropped-2.jpg"));
    expect(takeCompletedCrops(session)).toEqual([
      file("cropped-1.jpg"),
      file("cropped-2.jpg"),
    ]);
  });
});

describe("cancel-all crops semantics", () => {
  it("empty completed queue means no upload batch", () => {
    const session: ProfilePhotoAddCropQueue = { pending: [], completed: [] };
    expect(takeCompletedCrops(session)).toEqual([]);
  });
});
