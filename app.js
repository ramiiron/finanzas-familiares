'use strict';
/* Finanzas Familiares — PWA de control de gastos con tope mensual. Datos en localStorage. */

const LS_KEY = 'finanzas-familiares-v1';
const DEFAULT_CATS = ['Comida', 'Transporte', 'Casa', 'Salud', 'Suscripciones', 'Compras', 'Niños', 'Otros'];
const CAT_COLORS = ['#0e9f6e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6b7280'];
const PEOPLE = ['Ramiro', 'Nicole'];

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { cap: 400, cats: DEFAULT_CATS.slice(), txs: [] };
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

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

  let cls = '', status = '', statusCls = 'status-ok';
  if (total > cap) { cls = 'over'; status = 'Te pasaste por ' + fmt(total - cap); statusCls = 'status-over'; }
  else if (cap > 0 && total / cap >= 0.8) { cls = 'warn'; status = 'Cuidado: queda poco del tope'; statusCls = 'status-warn'; }
  else { status = left >= 0 ? 'Te quedan ' + fmt(left) + ' este mes' : ''; }

  let html = '<div class="card"><h2>' + esc(monthLabel(viewMonth)) + '</h2>' +
    '<div class="big">' + fmt(total) + ' <small>/ ' + fmt(cap) + '</small></div>' +
    '<div class="progress ' + cls + '"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
    '<div class="' + statusCls + '">' + esc(status) + '</div>' +
    '<div class="capline">' + txs.length + ' gastos registrados</div></div>';

  // Por categoría
  const byCat = {};
  txs.forEach(t => { byCat[t.cat] = (byCat[t.cat] || 0) + Number(t.amount || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  html += '<div class="card"><h2>Por categoría</h2>';
  if (!cats.length) html += '<div class="empty">Sin gastos este mes.</div>';
  const maxCat = cats.length ? cats[0][1] : 1;
  cats.forEach(([c, v]) => {
    html += '<div class="catrow"><div class="cname">' + esc(c) + '</div>' +
      '<div class="cbar"><div style="width:' + (v / maxCat * 100).toFixed(1) + '%;background:' + catColor(c) + '"></div></div>' +
      '<div class="camt">' + fmt(v) + '</div></div>';
  });
  html += '</div>';

  // Por persona
  const byP = { Ramiro: 0, Nicole: 0 };
  txs.forEach(t => { if (byP[t.person] == null) byP[t.person] = 0; byP[t.person] += Number(t.amount || 0); });
  html += '<div class="card"><h2>Por persona</h2><div class="personrow">';
  PEOPLE.forEach(p => {
    html += '<div class="person"><div class="pname">' + esc(p) + '</div><div class="pamt">' + fmt(byP[p] || 0) + '</div></div>';
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
  return '<div class="tx"><div class="dot" style="background:' + catColor(t.cat) + '"></div>' +
    '<div class="tinfo"><div class="tnote">' + esc(t.note || t.cat) + '</div>' +
    '<div class="tmeta">' + esc(t.date || '') + ' · ' + esc(t.cat || '') + ' · ' + esc(t.person || '') + '</div></div>' +
    '<div class="tamt">' + fmt(t.amount) + '</div>' +
    '<button class="tdel" data-del="' + t.id + '" aria-label="Eliminar">×</button></div>';
}
function bindDeleteButtons(root) {
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => {
      if (confirm('¿Eliminar este gasto?')) {
        state.txs = state.txs.filter(t => t.id !== b.getAttribute('data-del'));
        save(); renderAll();
      }
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
      '<div class="hint" id="scanMsg"></div></div>') +
    '<label>Monto (USD)</label>' +
    '<input id="fAmount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00">' +
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
    if (t) { t.amount = amount; t.cat = cat; t.date = date; t.note = note; t.person = formPerson; }
    editId = null;
  } else {
    state.txs.push({ id: uid(), amount: Math.round(amount * 100) / 100, cat, date, note, person: formPerson, ts: Date.now() });
  }
  save();
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

function downscaleImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(im.width, im.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(im.width * scale));
        canvas.height = Math.max(1, Math.round(im.height * scale));
        canvas.getContext('2d').drawImage(im, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('img')), 'image/jpeg', 0.85);
      } catch (e) { reject(e); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    im.src = url;
  });
}

const SCAN_STATUS_MSG = {
  'loading tesseract core': 'Cargando lector…',
  'initializing tesseract': 'Iniciando lector…',
  'loading language traineddata': 'Descargando datos de idioma (solo primera vez)…',
  'initializing api': 'Preparando…',
  'recognizing text': 'Leyendo la boleta…'
};

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
    if (typeof Tesseract === 'undefined') throw new Error('no-lib');
    const small = await downscaleImage(file, 1600);
    msg.textContent = 'Cargando lector…';
    const worker = await withTimeout(Tesseract.createWorker('eng', Tesseract.OEM.LSTM, {
      logger: m => {
        if (SCAN_STATUS_MSG[m.status]) msg.textContent = SCAN_STATUS_MSG[m.status] + ' (la foto no sale de tu teléfono)';
        if (m.status === 'recognizing text') bar.style.width = Math.max(5, Math.round(m.progress * 100)) + '%';
        else bar.style.width = '8%';
      },
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0'
    }), 90000, 'load');
    const { data } = await withTimeout(worker.recognize(small), 120000, 'ocr');
    await worker.terminate();
    bar.style.width = '100%';
    const parsed = parseReceipt(data.text || '');
    if (parsed.amount) document.getElementById('fAmount').value = parsed.amount.toFixed(2);
    if (parsed.date) document.getElementById('fDate').value = parsed.date;
    if (parsed.merchant) document.getElementById('fNote').value = parsed.merchant;
    msg.textContent = parsed.amount || parsed.date
      ? 'Listo — revisa los datos antes de guardar.'
      : 'No pude leer bien la boleta. Ingresa los datos a mano.';
  } catch (e) {
    const why = String((e && e.message) || '');
    msg.textContent = why.indexOf('no-lib') === 0
      ? 'No se pudo cargar el lector. Revisa tu conexión e inténtalo de nuevo.'
      : why.indexOf('timeout') === 0
        ? 'Tardó demasiado (mala conexión o foto muy pesada). Prueba de nuevo o ingresa los datos a mano.'
        : 'No se pudo leer la boleta. Ingresa los datos a mano.';
  }
  setTimeout(() => { prog.style.display = 'none'; }, 800);
}

function parseReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = { amount: null, date: null, merchant: null };

  // Monto: prefiere líneas con "total"; si no, el monto más grande.
  let candidates = [];
  lines.forEach(l => {
    const clean = l.replace(/[$\s]/g, '');
    const m = clean.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/);
    if (m) candidates.push({ v: parseFloat(m[1].replace(/,/g, '')), total: /total/i.test(l) });
  });
  candidates = candidates.filter(c => c.v > 0 && c.v < 100000);
  if (candidates.length) {
    const totals = candidates.filter(c => c.total);
    out.amount = (totals.length ? totals : candidates).reduce((a, b) => (b.v > a.v ? b : a)).v;
  }

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

  // Comercio: primeras líneas con letras (no solo números).
  for (const l of lines.slice(0, 4)) {
    const letters = (l.match(/[A-Za-z]/g) || []).length;
    if (letters >= 3 && l.length <= 40) { out.merchant = l.slice(0, 40); break; }
  }
  return out;
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
    '<div class="card"><h2>Tope mensual</h2>' +
    '<label>Tope de gasto mensual (USD)</label>' +
    '<input id="sCap" type="number" inputmode="decimal" step="10" min="0" value="' + esc(state.cap) + '">' +
    '<button class="btn" id="sSaveCap">Guardar tope</button></div>' +

    '<div class="card"><h2>Categorías</h2><div id="catList">' +
    state.cats.map((c, i) =>
      '<div class="tx"><div class="dot" style="background:' + catColor(c) + '"></div>' +
      '<div class="tinfo"><div class="tnote">' + esc(c) + '</div></div>' +
      (state.cats.length > 1 ? '<button class="tdel" data-cat="' + i + '" aria-label="Eliminar categoría">×</button>' : '') +
      '</div>').join('') +
    '</div><label>Nueva categoría</label><input id="sNewCat" type="text" maxlength="30" placeholder="Ej: Mascotas">' +
    '<button class="btn" id="sAddCat">Agregar categoría</button></div>' +

    '<div class="card"><h2>Respaldo</h2>' +
    '<button class="btn ghost" id="sExport">Exportar datos (JSON)</button>' +
    '<button class="btn danger" id="sWipe" style="margin-top:10px">Borrar todos los datos</button>' +
    '<div class="hint">Tus datos viven en este dispositivo. Exporta un respaldo de vez en cuando.</div></div>';

  document.getElementById('sSaveCap').onclick = () => {
    const v = parseFloat(document.getElementById('sCap').value);
    if (!(v > 0)) { alert('Ingresa un tope válido.'); return; }
    state.cap = Math.round(v * 100) / 100; save(); renderAll();
    alert('Tope actualizado a ' + fmt(state.cap) + '.');
  };
  document.getElementById('sAddCat').onclick = () => {
    const v = document.getElementById('sNewCat').value.trim();
    if (!v) return;
    if (state.cats.includes(v)) { alert('Esa categoría ya existe.'); return; }
    state.cats.push(v); save(); renderSettings();
  };
  el.querySelectorAll('[data-cat]').forEach(b => {
    b.onclick = () => {
      const i = Number(b.getAttribute('data-cat'));
      const name = state.cats[i];
      if (state.txs.some(t => t.cat === name)) { alert('No se puede eliminar: hay gastos con esa categoría.'); return; }
      if (confirm('¿Eliminar la categoría "' + name + '"?')) { state.cats.splice(i, 1); save(); renderSettings(); }
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
  document.getElementById('sWipe').onclick = () => {
    if (confirm('¿Borrar TODOS los datos? Esto no se puede deshacer.') &&
        confirm('¿Seguro? Se perderán todos los gastos registrados.')) {
      state = { cap: 400, cats: DEFAULT_CATS.slice(), txs: [] };
      save(); renderAll();
    }
  };
}

// ---------- Navegación ----------
function showView(name) {
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
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

renderForm();
showView('dash');
