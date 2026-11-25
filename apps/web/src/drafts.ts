export interface Draft {
  name: string;
  value: string;
}

const storeName = "drafts";
const draftKey = "current";
let connection: Promise<IDBDatabase> | undefined;

function database() {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lition13-markdown-editor", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("草稿存储正在其他页面中使用"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
  }).catch(error => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function readDraft(): Promise<Draft | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).get(draftKey);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const value = request.result as Partial<Draft> | undefined;
      resolve(value && typeof value.name === "string" && typeof value.value === "string"
        ? { name: value.name, value: value.value }
        : undefined);
    };
  });
}

export async function writeDraft(draft: Draft): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("草稿写入中断"));
    transaction.objectStore(storeName).put(draft, draftKey);
  });
}
