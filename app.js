'use strict';
/* Finanzas Familiares — PWA de control de gastos con tope mensual. Datos en localStorage. */

const LS_KEY = 'finanzas-familiares-v1';
const APP_VERSION = '3.1';
const DEFAULT_CATS = ['Comida', 'Transporte', 'Casa', 'Salud', 'Suscripciones', 'Compras', 'Niños', 'Otros'];
const CAT_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#2dd4bf', '#f472b6', '#9ca3af'];
const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">';
const CAT_SVG = {
  'Comida': '<path d="M4 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M20 15V2a4 4 0 0 0-4 4v6a2 2 0 0 0 2 2h2zm0 0v7"/>',
  'Transporte': '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M4 11h16a1 1 0 0 1 1 1v5h-2"/><path d="M3 12v5h2"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M9.3 17.5h5.4"/>',
  'Casa': '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M10 20v-6h4v6"/>',
  'Salud': '<path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.3a5 5 0 1 1 7.5 6.3z"/><path d="M7 12h3l1.5-3 3 6L16 12h3"/>',
  'Suscripciones': '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'Compras': '<path d="M6 8h15l-1.2 11a1 1 0 0 1-1 .9H5.2a1 1 0 0 1-1-.9L3 8h3z"/><path d="M9 11V6a3 3 0 0 1 6 0v5"/>',
  'Niños': '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  'Otros': '<path d="M20.6 13.4 12.2 5a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v6.8c0 .5.2 1 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8z"/><path d="M7.5 7.5h.01"/>'
};
const PEOPLE_COLORS = { 'Ramiro': '#34d399', 'Nicole': '#a78bfa' };

// ---------- Nube (Firebase) ----------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBa4XTJo47f3ZutCwIabO89SNTopQqTljc",
  authDomain: "finanzas-bugueno.firebaseapp.com",
  projectId: "finanzas-bugueno",
  storageBucket: "finanzas-bugueno.firebasestorage.app",
  messagingSenderId: "745240953305",
  appId: "1:745240953305:web:37595a80c087fef80799c8"
};
let db = null, cloudOn = false;
let currentView = 'dash';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return Object.assign({ cap: 400, cats: DEFAULT_CATS.slice(), txs: [], ocrKey: '' }, JSON.parse(raw));
  } catch (e) {}
  return { cap: 400, cats: DEFAULT_CATS.slice(), txs: [], ocrKey: '' };
}
function persistLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
// save() histórico = guardado local (clave OCR y modo sin nube)
function save() { persistLocal(); }

// ---------- Operaciones de datos (nube o local) ----------
async function addTx(tx) {
  if (cloudOn && db) { try { await db.collection('gastos').doc(tx.id).set(tx); return; } catch (e) {} }
  state.txs.push(tx); persistLocal(); renderAll();
}
async function removeTx(id) {
  if (cloudOn && db) { try { await db.collection('gastos').doc(id).delete(); return; } catch (e) {} }
  state.txs = state.txs.filter(t => t.id !== id); persistLocal(); renderAll();
}
async function setCap(v) {
  state.cap = v;
  if (cloudOn && db) { try { await db.collection('config').doc('app').set({ cap: v }, { merge: true }); } catch (e) {} }
  else persistLocal();
  renderAll();
}
async function addCat(name) {
  if (!name || state.cats.includes(name)) return false;
  state.cats.push(name);
  if (cloudOn && db) { try { await db.collection('config').doc('app').set({ cats: state.cats }, { merge: true }); } catch (e) {} }
  else persistLocal();
  return true;
}
async function removeCatAt(i) {
  state.cats.splice(i, 1);
  if (cloudOn && db) { try { await db.collection('config').doc('app').set({ cats: state.cats }, { merge: true }); } catch (e) {} }
  else persistLocal();
}

async function initCloud() {
  try {
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return;
    if (typeof firebase === 'undefined') return;
    if (firebase.apps && firebase.apps.length) { db = firebase.firestore(); }
    else {
      firebase.initializeApp(FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    }
    cloudOn = true;
    await migrateLocalToCloud();
    db.collection('gastos').onSnapshot(snap => {
      const arr = [];
      snap.forEach(d => { const x = d.data(); x.id = d.id; arr.push(x); });
      state.txs = arr;
      renderAll();
      if (currentView === 'hist') renderHistory();
    });
    db.collection('config').doc('app').onSnapshot(doc => {
      if (doc.exists) {
        const c = doc.data() || {};
        if (typeof c.cap === 'number' && c.cap > 0) state.cap = c.cap;
        if (Array.isArray(c.cats) && c.cats.length) state.cats = c.cats;
        renderAll();
        if (currentView === 'hist') renderHistory();
      }
    });
  } catch (e) { cloudOn = false; db = null; }
}

async function migrateLocalToCloud() {
  try {
    if (localStorage.getItem('finanzas-migrated') === '1') return;
    const snap = await db.collection('gastos').limit(1).get();
    const cfg = await db.collection('config').doc('app').get();
    const batch = db.batch();
    let n = 0;
    if (snap.empty && state.txs.length) {
      state.txs.forEach(t => { batch.set(db.collection('gastos').doc(t.id), t); n++; });
    }
    if (!cfg.exists) {
      batch.set(db.collection('config').doc('app'), { cap: state.cap, cats: state.cats });
      n++;
    }
    if (n) await batch.commit();
    localStorage.setItem('finanzas-migrated', '1');
  } catch (e) {}
}

let state = load();
// vista: mes en formato YYYY-MM
let viewMonth = currentMonthKey();
let formPerson = 'Ramiro';
let editId = null;

function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MESES[m - 1] + ' ' + y;
}
function shiftMonth(key, delta) {
  let [y, m] = key.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return y + '-' + String(m).padStart(2, '0');
}
function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function uid() { return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
function catColor(cat) {
  const i = state.cats.indexOf(cat);
  return CAT_COLORS[(i < 0 ? 7 : i) % CAT_COLORS.length];
}
function catIcon(cat) {
  const p = CAT_SVG[cat];
  if (p) return SVG_OPEN + p + '</svg>';
  return SVG_OPEN + '<path d="M20.6 13.4 12.2 5a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v6.8c0 .5.2 1 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8z"/><path d="M7.5 7.5h.01"/>' + '</svg>';
}

// ---------- Dashboard ----------
function monthTxs() {
  return state.txs.filter(t => (t.date || '').slice(0, 7) === viewMonth);
}
function renderDashboard() {
  const txs = monthTxs();
  const total = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  const cap = Number(state.cap) || 0;
  const pct = cap > 0 ? Math.min(100, (total / cap) * 100) : 0;
  const left = cap - total;

  let ringColor = '#34d399', pill = 'ok', status = '';
  if (total > cap) { ringColor = '#f87171'; pill = 'over'; status = 'Te pasaste por ' + fmt(total - cap); }
  else if (cap > 0 && total / cap >= 0.8) { ringColor = '#fbbf24'; pill = 'warn'; status = 'Quedan ' + fmt(left) + ' · cuidado'; }
  else { status = 'Te quedan ' + fmt(left) + ' este mes'; }

  const R = 54, CIRC = 2 * Math.PI * R;
  let html = '<div class="hero"><div class="hero-top"><div>' +
    '<div class="hero-label">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<div class="hero-amount">' + fmt(total) + '</div>' +
    '<div class="hero-cap">de ' + fmt(cap) + ' · ' + txs.length + ' gastos</div></div>' +
    '<div class="ring-wrap"><svg viewBox="0 0 120 120" class="ring">' +
    '<circle cx="60" cy="60" r="' + R + '" class="ring-bg"/>' +
    '<circle cx="60" cy="60" r="' + R + '" class="ring-fg" style="stroke:' + ringColor +
    ';stroke-dasharray:' + CIRC.toFixed(1) + ';stroke-dashoffset:' + (CIRC * (1 - pct / 100)).toFixed(1) + '"/>' +
    '</svg><div class="ring-pct">' + Math.round(pct) + '%</div></div></div>' +
    '<div><span class="statuspill ' + pill + '">' + esc(status) + '</span></div></div>';

  // Por categoría
  const byCat = {};
  txs.forEach(t => { byCat[t.cat] = (byCat[t.cat] || 0) + Number(t.amount || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  html += '<div class="card"><h2>Por categoría</h2>';
  if (!cats.length) html += '<div class="empty">Sin gastos este mes.</div>';
  const maxCat = cats.length ? cats[0][1] : 1;
  cats.forEach(([c, v]) => {
    const cc = catColor(c);
    html += '<div class="catrow"><div class="cico" style="color:' + cc + ';background:' + cc + '1c">' + catIcon(c) + '</div>' +
      '<div class="cinfo"><div class="cname">' + esc(c) + '</div>' +
      '<div class="cbar"><div style="width:' + (v / maxCat * 100).toFixed(1) + '%;background:' + catColor(c) + '"></div></div></div>' +
      '<div class="camt">' + fmt(v) + '</div></div>';
  });
  html += '</div>';

  // Por persona
  const byP = { Ramiro: 0, Nicole: 0 };
  txs.forEach(t => { if (byP[t.person] == null) byP[t.person] = 0; byP[t.person] += Number(t.amount || 0); });
  html += '<div class="card"><h2>Por persona</h2><div class="personrow">';
  PEOPLE.forEach(p => {
    const col = PEOPLE_COLORS[p] || '#0e9f6e';
    html += '<div class="person"><div class="avatar" style="background:' + col + '">' + esc(p[0]) + '</div>' +
      '<div class="pname">' + esc(p) + '</div><div class="pamt">' + fmt(byP[p] || 0) + '</div></div>';
  });
  html += '</div></div>';

  // Últimos movimientos
  const recent = txs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0)).slice(0, 5);
  html += '<div class="card"><h2>Últimos movimientos</h2>';
  if (!recent.length) html += '<div class="empty">Nada por aquí todavía.</div>';
  recent.forEach(t => { html += txRow(t); });
  html += '</div>';

  document.getElementById('dash').innerHTML =
    '<div class="monthnav"><button id="mPrev" aria-label="Mes anterior">‹</button>' +
    '<div class="mname">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<button id="mNext" aria-label="Mes siguiente">›</button></div>' + html;
  document.getElementById('mPrev').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderDashboard(); };
  document.getElementById('mNext').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderDashboard(); };
  bindDeleteButtons(document.getElementById('dash'));
}

function txRow(t) {
  const cc = catColor(t.cat);
  return '<div class="tx"><div class="cico" style="width:38px;height:38px;color:' + cc + ';background:' + cc + '1c">' + catIcon(t.cat) + '</div>' +
    '<div class="tinfo"><div class="tnote">' + esc(t.note || t.cat) + '</div>' +
    '<div class="tmeta">' + esc(t.date || '') + ' · ' + esc(t.cat || '') + ' · ' + esc(t.person || '') + '</div></div>' +
    '<div class="tamt">' + fmt(t.amount) + '</div>' +
    '<button class="tdel" data-del="' + t.id + '" aria-label="Eliminar">×</button></div>';
}
function bindDeleteButtons(root) {
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      if (confirm('¿Eliminar este gasto?')) removeTx(b.getAttribute('data-del'));
    };
  });
}

// ---------- Formulario ----------
function renderForm() {
  const cats = state.cats.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
  document.getElementById('form').innerHTML =
    '<div class="card"><h2>' + (editId ? 'Editar gasto' : 'Nuevo gasto') + '</h2>' +
    (editId ? '' :
      '<button class="btn ghost" id="fScan" style="margin-top:0">📷 Escanear boleta</button>' +
      '<input id="fFile" type="file" accept="image/*" style="display:none">' +
      '<div id="scanBox" style="display:none;margin-top:10px">' +
      '<img id="scanImg" style="width:100%;border-radius:10px;display:none">' +
      '<div class="progress" id="scanProg" style="display:none"><div style="width:0%"></div></div>' +
      '<div class="hint" id="scanMsg"></div>' +
      '<details id="ocrDebug" style="display:none;margin-top:8px"><summary class="hint" style="cursor:pointer">Ver texto detectado</summary>' +
      '<pre id="ocrText" style="white-space:pre-wrap;font-size:11px;background:#f3f6f5;border-radius:10px;padding:10px;max-height:180px;overflow:auto"></pre></details></div>') +
    '<label>Monto (USD)</label>' +
    '<input id="fAmount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">' +
    '<div id="amtChips" class="chips" style="display:none"></div>' +
    '<label>Categoría</label><select id="fCat">' + cats + '</select>' +
    '<label>Fecha</label><input id="fDate" type="date" value="' + todayISO() + '">' +
    '<label>¿Quién gastó?</label><div class="seg" id="fPerson">' +
    PEOPLE.map(p => '<button type="button" data-p="' + p + '" class="' + (p === formPerson ? 'on' : '') + '">' + p + '</button>').join('') +
    '</div>' +
    '<label>Nota (opcional)</label><input id="fNote" type="text" placeholder="Ej: súper de la semana" maxlength="80">' +
    '<button class="btn" id="fSave">' + (editId ? 'Guardar cambios' : 'Agregar gasto') + '</button>' +
    (editId ? '<button class="btn ghost" id="fCancel">Cancelar</button>' : '') +
    '</div>';

  document.querySelectorAll('#fPerson button').forEach(b => {
    b.onclick = () => {
      formPerson = b.getAttribute('data-p');
      document.querySelectorAll('#fPerson button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  document.getElementById('fSave').onclick = saveForm;
  const c = document.getElementById('fCancel');
  if (c) c.onclick = () => { editId = null; renderForm(); };
  const scanBtn = document.getElementById('fScan');
  if (scanBtn) {
    const fileInput = document.getElementById('fFile');
    scanBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => { if (fileInput.files[0]) scanReceipt(fileInput.files[0]); };
  }
}

function saveForm() {
  const amount = parseFloat(document.getElementById('fAmount').value);
  if (!(amount > 0)) { alert('Ingresa un monto válido.'); return; }
  const cat = document.getElementById('fCat').value;
  const date = document.getElementById('fDate').value || todayISO();
  const note = document.getElementById('fNote').value.trim();
  if (editId) {
    const t = state.txs.find(x => x.id === editId);
    if (t) {
      t.amount = amount; t.cat = cat; t.date = date; t.note = note; t.person = formPerson;
      if (cloudOn && db) { db.collection('gastos').doc(t.id).set(t).catch(() => {}); }
      else persistLocal();
    }
    editId = null;
  } else {
    addTx({ id: uid(), amount: Math.round(amount * 100) / 100, cat, date, note, person: formPerson, ts: Date.now() });
  }
  viewMonth = date.slice(0, 7);
  renderForm();
  showView('dash');
  const txs = monthTxs();
  const total = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  if (total > Number(state.cap)) alert('Ojo: con este gasto superas el tope de ' + fmt(state.cap) + '.');
}

// ---------- Escáner de boletas (OCR en el dispositivo) ----------
// ---------- Escáner de boletas (OCR en el dispositivo) ----------
function withTimeout(promise, ms, tag) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))
  ]);
}

function preprocessImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(im.width, im.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(im.width * scale));
        canvas.height = Math.max(1, Math.round(im.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        // Quita el resaltador amarillo: píxeles amarillos -> blanco.
        // El marcador amarillo sobre el TOTAL ciega al OCR.
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (r > 140 && g > 140 && b < 130) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
        }
        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('img')), 'image/jpeg', 0.92);
      } catch (e) { reject(e); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    im.src = url;
  });
}

// Compat: mantiene el nombre anterior
function downscaleImage(file, maxDim) { return preprocessImage(file, maxDim); }

const SCAN_STATUS_MSG = {
  'loading tesseract core': 'Cargando lector…',
  'initializing tesseract': 'Iniciando lector…',
  'loading language traineddata': 'Descargando datos de idioma (solo primera vez)…',
  'initializing api': 'Preparando…',
  'recognizing text': 'Leyendo la boleta…'
};

async function localOcr(imageBlob, onStatus) {
  const worker = await withTimeout(Tesseract.createWorker('eng', Tesseract.OEM.LSTM, {
    logger: onStatus,
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0'
  }), 90000, 'load');
  const { data } = await withTimeout(worker.recognize(imageBlob), 120000, 'ocr');
  await worker.terminate();
  return data.text || '';
}

async function cloudOcr(imageBlob, apiKey) {
  const form = new FormData();
  form.append('apikey', apiKey);
  form.append('language', 'eng');
  form.append('OCREngine', '2');
  form.append('scale', 'true');
  form.append('detectOrientation', 'true');
  form.append('file', imageBlob, 'boleta.jpg');
  const res = await withTimeout(fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form }), 90000, 'cloud');
  if (!res.ok) throw new Error('http' + res.status);
  const j = await res.json();
  if (j.IsErroredOnProcessing) throw new Error('ocrapi: ' + ((j.ErrorMessage && j.ErrorMessage[0]) || 'error'));
  const pr = (j.ParsedResults && j.ParsedResults[0]) || {};
  return pr.ParsedText || '';
}

async function scanReceipt(file) {
  const box = document.getElementById('scanBox');
  const img = document.getElementById('scanImg');
  const prog = document.getElementById('scanProg');
  const msg = document.getElementById('scanMsg');
  const bar = prog.querySelector('div');
  box.style.display = 'block';
  img.style.display = 'block';
  img.src = URL.createObjectURL(file);
  prog.style.display = 'block';
  bar.style.width = '5%';
  msg.textContent = 'Preparando imagen…';

  try {
    const small = await downscaleImage(file, 2200);
    const ocrKey = (state.ocrKey || '').trim();
    let ocrText = '';
    if (ocrKey) {
      msg.textContent = 'Leyendo en la nube…';
      bar.style.width = '40%';
      ocrText = await cloudOcr(small, ocrKey);
    } else {
      if (typeof Tesseract === 'undefined') throw new Error('no-lib');
      msg.textContent = 'Cargando lector…';
      ocrText = await localOcr(small, m => {
        if (SCAN_STATUS_MSG[m.status]) msg.textContent = SCAN_STATUS_MSG[m.status] + ' (la foto no sale de tu teléfono)';
        if (m.status === 'recognizing text') bar.style.width = Math.max(5, Math.round(m.progress * 100)) + '%';
        else bar.style.width = '8%';
      });
    }
    bar.style.width = '100%';
    const dbg = document.getElementById('ocrDebug');
    const dbgPre = document.getElementById('ocrText');
    if (dbg && dbgPre) { dbg.style.display = 'block'; dbgPre.textContent = ocrText.trim() || '(no se detectó texto)'; }
    const parsed = parseReceipt(ocrText);
    if (parsed.amount) document.getElementById('fAmount').value = parsed.amount.toFixed(2);
    if (parsed.date) document.getElementById('fDate').value = parsed.date;
    if (parsed.merchant) document.getElementById('fNote').value = parsed.merchant;
    renderAmountChips(parsed.candidates);
    msg.textContent = parsed.amount || parsed.date
      ? 'Listo — revisa los datos antes de guardar.'
      : 'No pude leer bien la boleta. Ingresa los datos a mano.';
  } catch (e) {
    const why = String((e && e.message) || '');
    msg.textContent = why.indexOf('no-lib') === 0
      ? 'No se pudo cargar el lector. Revisa tu conexión e inténtalo de nuevo.'
      : why.indexOf('timeout:cloud') === 0
        ? 'El servicio en la nube no respondió. Revisa tu clave en Ajustes o intenta de nuevo.'
        : why.indexOf('ocrapi:') === 0 || why.indexOf('http') === 0
          ? 'El servicio en la nube falló (¿clave válida?). Revisa tu clave en Ajustes.'
          : why.indexOf('timeout') === 0
            ? 'Tardó demasiado (mala conexión o foto muy pesada). Prueba de nuevo o ingresa los datos a mano.'
            : 'No se pudo leer la boleta. Ingresa los datos a mano.';
  }
  setTimeout(() => { prog.style.display = 'none'; }, 800);
}

function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = { amount: null, date: null, merchant: null, candidates: [] };

  // "total" con errores típicos de OCR (T0TAL, TOTL...), más sinónimos
  const totalRe = /t[o0]t[a@]l|totl|balance|amount[\s-]*due|purchase/i;
  const subRe = /subtotal/i;
  const payRe = /visa|mastercard|amex|tender|\btend\b|debit|credit|cash/i;

  let subtotal = 0;
  const cands = [];
  lines.forEach((l, idx) => {
    const noDollar = l.replace(/\$/g, '');
    const nums = [...noDollar.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})\b/g)];
    if (!nums.length) return;
    // El precio suele ir al final de la línea: toma el último número
    const raw = nums[nums.length - 1];
    const v = parseFloat(raw[1].replace(/,/g, '') + '.' + raw[2]);
    if (!(v > 0) || v >= 100000) return;
    // El subtotal sirve de referencia, no es candidato
    if (subRe.test(l) && !totalRe.test(l)) { if (v > subtotal) subtotal = v; return; }
    let score = 0;
    if (totalRe.test(l)) score += 5;
    if (payRe.test(l)) score += 2;
    if (idx >= lines.length * 0.7) score += 2;      // el total va al final
    if (subtotal && v >= subtotal - 0.01) score += 2;
    if (/\d{8,}/.test(l)) score -= 1;                // líneas de items con código largo
    cands.push({ v, score });
  });

  cands.sort((a, b) => b.score - a.score || b.v - a.v);
  const seen = new Set();
  out.candidates = cands
    .filter(c => { const k = c.v.toFixed(2); return seen.has(k) ? false : (seen.add(k), true); })
    .slice(0, 3);
  if (out.candidates.length) out.amount = out.candidates[0].v;

  // Fecha: MM/DD/YYYY o MM-DD-YY (formato común en EE.UU.)
  for (const l of lines) {
    const m = l.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (m) {
      let [, mo, da, ye] = m;
      if (ye.length === 2) ye = '20' + ye;
      if (Number(mo) <= 12 && Number(da) <= 31) {
        out.date = ye + '-' + mo.padStart(2, '0') + '-' + da.padStart(2, '0');
        break;
      }
    }
  }

  // Comercio: primeras líneas, solo si parece un nombre real de tienda
  // (hasta 3 palabras, cada una Title o MAYÚSCULAS). Si no está claro, no se rellena.
  const skipRe = /http|www\.|\.com|survey|feedback|thank you|gracias|welcome|^(tax|subtotal|total|change|tender|cash)\b/i;
  const nameRe = /^([A-Z][a-z]*|[A-Z]{2,})( ([A-Z][a-z]*|[A-Z]{2,})){0,2}$/;
  for (const l of lines.slice(0, 6)) {
    if (skipRe.test(l)) continue;
    const t = l.slice(0, 30).trim();
    if (t.length >= 3 && nameRe.test(t)) { out.merchant = t; break; }
  }
  return out;
}

function renderAmountChips(candidates) {
  const box = document.getElementById('amtChips');
  if (!box) return;
  if (!candidates || candidates.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = '<span class="hint" style="margin:0;align-self:center">¿Otro monto?</span>' +
    candidates.map(c =>
      '<button type="button" data-amt="' + c.v.toFixed(2) + '">' + fmt(c.v) + '</button>').join('');
  box.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      document.getElementById('fAmount').value = b.getAttribute('data-amt');
      box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  const first = box.querySelector('button');
  if (first) first.classList.add('on');
}

// ---------- Historial ----------
function renderHistory() {
  const txs = monthTxs().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let html = '<div class="monthnav"><button id="hPrev" aria-label="Mes anterior">‹</button>' +
    '<div class="mname">' + esc(monthLabel(viewMonth)) + '</div>' +
    '<button id="hNext" aria-label="Mes siguiente">›</button></div>';
  html += '<div class="card"><h2>' + txs.length + ' movimientos</h2>';
  if (!txs.length) html += '<div class="empty">Sin movimientos este mes.</div>';
  let lastDate = '';
  txs.forEach(t => {
    if (t.date !== lastDate) { lastDate = t.date; html += '<div class="hint" style="margin-top:10px">' + esc(t.date) + '</div>'; }
    html += txRow(t);
  });
  html += '</div>';
  const el = document.getElementById('hist');
  el.innerHTML = html;
  document.getElementById('hPrev').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); renderHistory(); };
  document.getElementById('hNext').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); renderHistory(); };
  bindDeleteButtons(el);
}

// ---------- Ajustes ----------
function renderSettings() {
  const el = document.getElementById('set');
  el.innerHTML =
    '<div class="card"><h2>Sincronización</h2>' +
    '<div class="hint" style="margin-top:0">' +
    (cloudOn
      ? '☁️ <b>Nube activada.</b> Lo que anoten tú o Nicole aparece en ambos teléfonos.'
      : '📱 <b>Modo local.</b> Los datos viven solo en este teléfono.') +
    '</div></div>' +

    '<div class="card"><h2>Lector de boletas</h2>' +
    '<div class="hint" style="margin-top:0">El lector en la nube lee mucho mejor. ' +
    'Consigue tu clave gratis en <a href="https://ocr.space/ocrapi" target="_blank" rel="noopener">ocr.space/ocrapi</a> ' +
    '(toma 1 minuto, solo piden tu email) y pégala aquí. Sin clave se usa el lector del teléfono.</div>' +
    '<label>Clave de OCR.space</label>' +
    '<input id="sOcrKey" type="text" placeholder="Pega tu clave aquí" value="' + esc(state.ocrKey || '') + '" autocomplete="off">' +
    '<button class="btn" id="sSaveOcr">Guardar clave</button>' +
    '<div class="hint" id="ocrState"></div></div>' +

    '<div class="card"><h2>Tope mensual</h2>' +
    '<label>Tope de gasto mensual (USD)</label>' +
    '<input id="sCap" type="number" inputmode="decimal" step="10" min="0" value="' + esc(state.cap) + '">' +
    '<button class="btn" id="sSaveCap">Guardar tope</button></div>' +

    '<div class="card"><h2>Categorías</h2><div id="catList">' +
    state.cats.map((c, i) => {
      const cc = catColor(c);
      return '<div class="tx"><div class="cico" style="width:38px;height:38px;color:' + cc + ';background:' + cc + '1c">' + catIcon(c) + '</div>' +
      '<div class="tinfo"><div class="tnote">' + esc(c) + '</div></div>' +
      (state.cats.length > 1 ? '<button class="tdel" data-cat="' + i + '" aria-label="Eliminar categoría">×</button>' : '') +
      '</div>'; }).join('') +
    '</div><label>Nueva categoría</label><input id="sNewCat" type="text" maxlength="30" placeholder="Ej: Mascotas">' +
    '<button class="btn" id="sAddCat">Agregar categoría</button></div>' +

    '<div class="card"><h2>Respaldo</h2>' +
    '<button class="btn ghost" id="sExport">Exportar datos (JSON)</button>' +
    '<button class="btn danger" id="sWipe" style="margin-top:10px">Borrar todos los datos</button>' +
    '<div class="hint">Tus datos viven en este dispositivo. Exporta un respaldo de vez en cuando.</div></div>' +
    '<div class="ver">Finanzas Familiares · v' + APP_VERSION + '</div>';

  document.getElementById('sSaveCap').onclick = () => {
    const v = parseFloat(document.getElementById('sCap').value);
    if (!(v > 0)) { alert('Ingresa un tope válido.'); return; }
    setCap(Math.round(v * 100) / 100);
    alert('Tope actualizado a ' + fmt(Math.round(v * 100) / 100) + '.');
  };
  const ocrState = document.getElementById('ocrState');
  const paintOcrState = () => {
    ocrState.innerHTML = (state.ocrKey || '').trim()
      ? '☁️ <b>Lector en la nube activado.</b>'
      : '📱 Sin clave: se usa el lector del teléfono.';
  };
  paintOcrState();
  document.getElementById('sSaveOcr').onclick = () => {
    state.ocrKey = document.getElementById('sOcrKey').value.trim();
    save(); paintOcrState();
    alert(state.ocrKey ? 'Clave guardada. El escáner ahora usa la nube.' : 'Clave eliminada. Se usará el lector del teléfono.');
  };
  document.getElementById('sAddCat').onclick = async () => {
    const v = document.getElementById('sNewCat').value.trim();
    if (!v) return;
    if (state.cats.includes(v)) { alert('Esa categoría ya existe.'); return; }
    await addCat(v); renderSettings();
  };
  el.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.getAttribute('data-cat'));
      const name = state.cats[i];
      if (state.txs.some(t => t.cat === name)) { alert('No se puede eliminar: hay gastos con esa categoría.'); return; }
      if (confirm('¿Eliminar la categoría "' + name + '"?')) { removeCatAt(i).then(() => renderSettings()); }
    };
  });
  document.getElementById('sExport').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finanzas-respaldo-' + todayISO() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  document.getElementById('sWipe').onclick = async () => {
    if (confirm('¿Borrar TODOS los datos? Esto no se puede deshacer.') &&
        confirm('¿Seguro? Se perderán todos los gastos registrados.')) {
      const keepKey = state.ocrKey;
      if (cloudOn && db) {
        try {
          const snap = await db.collection('gastos').get();
          const batch = db.batch();
          snap.forEach(d => batch.delete(d.ref));
          batch.set(db.collection('config').doc('app'), { cap: 400, cats: DEFAULT_CATS.slice() });
          await batch.commit();
        } catch (e) {}
      }
      state = { cap: 400, cats: DEFAULT_CATS.slice(), txs: [], ocrKey: keepKey };
      persistLocal(); renderAll();
    }
  };
}

// ---------- Navegación ----------
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById(name === 'dash' ? 'vdash' : name === 'form' ? 'vform' : name === 'hist' ? 'vhist' : 'vset').classList.add('on');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.getAttribute('data-v') === name));
  if (name === 'dash') renderDashboard();
  if (name === 'hist') renderHistory();
  if (name === 'set') renderSettings();
  if (name === 'form') renderForm();
  window.scrollTo(0, 0);
}
function renderAll() { renderDashboard(); }

document.querySelectorAll('nav button').forEach(b => {
  b.onclick = () => showView(b.getAttribute('data-v'));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // Hay versión nueva instalada y ya tomó el control: recargar para usarla
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      });
    }).catch(() => {});
  });
}

renderForm();
showView('dash');
initCloud();
checkForUpdate();

// ---------- Actualización visible con un toque ----------
async function checkForUpdate() {
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.v || j.v === APP_VERSION || document.getElementById('updBtn')) return;
    const b = document.createElement('button');
    b.id = 'updBtn';
    b.textContent = '↓ Hay una versión nueva — toca para actualizar';
    b.onclick = async () => {
      b.textContent = 'Actualizando…';
      try {
        const names = await caches.keys();
        const mains = names.filter(k => k.indexOf('finanzas-pwa-v') === 0 && k !== 'finanzas-pwa-cdn').sort();
        const main = mains[mains.length - 1];
        if (main) {
          const c = await caches.open(main);
          const files = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest'];
          await Promise.all(files.map(async f => {
            try {
              const rr = await fetch(f, { cache: 'no-store' });
              if (rr.ok) await c.put(f, rr);
            } catch (e) {}
          }));
        }
      } catch (e) {}
      setTimeout(() => window.location.reload(), 600);
    };
    document.body.appendChild(b);
  } catch (e) {}
}
