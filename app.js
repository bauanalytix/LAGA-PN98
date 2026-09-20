'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const FIELDS = ['projNr', 'projName', 'auftraggeber', 'ort', 'datum', 'verantwortlich', 'anlass', 'nutzung', 'versiegelung', 'bem', 'material', 'avv', 'vol', 'lagerart', 'lagerart_text', 'lagerform', 'lagerform_text', 'korn', 'volmeth', 'schad', 'ep', 'mp', 'lp', 'red', 'lpr'];
  const SAMPLE_FIELDS = [
    ['sektor', 'Sektor-Nr.'], ['pid', 'Proben-ID'], ['mat', 'Materialbeschreibung', 'textarea'],
    ['kons', 'Konsistenz', ['fest', 'schlammig', 'flüssig']],
    ['ger', 'Geruch', ['unauffällig', 'aromatisch', 'muffig', 'ölig', 'chemisch']],
    ['fm', 'Fremdstoffe mineralisch'], ['fn', 'Fremdstoffe nicht-mineralisch'], ['volp', 'Volumen L'],
    ['pos', 'Entnahmeposition', ['mittig', 'links', 'rechts']],
    ['art', 'Probenahmeart', ['händisch', 'mit Schaufel', 'mit Bagger']], ['bes', 'Besonderheiten', 'textarea']
  ];
  const LAST = 'bauanalytix-pn98-last-project';
  const defaults = Object.fromEntries(FIELDS.map(id => [id, $(id).value]));
  let active, dirty = false, editVersion = 0, saveQueue = Promise.resolve(true), busy = false;
  let offlineReady = false, registration, updating = false;
  const uuid = () => crypto.randomUUID();
  function newRecord() {
    return { id: uuid(), revision: 0, fields: { ...defaults, datum: new Date().toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }, samples: [], images: {} };
  }
  function status(message, error = false) {
    $('saveStatus').textContent = message;
    $('saveStatus').hidden = !message;
    $('saveStatus').classList.toggle('error', error);
  }
  function notice(message = '') { $('notice').textContent = message; $('notice').hidden = !message; }
  function remember(id) { try { localStorage.setItem(LAST, id); } catch (_) { /* IDB remains the source of truth. */ } }
  function title(record) { return record.fields.projNr.trim() || 'Ohne Projektnummer'; }
  function collect() {
    for (const id of FIELDS) active.fields[id] = $(id).value;
    active.samples = Array.from($('probenContainer').querySelectorAll('.sample'), block =>
      Object.fromEntries(SAMPLE_FIELDS.map(([name]) => [name, block.querySelector('.' + name).value])));
    $('activeProject').textContent = title(active);
    return active;
  }
  function changed() {
    collect(); dirty = true; editVersion++;
    status('Wird gespeichert …');
    void save();
  }
  async function refreshList(selected) {
    const records = await PNStore.list();
    const chosen = selected ?? ($('projectList').value || active?.id);
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const options = records.map(record => {
      const extra = record.fields.material || record.fields.projName;
      return new Option(title(record) + (extra ? ' · ' + extra : ''), record.id);
    });
    $('projectList').replaceChildren(new Option(records.length ? 'Projekt auswählen …' : 'Noch keine gespeicherten Protokolle', ''), ...options);
    $('projectList').value = records.some(r => r.id === chosen) ? chosen : '';
    return records;
  }
  function save(force = false) {
    const job = saveQueue.then(async () => {
      if (!dirty && !force) return true;
      const snapshot = structuredClone(collect());
      const version = editVersion;
      try {
        const record = await PNStore.write(snapshot, active.revision);
        active.revision = record.revision; active.updatedAt = record.updatedAt;
        if (version === editVersion) dirty = false;
        remember(active.id);
        $('conflictActions').hidden = true;
        await refreshList();
        status(dirty ? 'Wird gespeichert …' : 'Auf diesem Gerät gespeichert · ' + new Date(record.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        return true;
      } catch (error) {
        dirty = true;
        if (error.code === 'DUPLICATE') {
          status('Nicht gespeichert: Diese Projektnummer ist bereits vorhanden. Bitte eine andere Nummer eintragen oder deinen Stand als Kopie behalten.', true);
        } else if (error.code === 'CONFLICT') {
          status('Nicht gespeichert: Dieses Projekt wurde in einem anderen Tab geändert oder gelöscht. Dein Stand bleibt hier erhalten. Speichere ihn als Kopie, bevor du wechselst.', true);
        } else {
          status('Speichern nicht möglich. Deine Eingaben bleiben hier geöffnet. Bitte eine Sicherung herunterladen und verfügbaren Gerätespeicher bzw. Browser-Einstellungen prüfen.', true);
        }
        $('conflictActions').hidden = !['DUPLICATE', 'CONFLICT'].includes(error.code);
        console.error('PN98 speichern:', error);
        return false;
      }
    });
    saveQueue = job.catch(() => false);
    return saveQueue;
  }
  async function action(fn) {
    if (busy) return;
    busy = true; notice();
    $('protocolFields').disabled = true;
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach(button => { button.disabled = true; });
    try { await saveQueue; await fn(); }
    catch (error) { notice(error.code === 'CONFLICT' ? 'Das Projekt wurde in einem anderen Tab geändert oder gelöscht. Bitte den aktuellen Stand erneut öffnen, bevor du es löschst.' : error.message || 'Die Aktion konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten.'); console.error(error); }
    finally { busy = false; $('protocolFields').disabled = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  function makeField([name, labelText, kind], value, index) {
    const label = document.createElement('label'); label.textContent = labelText;
    const control = document.createElement(Array.isArray(kind) ? 'select' : kind === 'textarea' ? 'textarea' : 'input');
    control.className = name; control.id = 'sample' + index + '_' + name;
    if (Array.isArray(kind)) {
      kind.forEach(text => control.add(new Option(text, text)));
      if (value && !kind.includes(value)) control.add(new Option(value, value));
    }
    control.value = value ?? (Array.isArray(kind) ? kind[0] : '');
    label.append(control); return label;
  }
  function photoControl(key, text) {
    const div = document.createElement('div'); div.className = 'photo';
    const label = document.createElement('label'); label.textContent = text;
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.id = 'file_' + key;
    const img = document.createElement('img'); img.id = 'img_' + key; img.alt = text; img.hidden = !active.images[key];
    if (active.images[key]) img.src = active.images[key];
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = text + ' entfernen'; remove.hidden = !active.images[key];
    input.addEventListener('change', () => action(async () => {
      const file = input.files[0]; if (!file) return;
      const data = await compressImage(file);
      active.images[key] = data; img.src = data; img.hidden = false; remove.hidden = false; input.value = '';
      changed(); await save();
    }));
    remove.addEventListener('click', () => action(async () => {
      if (!confirm(text + ' aus diesem Protokoll entfernen?')) return;
      delete active.images[key]; img.removeAttribute('src'); img.hidden = true; remove.hidden = true; input.value = '';
      changed(); await save();
    }));
    label.append(input); div.append(label, img, remove); return div;
  }
  function renderSamples() {
    const container = $('probenContainer'); container.replaceChildren();
    if (!active.samples.length) { const p = document.createElement('p'); p.textContent = 'Noch keine Mischproben angelegt.'; container.append(p); }
    active.samples.forEach((sample, index) => {
      const block = document.createElement('article'); block.className = 'sample';
      const heading = document.createElement('h3'); heading.textContent = 'Mischprobe ' + (index + 1);
      const fields = document.createElement('div'); fields.className = 'field-grid';
      SAMPLE_FIELDS.forEach(field => fields.append(makeField(field, sample[field[0]], index + 1)));
      const photos = document.createElement('div'); photos.className = 'field-grid';
      photos.append(photoControl('p' + (index + 1) + '_1', 'Foto 1'), photoControl('p' + (index + 1) + '_2', 'Foto 2'));
      block.append(heading, fields, photos); container.append(block);
    });
  }
  function render(record) {
    active = record; dirty = false; editVersion++;
    for (const id of FIELDS) {
      const field = $(id), value = record.fields[id] ?? defaults[id];
      if (field.tagName === 'SELECT' && !Array.from(field.options).some(o => o.value === value)) field.add(new Option(value, value));
      field.value = value;
    }
    $('pilePhotos').replaceChildren(photoControl('h1', 'Foto Haufwerk 1'), photoControl('h2', 'Foto Haufwerk 2'));
    renderSamples(); $('activeProject').textContent = title(record); $('conflictActions').hidden = true;
    status('');
  }
  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const factor = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * factor)); canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .75);
    } catch (_) { throw new Error('Das Foto konnte nicht gelesen werden. Bitte ein JPG-, PNG- oder WebP-Foto auswählen.'); }
    finally { URL.revokeObjectURL(url); }
  }
  function download(data, type, filename) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function validateBackup(payload) {
    if (payload?.app !== 'bauanalytix-pn98' || payload.version !== 1 || !Array.isArray(payload.projects) || payload.projects.length > 1000) throw new Error('Diese Datei ist keine unterstützte PN98-Sicherung.');
    const string = value => { if (typeof value !== 'string' || value.length > 50000) throw new Error('Die Sicherung enthält ungültige Felder.'); return value; };
    return payload.projects.map(record => {
      if (!record?.fields || !Array.isArray(record.samples) || record.samples.length > 200 || !record.images || typeof record.images !== 'object') throw new Error('Die Sicherung enthält ein ungültiges Protokoll.');
      const fields = Object.fromEntries(FIELDS.map(key => [key, string(record.fields[key] ?? '')]));
      if (fields.projNr.length > 100) throw new Error('Eine Projektnummer ist zu lang.');
      const samples = record.samples.map(sample => Object.fromEntries(SAMPLE_FIELDS.map(([key]) => [key, string(sample[key] ?? '')])));
      const images = {};
      const allowed = new Set(['h1', 'h2', ...samples.flatMap((_, i) => ['p' + (i + 1) + '_1', 'p' + (i + 1) + '_2'])]);
      for (const [key, data] of Object.entries(record.images)) {
        if (!allowed.has(key) || typeof data !== 'string' || data.length > 12000000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(data)) throw new Error('Die Sicherung enthält ein ungültiges Foto.');
        images[key] = data;
      }
      return { id: uuid(), revision: 0, fields, samples, images };
    });
  }
  $('protocolForm').addEventListener('submit', event => event.preventDefault());
  $('protocolForm').addEventListener('input', event => { if (event.target.type !== 'file' && !busy) changed(); });
  $('saveProject').addEventListener('click', () => action(async () => {
    await save(true); navigator.storage?.persist?.().catch(() => {});
  }));
  $('newProject').addEventListener('click', () => action(async () => {
    if (!await save()) return;
    render(newRecord()); remember(''); await refreshList(active.id); $('projNr').focus();
  }));
  $('copyProject').addEventListener('click', () => action(async () => {
    const selected = $('projectList').value || active.id;
    if (!await save()) return;
    const records = await PNStore.list();
    if (!records.length) { notice('Bitte zuerst ein Projekt als Vorlage speichern.'); return; }
    records.sort((a, b) => title(a).localeCompare(title(b), 'de', { numeric: true }));
    $('copySource').replaceChildren(...records.map(record => new Option(title(record) + (record.fields.projName ? ' · ' + record.fields.projName : ''), record.id)));
    if (records.some(record => record.id === selected)) $('copySource').value = selected;
    $('copyNumber').value = ''; $('copyError').hidden = true;
    $('copyDialog').showModal(); $('copyNumber').focus();
  }));
  $('cancelCopy').addEventListener('click', () => $('copyDialog').close());
  $('copyDialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('copyForm').addEventListener('submit', event => {
    event.preventDefault();
    void action(async () => {
      const sourceId = $('copySource').value, number = $('copyNumber').value.trim();
      $('copyError').hidden = true; $('copyFields').disabled = true;
      try {
        if (!number) throw new Error('Bitte eine neue Projektnummer eingeben.');
        const source = await PNStore.get(sourceId);
        if (!source) throw new Error('Die Vorlage wurde inzwischen gelöscht. Bitte ein anderes Projekt auswählen.');
        const copy = newRecord();
        copy.fields = { ...source.fields, projNr: number };
        copy.samples = source.samples.map(sample => ({
          ...Object.fromEntries(SAMPLE_FIELDS.map(([key]) => [key, ''])), pid: sample.pid || ''
        }));
        copy.images = {};
        // Persist a separate record before leaving the current project. Never write to the source.
        const saved = await PNStore.write(copy, 0);
        render(saved); remember(saved.id); await refreshList(saved.id);
        $('copyDialog').close(); $('projNr').focus();
      } catch (error) {
        $('copyError').textContent = error.code === 'DUPLICATE'
          ? 'Diese Projektnummer ist bereits vorhanden. Bitte eine andere Nummer verwenden.'
          : error.name === 'QuotaExceededError' ? 'Das neue Projekt konnte wegen fehlendem Speicherplatz nicht angelegt werden. Die Vorlage bleibt erhalten.'
          : error.message || 'Das neue Projekt konnte nicht angelegt werden. Die Vorlage bleibt erhalten.';
        $('copyError').hidden = false;
      } finally { $('copyFields').disabled = false; }
    });
  });
  $('openProject').addEventListener('click', () => action(async () => {
    const id = $('projectList').value; if (!id) { notice('Bitte zuerst ein gespeichertes Protokoll auswählen.'); return; }
    if (!await save()) return;
    const record = await PNStore.get(id);
    if (!record) { await refreshList(); notice('Dieses Projekt wurde inzwischen gelöscht.'); return; }
    render(record); remember(id); await refreshList(id);
  }));
  $('deleteProject').addEventListener('click', () => action(async () => {
    if (!confirm('Projekt „' + title(active) + '“ mit allen Eingaben und Fotos von diesem Gerät löschen? Bereits heruntergeladene PDFs und Sicherungen bleiben erhalten.')) return;
    if (active.revision) await PNStore.write(active, active.revision, true);
    render(newRecord()); remember(''); await refreshList(active.id); notice('Projekt gelöscht.');
  }));
  $('saveConflictCopy').addEventListener('click', () => action(async () => {
    collect(); active.id = uuid(); active.revision = 0;
    active.fields.projNr = (active.fields.projNr.trim() || 'Protokoll').slice(0, 60) + '-Kopie-' + Date.now();
    $('projNr').value = active.fields.projNr; dirty = true; editVersion++; await save();
  }));
  $('generateSamples').addEventListener('click', () => action(async () => {
    collect(); const count = Number($('mp').value);
    if (!Number.isInteger(count) || count < 1 || count > 200) { notice('Bitte eine ganze Anzahl von 1 bis 200 Mischproben eingeben.'); return; }
    if (count < active.samples.length && !confirm('Die letzten ' + (active.samples.length - count) + ' Mischproben samt Eingaben und Fotos entfernen?')) return;
    const old = active.samples;
    active.samples = Array.from({ length: count }, (_, i) => old[i] || Object.fromEntries(SAMPLE_FIELDS.map(([key, , kind]) => [key, Array.isArray(kind) ? kind[0] : ''])));
    for (const key of Object.keys(active.images)) { const match = /^p(\d+)_/.exec(key); if (match && Number(match[1]) > count) delete active.images[key]; }
    renderSamples(); changed(); await save();
  }));
  $('exportBackup').addEventListener('click', () => action(async () => {
    await save();
    let records;
    try { records = await PNStore.all(); } catch (_) { records = []; }
    if (dirty || !active.revision) {
      const snapshot = structuredClone(collect());
      if (dirty) { snapshot.id = uuid(); snapshot.fields.projNr = (snapshot.fields.projNr || 'Protokoll').slice(0, 60) + '-Ungesichert-' + Date.now(); }
      if (dirty || Object.entries(snapshot.fields).some(([key, val]) => key !== 'datum' && val !== defaults[key])) records.push(snapshot);
    }
    download(JSON.stringify({ app: 'bauanalytix-pn98', version: 1, exportedAt: new Date().toISOString(), projects: records }, null, 2), 'application/json', 'PN98_Sicherung_' + new Date().toISOString().slice(0, 10) + '.json');
    $('backupStatus').textContent = records.length + ' Protokoll(e) als Sicherung heruntergeladen.';
  }));
  $('importBackup').addEventListener('click', () => $('backupFile').click());
  $('backupFile').addEventListener('change', () => action(async () => {
    const file = $('backupFile').files[0]; $('backupFile').value = ''; if (!file) return;
    if (file.size > 200 * 1024 * 1024) throw new Error('Die Sicherung ist größer als 200 MB und kann hier nicht eingelesen werden.');
    const records = validateBackup(JSON.parse(await file.text()));
    if (!await save()) return;
    const result = await PNStore.addMissing(records); await refreshList();
    $('backupStatus').textContent = result.added + ' Protokoll(e) eingelesen. ' + result.skipped + ' bereits vorhandene Projektnummer(n) unverändert übersprungen.';
  }));
  $('createPDF').addEventListener('click', () => action(async () => {
    collect();
    if (!active.fields.projNr.trim()) { notice('Bitte vor der PDF-Erstellung eine Projektnummer eintragen.'); return; }
    await save();
    await PNExport.createPDF(structuredClone(active));
  }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && active && dirty) void save(); });
  window.addEventListener('pagehide', () => { if (active && dirty) void save(); });
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  function connectionStatus() { $('offlineStatus').textContent = offlineReady ? (navigator.onLine ? 'Offline bereit' : 'Offline · bereit') : (navigator.onLine ? 'Offline-Vorbereitung läuft …' : 'Offline noch nicht bereit'); }
  window.addEventListener('online', connectionStatus); window.addEventListener('offline', connectionStatus);
  $('updateApp').addEventListener('click', () => action(async () => {
    if (!await save()) return;
    const waiting = (await navigator.serviceWorker.getRegistration())?.waiting;
    if (waiting) { updating = true; waiting.postMessage('ACTIVATE_UPDATE'); }
  }));
  async function setupOffline() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offlineStatus').textContent = 'Offline-Modus benötigt HTTPS'; return; }
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const showUpdate = () => { $('updateApp').hidden = !registration.waiting; };
      showUpdate(); registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') showUpdate(); });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); else showUpdate(); });
      await navigator.serviceWorker.ready; offlineReady = true; connectionStatus(); showUpdate();
    } catch (error) { $('offlineStatus').textContent = 'Offline-Vorbereitung fehlgeschlagen'; console.error(error); }
  }
  async function start() {
    busy = true;
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach(button => { button.disabled = true; });
    try {
      await PNStore.open();
      let last = ''; try { last = localStorage.getItem(LAST); } catch (_) {}
      const record = last ? await PNStore.get(last) : null;
      render(record || newRecord()); await refreshList();
    } catch (error) {
      render(newRecord()); status('Lokaler Speicher nicht verfügbar. Bitte kein privates Browserfenster verwenden. Eingaben bei Bedarf als Sicherung herunterladen.', true); console.error(error);
    }
    $('protocolFields').disabled = false;
    busy = false; buttons.forEach(button => { button.disabled = false; });
    void setupOffline();
  }
  void start();
})();
