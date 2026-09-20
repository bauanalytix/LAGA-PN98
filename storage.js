/* One transactional record per protocol, including photographs. No server. */
'use strict';
window.PNStore = (() => {
  const DB_NAME = 'bauanalytix-pn98-v2';
  let opening;
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const store = request.result.objectStoreNames.contains('projects')
          ? request.transaction.objectStore('projects')
          : request.result.createObjectStore('projects', { keyPath: 'id' });
        if (!store.indexNames.contains('projectKey')) store.createIndex('projectKey', 'projectKey', { unique: true });
        // Read list labels without loading every project's photographs on each save.
        if (!store.indexNames.contains('summary')) store.createIndex('summary', ['updatedAt', 'fields.projNr', 'fields.material', 'fields.projName']);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error('Bitte andere PN98-Tabs schließen und neu laden.')); };
    });
    return opening;
  }
  const key = (number, id) => number.trim() ? number.trim().toUpperCase() : '__DRAFT__:' + id;
  async function all() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function get(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get(id);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function list() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').index('summary').openKeyCursor(null, 'prev');
      const records = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const [updatedAt, projNr, material, projName] = cursor.key;
        records.push({ id: cursor.primaryKey, updatedAt, fields: { projNr, material, projName } });
        cursor.continue();
      };
      tx.oncomplete = () => resolve(records);
      tx.onerror = () => reject(tx.error);
    });
  }
  function problem(code) { return Object.assign(new Error(code), { code }); }
  async function write(record, expectedRevision, remove = false) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      let failure, result;
      const check = store.get(record.id);
      check.onsuccess = () => {
        const current = check.result;
        if ((current?.revision || 0) !== expectedRevision) {
          failure = problem('CONFLICT'); tx.abort(); return;
        }
        if (remove) { store.delete(record.id); return; }
        result = { ...record, projectKey: key(record.fields.projNr, record.id), revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        store.put(result);
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || (tx.error?.name === 'ConstraintError' ? problem('DUPLICATE') : tx.error || problem('SAVE_FAILED')));
      tx.onerror = () => {};
    });
  }
  async function addMissing(records) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const result = { added: 0, skipped: 0 };
      const seen = new Set();
      for (const record of records) {
        const projectKey = key(record.fields.projNr, record.id);
        if (seen.has(projectKey)) { result.skipped++; continue; }
        seen.add(projectKey);
        const check = store.index('projectKey').get(projectKey);
        check.onsuccess = () => {
          if (check.result) { result.skipped++; return; }
          store.add({ ...record, projectKey, revision: 1, updatedAt: new Date().toISOString() });
          result.added++;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || problem('IMPORT_FAILED'));
      tx.onerror = () => {};
    });
  }
  return { open, all, list, get, write, addMissing, key };
})();
