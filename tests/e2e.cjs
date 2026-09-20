/* Real Chromium checks: persistence, photos, conflicts, offline, backup and PDF. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const qa = process.env.PN98_QA_DIR || path.resolve(root, '..', 'PN98-QA-20260920');
const basePath = '/LAGA-PN98/';
let context, server, swRevision = '';
const checks = [];
const check = text => { checks.push(text); console.log('OK ' + text); };
const waitSaved = page => page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Auf diesem Gerät gespeichert'));
const records = page => page.evaluate(() => PNStore.all());
async function selectProject(page, number) {
  const id = (await records(page)).find(r => r.fields.projNr === number)?.id;
  assert.ok(id, number);
  await page.selectOption('#projectList', id);
  await page.click('#openProject');
  await page.waitForFunction(number => document.querySelector('#projNr').value === number, number);
  await page.waitForFunction(() => !document.querySelector('#protocolFields').disabled);
}
async function dialog(page, accept, click) {
  page.once('dialog', d => accept ? d.accept() : d.dismiss());
  await click(); await page.waitForFunction(() => !document.querySelector('#protocolFields').disabled);
}
async function run() {
  await fs.mkdir(qa, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pn98-test-'));
  server = http.createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(req.url.split('?')[0]);
      if (!name.startsWith(basePath)) { res.writeHead(404); res.end(); return; }
      name = name.slice(basePath.length) || 'index.html';
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      let data = await fs.readFile(file);
      if (name === 'sw.js' && swRevision) data = Buffer.from(data.toString().replace(/bauanalytix-pn98-shell-[^']+/, 'bauanalytix-pn98-shell-' + swRevision));
      const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' };
      res.writeHead(200, { 'Content-Type': (types[path.extname(name)] || 'application/octet-stream'), 'Cache-Control': 'no-store' }); res.end(data);
    } catch (_) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + basePath;
  const options = { headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true };
  if (process.env.PN98_BROWSER_CHANNEL) options.channel = process.env.PN98_BROWSER_CHANNEL;
  context = await chromium.launchPersistentContext(profile, options);
  let page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#protocolFields').disabled);
  await page.waitForFunction(() => document.querySelector('#offlineStatus').textContent === 'Offline bereit');
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, './');
  check('App and all offline assets installed at a repository subpath');
  const numbers = ['TEST-3p', 'TEST-3q', 'TEST-3r', 'TEST-3s'];
  for (let i = 0; i < numbers.length; i++) {
    if (i) { await page.click('#newProject'); await page.waitForFunction(() => document.querySelector('#projNr').value === ''); }
    await page.fill('#projNr', numbers[i]);
    await page.fill('#projName', 'Prüfung Haufwerk ' + (i + 1));
    await page.fill('#datum', '22.09.2026, 10:00');
    await page.fill('#material', 'Schüttung Haufwerk ' + (i + 1));
    await page.fill('#ep', '12'); await page.fill('#mp', '3'); await page.fill('#lp', '3');
    await page.click('#generateSamples');
    await page.waitForFunction(() => document.querySelectorAll('.sample').length === 3 && !document.querySelector('#protocolFields').disabled);
    for (let j = 1; j <= 3; j++) {
      await page.fill('#sample' + j + '_pid', 'TEST-DEK-' + (33 + 3 * i + j - 1));
      await page.fill('#sample' + j + '_mat', 'Material Probe ' + j);
    }
    await waitSaved(page);
  }
  assert.equal((await records(page)).length, 4); check('Four independent projects auto-save with three samples each');
  await selectProject(page, 'TEST-3p');
  await page.setInputFiles('#file_h1', path.join(root, 'icons', 'icon-192.png'));
  await page.waitForFunction(() => document.querySelector('#img_h1').getAttribute('src')?.startsWith('data:image/jpeg'));
  await page.setInputFiles('#file_p3_2', path.join(root, 'icons', 'icon-512.png'));
  await page.waitForFunction(() => document.querySelector('#img_p3_2').getAttribute('src')?.startsWith('data:image/jpeg'));
  await waitSaved(page);
  await page.fill('#mp', '4'); await page.click('#generateSamples');
  await page.waitForFunction(() => document.querySelectorAll('.sample').length === 4);
  assert.equal(await page.inputValue('#sample1_pid'), 'TEST-DEK-33'); assert.equal(await page.inputValue('#sample3_pid'), 'TEST-DEK-35');
  await page.fill('#mp', '3');
  await dialog(page, false, () => page.click('#generateSamples'));
  assert.equal(await page.locator('.sample').count(), 4);
  await dialog(page, true, () => page.click('#generateSamples'));
  assert.equal(await page.locator('.sample').count(), 3);
  await waitSaved(page); check('Sample expansion preserves inputs/photos; reduction requires confirmation');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#projNr').value === 'TEST-3p');
  assert.equal(await page.inputValue('#datum'), '22.09.2026, 10:00');
  assert.equal(await page.inputValue('#sample3_pid'), 'TEST-DEK-35');
  assert.ok(await page.locator('#img_p3_2').getAttribute('src'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(qa, 'mobile-start.png') });
  await page.locator('#samplesTitle').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(qa, 'mobile-samples.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  check('Reload restores project, exact sampling date, samples and photos; mobile view does not overflow');
  await context.close(); context = await chromium.launchPersistentContext(profile, options); page = await context.newPage();
  await context.setOffline(true); await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#projNr').value === 'TEST-3p');
  await page.fill('#bem', 'Offline ergänzt. ' + 'Eine längere Bemerkung bleibt vollständig lesbar. '.repeat(25)); await waitSaved(page);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#bem').value.startsWith('Offline ergänzt.'));
  let downloadEvent = page.waitForEvent('download'); await page.click('#createPDF');
  let download = await downloadEvent; assert.equal(download.suggestedFilename(), 'PN98_TEST-3p.pdf');
  await download.saveAs(path.join(qa, 'PN98_TEST-3p.pdf'));
  assert.ok((await fs.stat(path.join(qa, 'PN98_TEST-3p.pdf'))).size > 10000);
  check('Browser restart and offline reload preserve data; offline PDF download succeeds with long text/photos');
  await context.setOffline(false);
  await page.locator('summary', { hasText: 'Sicherung und Gerätewechsel' }).click();
  downloadEvent = page.waitForEvent('download'); await page.click('#exportBackup'); download = await downloadEvent;
  const backup = path.join(qa, 'backup.json'); await download.saveAs(backup);
  const payload = JSON.parse(await fs.readFile(backup, 'utf8')); assert.equal(payload.projects.length, 4);
  assert.ok(payload.projects.find(r => r.fields.projNr === 'TEST-3p').images.p3_2);
  await dialog(page, false, () => page.click('#deleteProject')); assert.equal((await records(page)).length, 4);
  await dialog(page, true, () => page.click('#deleteProject')); assert.equal((await records(page)).length, 3);
  await page.setInputFiles('#backupFile', backup);
  await page.waitForFunction(() => document.querySelector('#backupStatus').textContent.startsWith('1 Protokoll(e) eingelesen. 3'));
  assert.equal((await records(page)).length, 4);
  await selectProject(page, 'TEST-3p'); assert.ok(await page.locator('#img_p3_2').getAttribute('src'));
  check('Backup includes photos; delete cancellation works; restore adds only missing projects');
  await selectProject(page, 'TEST-3q'); await page.fill('#projNr', '  test-3P  ');
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('bereits vorhanden'));
  await page.click('#newProject'); assert.equal(await page.inputValue('#projNr'), '  test-3P  ');
  assert.equal((await records(page)).find(r => r.fields.projNr === 'TEST-3p').fields.material, 'Schüttung Haufwerk 1');
  await page.fill('#projNr', 'TEST-3q'); await waitSaved(page);
  check('Duplicate project numbers cannot overwrite another project or be silently discarded on switching');
  await selectProject(page, 'TEST-3p'); const other = await context.newPage(); await other.goto(url);
  await other.waitForFunction(() => document.querySelector('#projNr').value === 'TEST-3p');
  await page.fill('#bem', 'Stand Tab eins'); await waitSaved(page);
  await other.fill('#bem', 'Stand Tab zwei');
  await other.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('anderen Tab'));
  assert.equal((await records(page)).find(r => r.fields.projNr === 'TEST-3p').fields.bem, 'Stand Tab eins');
  await other.click('#saveConflictCopy'); await waitSaved(other);
  assert.ok((await other.inputValue('#projNr')).startsWith('TEST-3p-Kopie-'));
  assert.equal((await records(page)).length, 5); await other.close();
  check('Concurrent tabs detect stale writes and retain the alternate state as a separate copy');
  await page.evaluate(() => { window.originalWrite = PNStore.write; PNStore.write = async () => { throw new DOMException('Test quota', 'QuotaExceededError'); }; });
  await page.fill('#bem', 'Auch bei vollem Speicher nicht verlieren');
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.includes('Speichern nicht möglich'));
  await page.click('#newProject'); assert.equal(await page.inputValue('#bem'), 'Auch bei vollem Speicher nicht verlieren');
  downloadEvent = page.waitForEvent('download'); await page.click('#exportBackup'); download = await downloadEvent;
  const recovery = path.join(qa, 'recovery.json'); await download.saveAs(recovery);
  assert.ok(JSON.parse(await fs.readFile(recovery, 'utf8')).projects.some(r => r.fields.bem === 'Auch bei vollem Speicher nicht verlieren'));
  await page.evaluate(() => { PNStore.write = window.originalWrite; }); await page.click('#saveProject'); await waitSaved(page);
  check('Storage failure stays visible, blocks destructive switching and permits recovery backup');
  const invalid = path.join(qa, 'invalid.json'); await fs.writeFile(invalid, JSON.stringify({ app: 'bauanalytix-pn98', version: 1, projects: [{ fields: {}, samples: [], images: { h1: 'https://example.com/photo.jpg' } }] }));
  await page.setInputFiles('#backupFile', invalid);
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('ungültiges Foto'));
  assert.equal((await records(page)).length, 5); check('Invalid imports cannot inject remote images or change existing records');
  await page.fill('#bem', 'Vor App-Update gespeichert'); await waitSaved(page);
  swRevision = 'v2-test-update';
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(() => !document.querySelector('#updateApp').hidden);
  await page.click('#updateApp');
  await page.waitForFunction(() => document.querySelector('#bem')?.value === 'Vor App-Update gespeichert' && !document.querySelector('#protocolFields').disabled);
  await page.waitForFunction(async () => (await caches.keys()).includes('bauanalytix-pn98-shell-v2-test-update'));
  assert.equal((await records(page)).length, 5); check('App update activates after saving and preserves project storage');
  const source = (await records(page)).find(record => record.fields.projNr === 'TEST-3p');
  assert.equal(await page.locator('#installHelp').count(), 0);
  assert.equal(await page.locator('#saveStatus').isVisible(), false);
  assert.ok(await page.evaluate(() => document.querySelector('#createPDF').compareDocumentPosition(document.querySelector('#backupHelp')) & Node.DOCUMENT_POSITION_FOLLOWING));
  await page.click('#copyProject');
  await page.waitForFunction(() => document.querySelector('#copyDialog').open);
  await page.screenshot({ path: path.join(qa, 'mobile-copy.png') });
  await page.click('#cancelCopy'); assert.equal((await records(page)).length, 5);
  await page.click('#copyProject'); await page.fill('#copyNumber', ' test-3Q ');
  await page.click('#copyForm button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#copyError').hidden);
  assert.equal((await records(page)).length, 5);
  assert.equal(await page.inputValue('#projNr'), 'TEST-3p');
  await page.fill('#copyNumber', 'TEST-NEU'); await page.click('#copyForm button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#copyDialog').open && !document.querySelector('#protocolFields').disabled);
  assert.equal(await page.inputValue('#projNr'), 'TEST-NEU');
  const copied = (await records(page)).find(record => record.fields.projNr === 'TEST-NEU');
  assert.notEqual(copied.id, source.id);
  assert.deepEqual(copied.fields, { ...source.fields, projNr: 'TEST-NEU' });
  assert.deepEqual(copied.images, {});
  assert.equal(copied.samples.length, 3);
  copied.samples.forEach((sample, index) => {
    assert.equal(sample.pid, source.samples[index].pid);
    assert.ok(Object.entries(sample).every(([key, value]) => key === 'pid' || value === ''));
  });
  assert.deepEqual((await records(page)).find(record => record.id === source.id), source);
  await page.fill('#sample1_pid', 'TEST-NEU-01'); await waitSaved(page);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#sample1_pid')?.value === 'TEST-NEU-01');
  assert.deepEqual((await records(page)).find(record => record.id === source.id), source);
  check('Project copy preserves source and sample IDs, excludes photos/findings, rejects duplicate numbers and survives reload');
  await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(qa, 'desktop.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(qa, 'results.json'), JSON.stringify({ passed: checks.length, checks }, null, 2));
  console.log('PASS ' + checks.length + ' checks');
}
run().catch(async error => {
  console.error(error); process.exitCode = 1;
  for (const [i, page] of (context?.pages() || []).entries()) {
    console.error('PAGE', i, await page.evaluate(() => ({ number: document.querySelector('#projNr')?.value, status: document.querySelector('#saveStatus')?.textContent, notice: document.querySelector('#notice')?.textContent })).catch(() => null));
  }
}).finally(async () => { if (context) await context.close(); if (server) await new Promise(resolve => server.close(resolve)); });
