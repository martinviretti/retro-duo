const DB_NAME = 'retro-duo-db';
const DB_VERSION = 1;
const STORE_ROMS = 'roms';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ROMS)) {
        const store = db.createObjectStore(STORE_ROMS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
  });
}

function withStore(mode, operation) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROMS, mode);
    const store = tx.objectStore(STORE_ROMS);
    let result;

    try {
      result = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Falló una operación de almacenamiento.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('La operación fue cancelada.'));
    };
  }));
}

export async function saveRom(record) {
  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function getRom(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROMS, 'readonly');
    const request = tx.objectStore(STORE_ROMS).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la ROM.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function listRoms() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ROMS, 'readonly');
    const request = tx.objectStore(STORE_ROMS).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('No se pudo leer la biblioteca.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function removeRom(id) {
  await withStore('readwrite', (store) => store.delete(id));
}
