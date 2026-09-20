'use strict';
window.PNExport = (() => {
  async function createPDF(record) {
    if (!window.jspdf?.jsPDF) throw new Error('Die PDF-Funktion ist noch nicht geladen. Bitte die App einmal mit Internet öffnen.');
    const doc = new window.jspdf.jsPDF();
    const fields = record.fields;
    const left = 20, valueLeft = 90, right = 190, bottom = 275;
    let y = 32, logo;
    try {
      const image = document.getElementById('logoImg'); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      logo = { data: canvas.toDataURL('image/jpeg', .7), ratio: image.naturalHeight / image.naturalWidth };
    } catch (_) { /* Protocol content remains available if the logo cannot load. */ }
    function header() {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(doc.splitTextToSize('PN98 · ' + fields.projNr, 120).slice(0, 2), left, 14);
      if (logo) doc.addImage(logo.data, 'JPEG', 150, 5, 30, 30 * logo.ratio);
      doc.setDrawColor(90); doc.line(left, 23, right, 23);
    }
    function page() { doc.addPage(); y = 32; header(); }
    function ensure(height) { if (y + height > bottom) page(); }
    function heading(text) {
      ensure(18); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(text, left, y); y += 9;
    }
    function row(label, value) {
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value || ''), right - valueLeft);
      doc.setFont('helvetica', 'bold');
      const labelLines = doc.splitTextToSize(label, valueLeft - left - 5);
      const count = Math.max(lines.length, labelLines.length);
      for (let offset = 0; offset < count;) {
        ensure(10);
        const available = Math.max(1, Math.floor((bottom - y - 3) / 5));
        const length = Math.min(available, count - offset);
        doc.setFont('helvetica', 'bold');
        const labelChunk = labelLines.slice(offset, offset + length);
        if (labelChunk.length) doc.text(labelChunk, left, y);
        doc.setFont('helvetica', 'normal');
        const chunk = lines.slice(offset, offset + length);
        if (chunk.length) doc.text(chunk, valueLeft, y);
        y += length * 5; doc.setDrawColor(190); doc.line(left, y - 3, right, y - 3); y += 2;
        offset += length; if (offset < count) page();
      }
    }
    function photo(key, caption) {
      const data = record.images[key]; if (!data) return;
      const properties = doc.getImageProperties(data);
      const scale = Math.min(120 / properties.width, 88 / properties.height);
      const width = properties.width * scale, height = properties.height * scale;
      ensure(height + 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(caption, left, y); y += 5;
      doc.addImage(data, properties.fileType, left, y, width, height); y += height + 7;
    }
    header(); heading('1. Allgemeine Daten');
    [['Projektnummer:', 'projNr'], ['Projekt:', 'projName'], ['Auftraggeber:', 'auftraggeber'], ['Ort:', 'ort'], ['Datum:', 'datum'], ['Verantwortlich:', 'verantwortlich'], ['Anlass:', 'anlass'], ['Nutzung:', 'nutzung'], ['Versiegelung:', 'versiegelung'], ['Bemerkungen:', 'bem']].forEach(([label, key]) => row(label, fields[key]));
    y += 6; heading('2. Haufwerk');
    row('Material:', fields.material); row('AVV:', fields.avv); row('Volumen:', fields.vol);
    row('Lagerart:', [fields.lagerart, fields.lagerart_text].filter(Boolean).join(' '));
    row('Lagerform:', [fields.lagerform, fields.lagerform_text].filter(Boolean).join(' '));
    [['Korn:', 'korn'], ['Berechnung:', 'volmeth'], ['Schadstoffe:', 'schad'], ['EP:', 'ep'], ['MP:', 'mp'], ['LP:', 'lp'], ['Reduktion:', 'red'], ['Reduziert auf:', 'lpr']].forEach(([label, key]) => row(label, fields[key]));
    photo('h1', 'Foto Haufwerk 1'); photo('h2', 'Foto Haufwerk 2');
    if (record.samples.length) {
      record.samples.forEach((sample, i) => {
        page(); heading('3. Mischproben · Mischprobe ' + (i + 1));
        [['Sektor:', 'sektor'], ['ID:', 'pid'], ['Material:', 'mat'], ['Konsistenz:', 'kons'], ['Geruch:', 'ger'], ['Fremdbestandteile mineralisch:', 'fm'], ['Fremdbestandteile nicht mineralisch:', 'fn'], ['Volumen:', 'volp'], ['Position:', 'pos'], ['Art:', 'art'], ['Besonderheiten:', 'bes']].forEach(([label, key]) => row(label, sample[key]));
        photo('p' + (i + 1) + '_1', 'Mischprobe ' + (i + 1) + ' · Foto 1');
        photo('p' + (i + 1) + '_2', 'Mischprobe ' + (i + 1) + ' · Foto 2');
      });
    } else { y += 6; heading('3. Mischproben'); }
    const pages = doc.getNumberOfPages();
    for (let number = 1; number <= pages; number++) {
      doc.setPage(number); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('Seite ' + number + ' von ' + pages, right, 288, { align: 'right' });
    }
    const safeName = fields.projNr.trim().replace(/[^a-zA-Z0-9äöüÄÖÜß._-]+/g, '_').slice(0, 100);
    doc.save('PN98_' + safeName + '.pdf');
  }
  return { createPDF };
})();
