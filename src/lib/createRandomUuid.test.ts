import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRandomUuid } from "./createRandomUuid";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRandomUuid", () => {
  it("prefers crypto.randomUUID when present", () => {
    const randomUUID = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });

    expect(createRandomUuid()).toBe("11111111-1111-4111-8111-111111111111");
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("builds an RFC UUID v4 from getRandomValues when randomUUID is absent", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = 0xab;
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    const id = createRandomUuid();
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(id).toMatch(UUID_V4);
    expect(id[14]).toBe("4");
    const variant = Number.parseInt(id[19], 16);
    expect(variant & 0x8).toBe(0x8);
    expect(variant & 0xc).not.toBe(0xc);
  });
});

describe("migrated UUID call-site formats", () => {
  it("keeps storage prefixes and bare ids", () => {
    const media = read("src/api/services/mediaUpload.ts");
    expect(media).toContain(
      "`${opts.userId}/${opts.kind}/${createRandomUuid()}.${",
    );
    expect(media).toContain("`post-${createRandomUuid()}.${safeExt}`");
    expect(media).toContain(
      "`${opts.userId}/post/${createRandomUuid()}.${extension}`",
    );
    expect(media).toContain("`profile-photo-${createRandomUuid()}.${safeExt}`");
    expect(media).toContain(
      "`${opts.userId}/avatar/${createRandomUuid()}.${safeExt}`",
    );

    const provider = read("src/components/create/CreatePostMediaProvider.tsx");
    expect(provider).toContain("id: createRandomUuid()");
    expect(provider).toContain("const localId = createRandomUuid()");

    expect(read("src/lib/drafts.ts")).toContain(
      "const publishPostId = createRandomUuid()",
    );
    expect(read("src/lib/createDraftVideo/index.ts")).toContain(
      "const localId = createRandomUuid()",
    );
    expect(read("src/lib/createDraftImage/index.ts")).toContain(
      "input.localId?.trim() || createRandomUuid()",
    );
    expect(read("src/api/services/messaging.ts")).toContain(
      "return createRandomUuid()",
    );
  });
});
