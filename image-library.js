'use strict';
/* IndexedDB file library. All user images stay on this device/browser origin. */
(() => {
  const NAME = 'aan-local-image-library-v1';
  const baseCount = window.CARDS?.length || 0;
  const VERSION = baseCount > 195 ? 2 : 1;
  let handle = null;
  const requestResult = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('儲存失敗'));
  });
  function planCardIds(rows, baseCount) {
    const occupied = new Set(rows.map(row => row.id));
    const changes = new Map();
    let nextId = baseCount + 1;
    for (const row of rows) {
      if (row.kind !== 'custom' || row.id > baseCount) continue;
      while (occupied.has(nextId)) nextId++;
      changes.set(row.id, nextId++);
    }
    return changes;
  }
  function open() {
    if (!('indexedDB' in window)) return Promise.reject(Error('瀏覽器不支援本機圖片資料庫'));
    if (handle) return handle;
    handle = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = event => {
        const db = req.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
        if (event.oldVersion === 1 && VERSION === 2) {
          const photos = req.transaction.objectStore('photos');
          const settings = req.transaction.objectStore('settings');
          const all = photos.getAll();
          all.onsuccess = () => {
            const changes = planCardIds(all.result, baseCount);
            for (const row of all.result) {
              if (!changes.has(row.id)) continue;
              photos.delete(row.id);
              photos.add({...row, id: changes.get(row.id)});
            }
            settings.put({key: 'legacyCardIds', value: [...changes]});
          };
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); handle = null; };
        resolve(db);
      };
      req.onerror = () => { handle = null; reject(req.error || Error('無法開啟圖片資料庫')); };
      req.onblocked = () => { handle = null; reject(Error('有其他舊版閱讀器分頁仍在開啟，請先關閉')); };
    });
    return handle;
  }
  async function transact(stores, mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      try { result = callback(tx); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || Error('資料庫寫入失敗'));
      tx.onabort = () => reject(tx.error || Error('資料庫寫入中斷／空間不足'));
    });
  }
  async function allPhotos() {
    const db = await open();
    return requestResult(db.transaction('photos').objectStore('photos').getAll());
  }
  async function getSettings(key, fallback) {
    const db = await open();
    const record = await requestResult(db.transaction('settings').objectStore('settings').get(key));
    return record ? record.value : fallback;
  }
  async function putPhoto(item) { await transact(['photos'], 'readwrite', tx => tx.objectStore('photos').put(item)); }
  async function deletePhoto(id) { await transact(['photos'], 'readwrite', tx => tx.objectStore('photos').delete(id)); }
  async function putSetting(key, value) {
    await transact(['settings'], 'readwrite', tx => tx.objectStore('settings').put({key, value}));
  }
  async function restore(photoRows, hiddenIds, nextId, legacyCardIds) {
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['photos','settings'], 'readwrite');
      tx.objectStore('photos').clear();
      const photos = tx.objectStore('photos');
      for (const item of photoRows) photos.put(item);
      const settings = tx.objectStore('settings');
      settings.put({key:'hidden',value:hiddenIds});
      settings.put({key:'nextId',value:nextId});
      settings.put({key:'legacyCardIds',value:[...legacyCardIds]});
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error('資料還原失敗'));
      tx.onabort = () => reject(tx.error || Error('儲存空間不足，無法還原'));
    });
  }
  window.AANLibrary = {open, allPhotos, getSettings, putPhoto, deletePhoto, putSetting, restore, planCardIds};
})();
