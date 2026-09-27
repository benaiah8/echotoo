/**
 * Web durable Create draft image Blobs (IndexedDB).
 * Separate from video DB `echotoo_create_draft_video`.
 */

const DB_NAME = "echotoo_create_draft_images";
const DB_VERSION = 1;
const STORE = "images";

export type StoredDraftImageRecord = {
  /** Collision-safe key: `{publishPostId}/{localId}` */
  key: string;
  publishPostId: string;
  localId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
};

export function buildWebDraftImageKey(
  publishPostId: string,
  localId: string,
): string {
  return `${publishPostId.trim()}/${localId.trim()}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("idb open failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("publishPostId", "publishPostId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () =>
          reject(request.error ?? new Error("idb tx failed"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
      }),
  );
}

export async function saveWebDraftImageBlob(
  publishPostId: string,
  localId: string,
  blob: Blob,
  meta: { fileName: string; mimeType: string },
): Promise<string> {
  const key = buildWebDraftImageKey(publishPostId, localId);
  const record: StoredDraftImageRecord = {
    key,
    publishPostId: publishPostId.trim(),
    localId: localId.trim(),
    blob,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    size: blob.size,
  };
  await runTransaction("readwrite", (store) => store.put(record));
  return key;
}

export async function loadWebDraftImageBlob(
  publishPostId: string,
  localId: string,
): Promise<Blob | null> {
  const key = buildWebDraftImageKey(publishPostId, localId);
  const record = await runTransaction<StoredDraftImageRecord | undefined>(
    "readonly",
    (store) => store.get(key),
  );
  return record?.blob ?? null;
}

export async function loadWebDraftImageRecord(
  publishPostId: string,
  localId: string,
): Promise<StoredDraftImageRecord | null> {
  const key = buildWebDraftImageKey(publishPostId, localId);
  const record = await runTransaction<StoredDraftImageRecord | undefined>(
    "readonly",
    (store) => store.get(key),
  );
  return record ?? null;
}

export async function hasWebDraftImageBlob(
  publishPostId: string,
  localId: string,
): Promise<boolean> {
  const blob = await loadWebDraftImageBlob(publishPostId, localId);
  return Boolean(blob && blob.size > 0);
}

export async function deleteWebDraftImageBlob(
  publishPostId: string,
  localId: string,
): Promise<void> {
  const key = buildWebDraftImageKey(publishPostId, localId);
  try {
    await runTransaction("readwrite", (store) => store.delete(key));
  } catch {
    /* best-effort */
  }
}

export async function deleteWebDraftImagesForPost(
  publishPostId: string,
): Promise<void> {
  const id = publishPostId.trim();
  if (!id) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const index = store.index("publishPostId");
      const request = index.openCursor(IDBKeyRange.only(id));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      request.onerror = () =>
        reject(request.error ?? new Error("idb cursor failed"));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
    });
  } catch {
    /* best-effort */
  }
}
