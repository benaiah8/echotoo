const DB_NAME = "echotoo_create_draft_video";
const DB_VERSION = 1;
const STORE = "videos";

type StoredDraftVideoRecord = {
  publishPostId: string;
  localId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("idb open failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "publishPostId" });
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
        request.onerror = () => reject(request.error ?? new Error("idb tx failed"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error ?? new Error("idb tx failed"));
      }),
  );
}

export async function saveWebDraftVideoBlob(
  publishPostId: string,
  localId: string,
  file: File,
): Promise<void> {
  const record: StoredDraftVideoRecord = {
    publishPostId,
    localId,
    blob: file,
    fileName: file.name,
    mimeType: file.type || "video/mp4",
    size: file.size,
    lastModified: file.lastModified,
  };
  await runTransaction("readwrite", (store) => store.put(record));
}

export async function loadWebDraftVideoFile(
  publishPostId: string,
): Promise<File | null> {
  const record = await runTransaction<StoredDraftVideoRecord | undefined>(
    "readonly",
    (store) => store.get(publishPostId),
  );
  if (!record?.blob) return null;
  return new File([record.blob], record.fileName, {
    type: record.mimeType,
    lastModified: record.lastModified,
  });
}

export async function deleteWebDraftVideoBlob(
  publishPostId: string,
): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.delete(publishPostId));
  } catch {
    /* best-effort */
  }
}
