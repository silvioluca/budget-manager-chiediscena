/* ═══════════════════════════════════════════════════════
   DANZA DASHBOARD — app.js
   ═══════════════════════════════════════════════════════ */

// ── CONFIGURAZIONE ───────────────────────────────────────
import { auth, requireAuth, fsLoad, fsAdd, fsUpdate, fsDelete, signOut } from './db.js';

const COLL_SPESE      = 'spese';
const COLL_CORSI      = 'corsi';
const COLL_ALLIEVI    = 'allievi';
const COLL_ISCRIZIONI = 'iscrizioni';
const COLL_PRESENZE   = 'presenze';

const CAT_USCITE  = ['Affitto','Arredamento','Bollette','Cibo','Contributo collaboratore','Contributo team','Corsi di aggiornamento','Manutenzione','Strumenti','Utilità','Tasse','Trasporti','Versamento','Altro'];
const CAT_ENTRATE = ['Allievi','Sponsor','Versamento','Altro'];

// ── STATO ────────────────────────────────────────────────
let speseData     = [];
let corsiData     = [];
let allieviData   = [];
let iscrizioniData= [];
let presenzeData  = [];

let currentType   = 'Uscite';
let currentCat    = '';
let currentPag    = '';
let editRowIndex  = null;

const CASSA_SEED = 233.91; // saldo cassa a inizio luglio 2023

let chartDash      = null;
let chartCatDash   = null;
let chartAnnuale   = null;
let chartAnnualeCat= null;
let chartGeneraleArea = null;
let chartWaterfall = null;

// ── UTILITY ──────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'}).format(n);
const fmtDate = (d) => {
  if (!d) return '';
  // Handle ISO string directly to avoid timezone shifts
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('it-IT');
};
const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') { const d = new Date((v - 25569) * 86400000); return d; }
  return new Date(v);
};
const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(',','.')) || 0;
};

const $ = (id) => document.getElementById(id);

const SPIN_SVG = `<svg class="spin" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.1)" stroke-width="2.5"/><path d="M10 2a8 8 0 0 1 8 8" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
const LOADING_HTML = `<div class="table-loading">${SPIN_SVG} Caricamento…</div>`;

// ── CARICAMENTO DATI (Firestore) ─────────────────────────
async function loadSpese() {
  const rows = await fsLoad(COLL_SPESE);
  speseData = rows.map(r => ({
    _id: r._id,
    data: parseDate(r.data),
    costo: parseNum(r.costo),
    descrizione: r.descrizione || '',
    categoria: r.categoria || '',
    tipo: r.tipo || '',
    pagamento: r.pagamento || '',
  })).filter(r => r.costo !== 0 || r.descrizione);
}

async function loadAllievi() {
  const rows = await fsLoad(COLL_ALLIEVI);
  allieviData = rows.map(r => ({
    _id: r._id,
    cognome: r.cognome || '',
    nome: r.nome || '',
    nomeCompleto: r.nomeCompleto || `${r.cognome || ''} ${r.nome || ''}`.trim(),
    tipo: r.tipo || '',
    tesseramento: r.tesseramento || '',
    cellulare: r.cellulare || '',
    mail: r.mail || '',
    indirizzo: r.indirizzo || '',
    note: r.note || '',
  }));
}

async function loadIscrizioni() {
  const rows = await fsLoad(COLL_ISCRIZIONI);
  iscrizioniData = rows.map(r => ({
    _id: r._id,
    allievo:  r.allievo || '',
    as:       r.as || '',
    data:     r.data || '',
    tipo:     r.tipo || '',
    corso:    r.corso || '',
    dataPag:  r.dataPag || '',
    pagato:   r.pagato || '',
    costo:    parseNum(r.costo),
    note:     r.note || '',
  }));
}

async function loadCorsi() {
  const rows = await fsLoad(COLL_CORSI);
  corsiData = rows.map(r => ({
    _id: r._id,
    nome:  r.nome || '',
    prova: parseNum(r.prova),
    x1:    parseNum(r.x1),
    x5:    parseNum(r.x5),
    x10:   parseNum(r.x10),
  })).filter(r => r.nome).sort((a,b) => a.nome.localeCompare(b.nome, 'it'));
}

async function loadPresenze() {
  const rows = await fsLoad(COLL_PRESENZE);
  presenzeData = rows.map(r => ({
    _id:     r._id,
    giorno:  r.giorno || '',
    corso:   r.corso || '',
    allievi: Array.isArray(r.allievi) ? r.allievi : [],
    note:    r.note || '',
  })).filter(r => r.giorno && r.corso);
}

// ── NAVIGAZIONE ──────────────────────────────────────────
const sections = ['dashboard','inserimento','elenco','annuale','generale','tabelle','allievi','iscrizioni','presenze','riepilogo-allievo','compensi','nota-mensile'];

function showSection(name) {
  sections.forEach(s => {
    $('sec-'+s)?.classList.remove('active');
    document.querySelector(`[data-section="${s}"]`)?.classList.remove('active');
  });
  $('sec-'+name)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  if (name === 'dashboard')   renderDashboard();
  if (name === 'elenco')      renderElenco();
  if (name === 'annuale')     renderAnnuale();
  if (name === 'generale')    renderGenerale();
  if (name === 'tabelle')     renderTabelle();
  if (name === 'allievi')     renderAllievi();
  if (name === 'iscrizioni')  renderIscrizioni();
  if (name === 'presenze')    renderPresenze();
  if (name === 'riepilogo-allievo') renderRiepilogoSection();
  if (name === 'compensi')        renderCompensi();
  if (name === 'nota-mensile')    renderNotaMensile();

  if (window.innerWidth <= 768) {
    $('sidebar').classList.remove('open');
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  if (!speseData.length) {
    $('dashLoadingCover').style.display = 'flex';
    $('dashContent').style.display = 'none';
    return;
  }
  $('dashLoadingCover').style.display = 'none';
  $('dashContent').style.display = '';

  const entrate = speseData.filter(r => r.tipo === 'Entrate').reduce((s,r) => s+r.costo, 0);
  const uscite  = speseData.filter(r => r.tipo === 'Uscite').reduce((s,r) => s+r.costo, 0);
  const saldo   = entrate - uscite;

  $('kpiAllievi').textContent = allieviData.length || '—';
  $('kpiEntrate').textContent = fmt(entrate);
  $('kpiUscite').textContent  = fmt(uscite);
  $('kpiSaldo').textContent   = fmt(saldo);
  $('kpiSaldo').className     = 'kpi-value ' + (saldo >= 0 ? 'kpi-green' : 'kpi-red');
  $('kpiCassa').textContent   = fmt(calcCassaCorrente());

  renderChartDash();
  renderChartCatDash();
}

function renderChartDash() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleDateString('it-IT',{month:'short',year:'2-digit'}), year: d.getFullYear(), month: d.getMonth() });
  }
  const ent = months.map(m => speseData.filter(r => r.tipo==='Entrate' && r.data && r.data.getFullYear()===m.year && r.data.getMonth()===m.month).reduce((s,r)=>s+r.costo,0));
  const usc = months.map(m => speseData.filter(r => r.tipo==='Uscite'  && r.data && r.data.getFullYear()===m.year && r.data.getMonth()===m.month).reduce((s,r)=>s+r.costo,0));

  if (chartDash) chartDash.destroy();
  chartDash = new Chart($('chartDash'), {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Entrate', data: ent, backgroundColor: 'rgba(92,184,92,0.5)', borderColor: '#5cb85c', borderWidth: 1, borderRadius: 4 },
        { label: 'Uscite',  data: usc, backgroundColor: 'rgba(224,85,85,0.5)', borderColor: '#e05555', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: chartOpts()
  });
}

function renderChartCatDash() {
  const cats = {};
  speseData.filter(r => r.tipo==='Uscite').forEach(r => { cats[r.categoria] = (cats[r.categoria]||0)+r.costo; });
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);

  if (chartCatDash) chartCatDash.destroy();
  chartCatDash = new Chart($('chartCatDash'), {
    type: 'doughnut',
    data: {
      labels: sorted.map(e=>e[0]),
      datasets: [{ data: sorted.map(e=>e[1]), backgroundColor: donutColors(), borderWidth: 0, hoverOffset: 6 }]
    },
    options: { ...donutOpts(), plugins: { ...donutOpts().plugins, legend: { position: 'bottom', labels: { color: '#888', font: { size: 11 }, boxWidth: 10, padding: 12 } } } }
  });
}

// ── INSERIMENTO SPESA ─────────────────────────────────────
const PAG_OPTIONS = ['Contanti','Bonifico','Carta','PayPal','Satispay','Altro'];

function initInserimento() {
  $('fData').valueAsDate = new Date();

  $('typeToggle').querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('typeToggle').querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      currentCat  = '';
      renderCatGrid();
    });
  });

  renderCatGrid();
  renderPagGrid();
  $('btnReset').addEventListener('click', resetForm);
  $('btnSubmit').addEventListener('click', submitSpesa);
}

function renderCatGrid(forType) {
  const type = forType || currentType;
  const cats = type === 'Uscite' ? CAT_USCITE : CAT_ENTRATE;
  const grid = $('catGrid');
  grid.innerHTML = cats.map(c =>
    `<button class="cat-chip${currentCat===c?' active':''}" data-cat="${c}">${c}</button>`
  ).join('');
  grid.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentCat = chip.dataset.cat;
      grid.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

function renderPagGrid() {
  const grid = $('pagGrid');
  grid.innerHTML = PAG_OPTIONS.map(p =>
    `<button class="cat-chip${currentPag===p?' active':''}" data-pag="${p}">${p}</button>`
  ).join('');
  grid.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentPag = chip.dataset.pag;
      grid.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

function resetForm() {
  $('fData').valueAsDate = new Date();
  $('fCosto').value = '';
  $('fDescrizione').value = '';
  currentCat = '';
  currentPag = '';
  currentType = 'Uscite';
  $('typeToggle').querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  $('typeToggle').querySelector('[data-type="Uscite"]').classList.add('active');
  renderCatGrid();
  renderPagGrid();
  showFeedback('');
}

async function submitSpesa() {
  const data       = $('fData').value;
  const costo      = parseFloat($('fCosto').value);
  const descrizione= $('fDescrizione').value.trim();

  if (!data)        return showFeedback('Inserisci la data.', true);
  if (!costo || costo <= 0) return showFeedback('Inserisci un importo valido.', true);
  if (!descrizione) return showFeedback('Inserisci una descrizione.', true);
  if (!currentCat)  return showFeedback('Seleziona una categoria.', true);

  $('btnSubmit').disabled = true;
  showFeedback('Salvataggio…');

  try {
    const id = await fsAdd(COLL_SPESE, { data, costo, descrizione, categoria: currentCat, tipo: currentType, pagamento: currentPag });
    $('btnSubmit').disabled = false;
    showFeedback('✓ Salvato correttamente!');
    speseData.push({
      _id: id,
      data: new Date(data),
      costo, descrizione, categoria: currentCat, tipo: currentType, pagamento: currentPag
    });
    resetForm();
  } catch (e) {
    $('btnSubmit').disabled = false;
    showFeedback('Errore durante il salvataggio.', true);
  }
}

function showFeedback(msg, isError = false) {
  const el = $('formFeedback');
  el.textContent = msg;
  el.className   = 'form-feedback' + (isError ? ' error' : '');
}

// ── ELENCO SPESE ──────────────────────────────────────────
let sortCol = 0, sortAsc = false;

function renderElenco() {
  const loading = $('tableLoading');
  const table   = $('speseTable');

  loading.style.display = 'none';
  table.style.display   = '';

  const anni = [...new Set(speseData.map(r => r.data?.getFullYear()).filter(Boolean))].sort((a,b)=>b-a);
  const annoSel = $('fAnno');
  const curAnno = annoSel.value;
  annoSel.innerHTML = '<option value="">Tutti</option>' + anni.map(a=>`<option value="${a}">${a}</option>`).join('');
  annoSel.value = curAnno;

  const cats = [...new Set(speseData.map(r=>r.categoria).filter(Boolean))].sort();
  const catSel = $('fCategoria');
  const curCat = catSel.value;
  catSel.innerHTML = '<option value="">Tutte</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  catSel.value = curCat;

  applyFilters();
}

function applyFilters() {
  const anno = $('fAnno').value;
  const mese = $('fMese').value;
  const tipo = $('fTipo').value;
  const cat  = $('fCategoria').value;

  let filtered = speseData.filter(r => {
    if (anno && r.data?.getFullYear() != anno) return false;
    if (mese && r.data?.getMonth()+1 != mese)  return false;
    if (tipo && r.tipo !== tipo)               return false;
    if (cat  && r.categoria !== cat)           return false;
    return true;
  });

  filtered = filtered.sort((a,b) => {
    let va = a.data, vb = b.data;
    if (!va) return 1; if (!vb) return -1;
    return sortAsc ? va - vb : vb - va;
  });

  $('elencoCount').textContent = `${filtered.length} voci`;
  const totEnt = filtered.filter(r=>r.tipo==='Entrate').reduce((s,r)=>s+r.costo,0);
  const totUsc = filtered.filter(r=>r.tipo==='Uscite').reduce((s,r)=>s+r.costo,0);
  $('elencoTotals').textContent = `Entrate ${fmt(totEnt)} · Uscite ${fmt(totUsc)}`;

  const tbody = $('speseBody');
  const empty = $('tableEmpty');
  const table = $('speseTable');

  if (filtered.length === 0) { table.style.display='none'; empty.style.display=''; return; }
  empty.style.display='none'; table.style.display='';

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${fmtDate(r.data)}</td>
      <td>${escHtml(r.descrizione)}</td>
      <td><span class="badge badge-gray">${escHtml(r.categoria)}</span></td>
      <td><span class="badge ${r.tipo==='Entrate'?'badge-green':'badge-red'}">${r.tipo}</span></td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmt(r.costo)}</td>
      <td style="color:var(--text-muted)">${escHtml(r.pagamento)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEdit('${r._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteRow('${r._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function exportCsv() {
  const anno = $('fAnno').value;
  const mese = $('fMese').value;
  const tipo = $('fTipo').value;
  const cat  = $('fCategoria').value;

  let filtered = speseData.filter(r => {
    if (anno && r.data?.getFullYear() != anno) return false;
    if (mese && r.data?.getMonth()+1 != mese)  return false;
    if (tipo && r.tipo !== tipo)               return false;
    if (cat  && r.categoria !== cat)           return false;
    return true;
  }).sort((a,b) => (b.data||0) - (a.data||0));

  const header = ['Data','Importo','Descrizione','Categoria','Tipo','Pagamento'];
  const rows = filtered.map(r => [
    r.data ? r.data.toISOString().split('T')[0] : '',
    r.costo,
    `"${(r.descrizione||'').replace(/"/g,'""')}"`,
    `"${(r.categoria||'').replace(/"/g,'""')}"`,
    r.tipo,
    r.pagamento
  ]);

  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `spese_${anno||'tutte'}_${mese||'tutti_mesi'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function initElencoFilters() {
  ['fAnno','fMese','fTipo','fCategoria'].forEach(id => {
    $(id)?.addEventListener('change', applyFilters);
  });
  $('btnClearFilters')?.addEventListener('click', () => {
    ['fAnno','fMese','fTipo','fCategoria'].forEach(id => { if($(id)) $(id).value=''; });
    applyFilters();
  });
  $('btnExportCsv')?.addEventListener('click', exportCsv);
  $('btnReload')?.addEventListener('click', async () => {
    $('tableLoading').style.display=''; $('speseTable').style.display='none'; $('tableEmpty').style.display='none';
    await loadSpese();
    renderElenco();
  });
  $('speseTable')?.querySelector('th.sortable')?.addEventListener('click', () => {
    sortAsc = !sortAsc; applyFilters();
  });
}

// ── EDIT / DELETE ─────────────────────────────────────────
function openEdit(id) {
  const r = speseData.find(r => r._id === id);
  if (!r) return;
  editRowIndex = id;
  $('mData').value        = r.data ? r.data.toISOString().split('T')[0] : '';
  $('mCosto').value       = r.costo;
  $('mDescrizione').value = r.descrizione;
  $('mCategoria').value   = r.categoria;
  $('mTipo').value        = r.tipo;
  $('mPagamento').value   = r.pagamento;
  $('modalOverlay').style.display = 'flex';
}

function closeModal() { $('modalOverlay').style.display = 'none'; editRowIndex = null; }

async function saveEdit() {
  if (!editRowIndex) return;
  const upd = {
    data:        $('mData').value,
    costo:       parseFloat($('mCosto').value),
    descrizione: $('mDescrizione').value,
    categoria:   $('mCategoria').value,
    tipo:        $('mTipo').value,
    pagamento:   $('mPagamento').value,
  };
  try {
    await fsUpdate(COLL_SPESE, editRowIndex, upd);
    const r = speseData.find(r => r._id === editRowIndex);
    if (r) { r.data=new Date(upd.data); r.costo=upd.costo; r.descrizione=upd.descrizione; r.categoria=upd.categoria; r.tipo=upd.tipo; r.pagamento=upd.pagamento; }
    closeModal(); applyFilters();
  } catch (e) {
    alert('Errore durante il salvataggio.');
  }
}

async function deleteRow(id) {
  if (!confirm('Eliminare questa voce?')) return;
  try {
    await fsDelete(COLL_SPESE, id);
    speseData = speseData.filter(r => r._id !== id);
    applyFilters();
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
  }
}

// ── RIEPILOGO ANNUALE ─────────────────────────────────────
function renderAnnuale() {
  if (!speseData.length) return;
  const anni = [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort((a,b)=>b-a);
  const sel  = $('annoRiep');
  const cur  = sel.value || String(anni[0] || new Date().getFullYear());
  sel.innerHTML = anni.map(a=>`<option value="${a}">${a}</option>`).join('');
  sel.value = cur;
  updateAnnuale(parseInt(cur), parseInt($('meseRiep').value)||null);

  sel.onchange = () => updateAnnuale(parseInt(sel.value), parseInt($('meseRiep').value)||null);
  $('meseRiep').onchange = () => updateAnnuale(parseInt($('annoRiep').value), parseInt($('meseRiep').value)||null);
}

function updateAnnuale(anno, mese) {
  let rows = speseData.filter(r => r.data?.getFullYear() === anno);
  if (mese) rows = rows.filter(r => r.data?.getMonth()+1 === mese);

  const entrate = rows.filter(r=>r.tipo==='Entrate').reduce((s,r)=>s+r.costo,0);
  const uscite  = rows.filter(r=>r.tipo==='Uscite').reduce((s,r)=>s+r.costo,0);

  $('rEntrate').textContent = fmt(entrate);
  $('rUscite').textContent  = fmt(uscite);
  $('rSaldo').textContent   = fmt(entrate - uscite);
  $('rSaldo').className     = 'kpi-value ' + (entrate-uscite>=0?'kpi-green':'kpi-red');
  $('rCount').textContent   = rows.length;

  let labels, ent, usc;
  if (mese) {
    const daysInMonth = new Date(anno, mese, 0).getDate();
    labels = Array.from({length: daysInMonth}, (_,i) => String(i+1));
    ent = labels.map((_,i) => rows.filter(r=>r.tipo==='Entrate'&&r.data?.getDate()===i+1).reduce((s,r)=>s+r.costo,0));
    usc = labels.map((_,i) => rows.filter(r=>r.tipo==='Uscite' &&r.data?.getDate()===i+1).reduce((s,r)=>s+r.costo,0));
  } else {
    labels = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    ent = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Entrate'&&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
    usc = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Uscite' &&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
  }

  if (chartAnnuale) chartAnnuale.destroy();
  chartAnnuale = new Chart($('chartAnnuale'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Entrate', data:ent, backgroundColor:'rgba(92,184,92,0.5)', borderColor:'#5cb85c', borderWidth:1, borderRadius:4 },
        { label:'Uscite',  data:usc, backgroundColor:'rgba(224,85,85,0.5)', borderColor:'#e05555', borderWidth:1, borderRadius:4 }
      ]
    },
    options: chartOpts()
  });

  const catsUsc = {};
  rows.filter(r=>r.tipo==='Uscite').forEach(r=>{ catsUsc[r.categoria]=(catsUsc[r.categoria]||0)+r.costo; });
  const sortedUsc = Object.entries(catsUsc).sort((a,b)=>b[1]-a[1]);

  if (chartAnnualeCat) chartAnnualeCat.destroy();
  chartAnnualeCat = new Chart($('chartAnnualeCat'), {
    type: 'doughnut',
    data: {
      labels: sortedUsc.map(e=>e[0]),
      datasets: [{ data:sortedUsc.map(e=>e[1]), backgroundColor:donutColors(), borderWidth:0, hoverOffset:6 }]
    },
    options: donutOpts()
  });

  const totalUsc = sortedUsc.reduce((s,e)=>s+e[1],0);
  $('catBreakdown').innerHTML = sortedUsc.length ? sortedUsc.map(([cat,val]) => `
    <div class="cat-breakdown-row">
      <span class="cat-breakdown-name">${escHtml(cat)}</span>
      <div class="cat-breakdown-bar-wrap"><div class="cat-breakdown-bar" style="width:${totalUsc?val/totalUsc*100:0}%"></div></div>
      <span class="cat-breakdown-val">${fmt(val)}</span>
    </div>
  `).join('') : '<p style="color:var(--text-dim);padding:12px 0;font-size:13px;">Nessuna uscita nel periodo.</p>';

  const catsEnt = {};
  rows.filter(r=>r.tipo==='Entrate').forEach(r=>{ catsEnt[r.categoria]=(catsEnt[r.categoria]||0)+r.costo; });
  const sortedEnt = Object.entries(catsEnt).sort((a,b)=>b[1]-a[1]);
  const totalEnt = sortedEnt.reduce((s,e)=>s+e[1],0);
  $('catBreakdownEntrate').innerHTML = sortedEnt.length ? sortedEnt.map(([cat,val]) => `
    <div class="cat-breakdown-row">
      <span class="cat-breakdown-name">${escHtml(cat)}</span>
      <div class="cat-breakdown-bar-wrap"><div class="cat-breakdown-bar" style="background:var(--green);width:${totalEnt?val/totalEnt*100:0}%"></div></div>
      <span class="cat-breakdown-val" style="color:var(--green)">${fmt(val)}</span>
    </div>
  `).join('') : '<p style="color:var(--text-dim);padding:12px 0;font-size:13px;">Nessuna entrata nel periodo.</p>';
}

// ── RIEPILOGO GENERALE ────────────────────────────────────
function renderGenerale() {
  if (!speseData.length) return;
  const anni = [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort();
  const ent  = anni.map(a=>speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
  const usc  = anni.map(a=>speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
  const saldo= ent.map((e,i)=>e-usc[i]);

  if (chartGeneraleArea) chartGeneraleArea.destroy();
  chartGeneraleArea = new Chart($('chartGeneraleArea'), {
    type: 'line',
    data: {
      labels: anni,
      datasets: [
        { label:'Entrate', data:ent, borderColor:'#5cb85c', backgroundColor:'rgba(92,184,92,0.10)', fill:true, tension:0.35, pointRadius:5, pointBackgroundColor:'#5cb85c', pointBorderColor:'#0d0d0f', pointBorderWidth:2, borderWidth:2 },
        { label:'Uscite',  data:usc, borderColor:'#e05555', backgroundColor:'rgba(224,85,85,0.10)',  fill:true, tension:0.35, pointRadius:5, pointBackgroundColor:'#e05555', pointBorderColor:'#0d0d0f', pointBorderWidth:2, borderWidth:2 },
        { label:'Saldo',   data:saldo, borderColor:'#c9a96e', backgroundColor:'rgba(201,169,110,0.08)', fill:true, tension:0.35, pointRadius:5, pointBackgroundColor:'#c9a96e', pointBorderColor:'#0d0d0f', pointBorderWidth:2, borderWidth:2, borderDash:[5,3] },
      ]
    },
    options: { ...chartOpts(), plugins: { ...chartOpts().plugins, legend: { labels: { color:'#888', font:{size:11}, boxWidth:10, padding:14 } } } }
  });

  // Waterfall trimestrale
  const trimestri = [];
  anni.forEach(a => {
    [0,1,2,3].forEach(q => {
      const label = `${a} Q${q+1}`;
      const mesi = [q*3, q*3+1, q*3+2];
      const e = speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===a&&mesi.includes(r.data?.getMonth())).reduce((s,r)=>s+r.costo,0);
      const u = speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===a&&mesi.includes(r.data?.getMonth())).reduce((s,r)=>s+r.costo,0);
      trimestri.push({ label, saldo: e-u });
    });
  });

  const wfLabels = ['Inizio', ...trimestri.map(t=>t.label)];
  const wfData   = [];
  const wfColors = [];
  let running = 0;
  wfData.push([0,0]); wfColors.push('rgba(201,169,110,0.4)');
  trimestri.forEach(t => {
    const start = running;
    const end   = running + t.saldo;
    wfData.push([Math.min(start,end), Math.max(start,end)]);
    wfColors.push(t.saldo >= 0 ? 'rgba(92,184,92,0.75)' : 'rgba(224,85,85,0.75)');
    running = end;
  });
  const totFinale = running;
  wfData.push([0, totFinale]);
  wfColors.push(totFinale >= 0 ? 'rgba(201,169,110,0.85)' : 'rgba(224,85,85,0.85)');

  if (chartWaterfall) chartWaterfall.destroy();
  chartWaterfall = new Chart($('chartWaterfall'), {
    type: 'bar',
    data: {
      labels: wfLabels,
      datasets: [{ label:'Saldo', data:wfData, backgroundColor:wfColors, borderColor:wfColors.map(c=>c.replace(/[\d.]+\)$/,'1)')), borderWidth:1, borderRadius:4 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{backgroundColor:'#18181b',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#f0ede8',bodyColor:'#888',callbacks:{label:ctx=>{const[lo,hi]=ctx.raw;const val=hi-lo;return ` ${fmt(val)}  (cumulato: ${fmt(hi)})`;}}}},
      scales: { x:{ticks:{color:'#666',font:{size:10}},grid:{color:'rgba(255,255,255,0.04)'}}, y:{ticks:{color:'#666',font:{size:11},callback:v=>'€'+v.toLocaleString('it-IT')},grid:{color:'rgba(255,255,255,0.04)'}} }
    }
  });

  $('generaleBody').innerHTML = anni.map((a,i) => {
    const s = ent[i]-usc[i];
    return `<tr>
      <td>${a}</td>
      <td style="text-align:right;color:var(--green)">${fmt(ent[i])}</td>
      <td style="text-align:right;color:var(--red)">${fmt(usc[i])}</td>
      <td style="text-align:right;color:${s>=0?'var(--green)':'var(--red)'}">${fmt(s)}</td>
      <td style="color:var(--text-muted)">${speseData.filter(r=>r.data?.getFullYear()===a).length}</td>
    </tr>`;
  }).join('');
}

// ── TABELLE ───────────────────────────────────────────────
const MESI_NOMI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function renderTabelle() {
  if (!speseData.length) { $('tabelleContent').innerHTML = LOADING_HTML; return; }
  const anni = [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort((a,b)=>b-a);
  const annoSel = $('tabelleAnno');
  const curAnno = annoSel.value || String(anni[0] || new Date().getFullYear());
  annoSel.innerHTML = anni.map(a=>`<option value="${a}">${a}</option>`).join('');
  annoSel.value = curAnno;

  const modalita = $('tabelleModalita').value;
  $('tabelleAnnoGroup').style.display = modalita === 'anno' ? '' : 'none';
  updateTabelle();
}

function updateTabelle() {
  const modalita = $('tabelleModalita').value;
  const annoSel  = parseInt($('tabelleAnno').value);
  if (modalita === 'anno') renderTabellaSingoloAnno(annoSel);
  else renderTabellaMultiAnno();
}

function buildPivotAnno(anno) {
  return MESI_NOMI.map((label, m) => {
    const righe = speseData.filter(r => r.data?.getFullYear()===anno && r.data?.getMonth()===m);
    const uscite  = righe.filter(r=>r.tipo==='Uscite').reduce((s,r)=>s+r.costo,0);
    const entrate = righe.filter(r=>r.tipo==='Entrate').reduce((s,r)=>s+r.costo,0);
    return { mese: m+1, label, uscite, entrate, guadagno: entrate-uscite };
  });
}

function buildCassaMensile() {
  const now = new Date();
  const rows = [];
  let cassa = CASSA_SEED;
  let year = 2023, month = 6; // luglio 2023
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth())) {
    const ent = speseData.filter(r => r.tipo==='Entrate' && r.pagamento==='Contanti' && r.data?.getFullYear()===year && r.data?.getMonth()===month).reduce((s,r)=>s+r.costo, 0);
    const usc = speseData.filter(r => r.tipo==='Uscite'  && r.pagamento==='Contanti' && r.data?.getFullYear()===year && r.data?.getMonth()===month).reduce((s,r)=>s+r.costo, 0);
    cassa += ent - usc;
    rows.push({ year, month, entrate: ent, uscite: usc, cassa });
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return rows;
}

function calcCassaCorrente() {
  const rows = buildCassaMensile();
  return rows.length ? rows[rows.length - 1].cassa : CASSA_SEED;
}

function renderTabellaSingoloAnno(anno) {
  const pivot   = buildPivotAnno(anno);
  const totEnt  = pivot.reduce((s,r)=>s+r.entrate,0);
  const totUsc  = pivot.reduce((s,r)=>s+r.uscite,0);
  const totGua  = totEnt - totUsc;
  const rows    = speseData.filter(r => r.data?.getFullYear() === anno);
  const cassaRows = buildCassaMensile().filter(r => r.year === anno);

  // ── main pivot ──
  const mainTable = `<div class="card" style="margin-bottom:16px">
    <div class="card-title">Riepilogo mensile — ${anno}</div>
    <div class="table-wrap" style="margin-top:0">
      <table class="data-table pivot-table">
        <thead><tr>
          <th>Mese</th>
          <th style="text-align:right;color:var(--green)">Entrate</th>
          <th style="text-align:right;color:var(--red)">Uscite</th>
          <th style="text-align:right;color:var(--accent)">Guadagno</th>
        </tr></thead>
        <tbody>
          ${pivot.map(r=>`<tr class="${r.guadagno<0?'row-neg':''}">
            <td style="font-weight:500">${r.label}</td>
            <td style="text-align:right;color:var(--green);font-variant-numeric:tabular-nums">${r.entrate?fmt(r.entrate):'<span style="color:var(--text-dim)">—</span>'}</td>
            <td style="text-align:right;color:var(--red);font-variant-numeric:tabular-nums">${r.uscite?fmt(r.uscite):'<span style="color:var(--text-dim)">—</span>'}</td>
            <td style="text-align:right;font-variant-numeric:tabular-nums;color:${r.guadagno>=0?'var(--green)':'var(--red)'}">${r.entrate||r.uscite?fmt(r.guadagno):'<span style="color:var(--text-dim)">—</span>'}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr class="pivot-total">
          <td>Totale</td>
          <td style="text-align:right;color:var(--green)">${fmt(totEnt)}</td>
          <td style="text-align:right;color:var(--red)">${fmt(totUsc)}</td>
          <td style="text-align:right;color:${totGua>=0?'var(--green)':'var(--red)'}">${fmt(totGua)}</td>
        </tr></tfoot>
      </table>
    </div>
  </div>`;

  // ── cassa ──
  let cassaTable = '';
  if (cassaRows.length) {
    const cassaTotEnt = cassaRows.reduce((s,r)=>s+r.entrate,0);
    const cassaTotUsc = cassaRows.reduce((s,r)=>s+r.uscite,0);
    const cassaFine   = cassaRows[cassaRows.length-1].cassa;
    cassaTable = `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Cassa contanti — ${anno}</div>
      <div class="table-wrap" style="margin-top:0">
        <table class="data-table pivot-table">
          <thead><tr>
            <th>Mese</th>
            <th style="text-align:right;color:var(--green)">Entrate contanti</th>
            <th style="text-align:right;color:var(--red)">Uscite contanti</th>
            <th style="text-align:right;color:var(--accent)">Cassa</th>
          </tr></thead>
          <tbody>
            ${cassaRows.map(r=>`<tr>
              <td style="font-weight:500">${MESI_NOMI[r.month]}</td>
              <td style="text-align:right;color:var(--green);font-variant-numeric:tabular-nums">${r.entrate?fmt(r.entrate):'<span style="color:var(--text-dim)">—</span>'}</td>
              <td style="text-align:right;color:var(--red);font-variant-numeric:tabular-nums">${r.uscite?fmt(r.uscite):'<span style="color:var(--text-dim)">—</span>'}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:600">${fmt(r.cassa)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="pivot-total">
            <td>Fine anno</td>
            <td style="text-align:right;color:var(--green)">${fmt(cassaTotEnt)}</td>
            <td style="text-align:right;color:var(--red)">${fmt(cassaTotUsc)}</td>
            <td style="text-align:right;color:var(--accent)">${fmt(cassaFine)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  // ── uscite per categoria ──
  const catsUsc = [...new Set(rows.filter(r=>r.tipo==='Uscite').map(r=>r.categoria).filter(Boolean))].sort();
  let uscCatTable = '';
  if (catsUsc.length) {
    const bodyRowsUsc = catsUsc.map(cat => {
      const mv = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Uscite'&&r.categoria===cat&&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
      const tot = mv.reduce((a,b)=>a+b,0);
      if (!tot) return '';
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${escHtml(cat)}</td>
        ${mv.map(v=>`<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--red)">${v?fmt(v):'<span style="color:var(--text-dim)">—</span>'}</td>`).join('')}
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--red);font-weight:600">${fmt(tot)}</td>
      </tr>`;
    }).join('');
    const totMUsc = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Uscite'&&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
    uscCatTable = `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Uscite per categoria — ${anno}</div>
      <div class="table-wrap" style="margin-top:0;overflow-x:auto">
        <table class="data-table pivot-table">
          <thead><tr>
            <th>Categoria</th>
            ${MESI_NOMI.map(m=>`<th style="text-align:right">${m.slice(0,3)}</th>`).join('')}
            <th style="text-align:right;color:var(--red)">Totale</th>
          </tr></thead>
          <tbody>${bodyRowsUsc}</tbody>
          <tfoot><tr class="pivot-total">
            <td>Totale</td>
            ${totMUsc.map(v=>`<td style="text-align:right;color:var(--red)">${v?fmt(v):'—'}</td>`).join('')}
            <td style="text-align:right;color:var(--red)">${fmt(totUsc)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  // ── entrate per categoria ──
  const catsEnt = [...new Set(rows.filter(r=>r.tipo==='Entrate').map(r=>r.categoria).filter(Boolean))].sort();
  let entCatTable = '';
  if (catsEnt.length) {
    const bodyRowsEnt = catsEnt.map(cat => {
      const mv = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Entrate'&&r.categoria===cat&&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
      const tot = mv.reduce((a,b)=>a+b,0);
      if (!tot) return '';
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${escHtml(cat)}</td>
        ${mv.map(v=>`<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--green)">${v?fmt(v):'<span style="color:var(--text-dim)">—</span>'}</td>`).join('')}
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--green);font-weight:600">${fmt(tot)}</td>
      </tr>`;
    }).join('');
    const totMEnt = Array.from({length:12},(_,m)=>rows.filter(r=>r.tipo==='Entrate'&&r.data?.getMonth()===m).reduce((s,r)=>s+r.costo,0));
    entCatTable = `<div class="card">
      <div class="card-title">Entrate per categoria — ${anno}</div>
      <div class="table-wrap" style="margin-top:0;overflow-x:auto">
        <table class="data-table pivot-table">
          <thead><tr>
            <th>Categoria</th>
            ${MESI_NOMI.map(m=>`<th style="text-align:right">${m.slice(0,3)}</th>`).join('')}
            <th style="text-align:right;color:var(--green)">Totale</th>
          </tr></thead>
          <tbody>${bodyRowsEnt}</tbody>
          <tfoot><tr class="pivot-total">
            <td>Totale</td>
            ${totMEnt.map(v=>`<td style="text-align:right;color:var(--green)">${v?fmt(v):'—'}</td>`).join('')}
            <td style="text-align:right;color:var(--green)">${fmt(totEnt)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  $('tabelleContent').innerHTML = mainTable + cassaTable + uscCatTable + entCatTable;
}

function renderTabellaMultiAnno() {
  const anni = [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort();
  if (!anni.length) { $('tabelleContent').innerHTML = '<p style="color:var(--text-muted);padding:20px;">Nessun dato disponibile.</p>'; return; }

  const totals = anni.map(a => {
    const ent = speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0);
    const usc = speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0);
    return { anno: a, ent, usc, gua: ent-usc };
  });

  const cassaData = buildCassaMensile();
  const cassaPerAnno = anni.map(a => {
    const yr = cassaData.filter(r=>r.year===a);
    return yr.length ? yr[yr.length-1].cassa : null;
  });

  const headerAnni = anni.map(a=>`<th style="text-align:right">${a}</th>`).join('');

  // ── main summary (3 rows) ──
  const mainTable = `<div class="card" style="margin-bottom:16px">
    <div class="card-title">Riepilogo tutti gli anni</div>
    <div class="table-wrap" style="margin-top:0;overflow-x:auto">
      <table class="data-table pivot-table">
        <thead><tr><th></th>${headerAnni}</tr></thead>
        <tbody>
          <tr>
            <td style="font-weight:500;color:var(--green)">Entrate</td>
            ${totals.map(t=>`<td style="text-align:right;color:var(--green);font-variant-numeric:tabular-nums">${fmt(t.ent)}</td>`).join('')}
          </tr>
          <tr>
            <td style="font-weight:500;color:var(--red)">Uscite</td>
            ${totals.map(t=>`<td style="text-align:right;color:var(--red);font-variant-numeric:tabular-nums">${fmt(t.usc)}</td>`).join('')}
          </tr>
          <tr>
            <td style="font-weight:500;color:var(--accent)">Guadagno</td>
            ${totals.map(t=>`<td style="text-align:right;font-variant-numeric:tabular-nums;color:${t.gua>=0?'var(--green)':'var(--red)'};font-weight:600">${fmt(t.gua)}</td>`).join('')}
          </tr>
          <tr>
            <td style="font-weight:500;color:var(--accent)">Cassa</td>
            ${cassaPerAnno.map(v=>v!==null?`<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--accent)">${fmt(v)}</td>`:`<td style="text-align:right;color:var(--text-dim)">—</td>`).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;

  // ── uscite per categoria ──
  const allCatsUsc = [...new Set(speseData.filter(r=>r.tipo==='Uscite').map(r=>r.categoria).filter(Boolean))].sort();
  let uscCatTable = '';
  if (allCatsUsc.length) {
    const bodyRowsUsc = allCatsUsc.map(cat => {
      const vals = anni.map(a=>speseData.filter(r=>r.tipo==='Uscite'&&r.categoria===cat&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
      const tot = vals.reduce((a,b)=>a+b,0);
      if (!tot) return '';
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${escHtml(cat)}</td>
        ${vals.map(v=>`<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--red)">${v?fmt(v):'<span style="color:var(--text-dim)">—</span>'}</td>`).join('')}
      </tr>`;
    }).join('');
    uscCatTable = `<div class="card" style="margin-bottom:16px">
      <div class="card-title">Uscite per categoria</div>
      <div class="table-wrap" style="margin-top:0;overflow-x:auto">
        <table class="data-table pivot-table">
          <thead><tr><th>Categoria</th>${headerAnni}</tr></thead>
          <tbody>${bodyRowsUsc}</tbody>
          <tfoot><tr class="pivot-total">
            <td>Totale</td>
            ${totals.map(t=>`<td style="text-align:right;color:var(--red)">${fmt(t.usc)}</td>`).join('')}
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  // ── entrate per categoria ──
  const allCatsEnt = [...new Set(speseData.filter(r=>r.tipo==='Entrate').map(r=>r.categoria).filter(Boolean))].sort();
  let entCatTable = '';
  if (allCatsEnt.length) {
    const bodyRowsEnt = allCatsEnt.map(cat => {
      const vals = anni.map(a=>speseData.filter(r=>r.tipo==='Entrate'&&r.categoria===cat&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
      const tot = vals.reduce((a,b)=>a+b,0);
      if (!tot) return '';
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${escHtml(cat)}</td>
        ${vals.map(v=>`<td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--green)">${v?fmt(v):'<span style="color:var(--text-dim)">—</span>'}</td>`).join('')}
      </tr>`;
    }).join('');
    entCatTable = `<div class="card">
      <div class="card-title">Entrate per categoria</div>
      <div class="table-wrap" style="margin-top:0;overflow-x:auto">
        <table class="data-table pivot-table">
          <thead><tr><th>Categoria</th>${headerAnni}</tr></thead>
          <tbody>${bodyRowsEnt}</tbody>
          <tfoot><tr class="pivot-total">
            <td>Totale</td>
            ${totals.map(t=>`<td style="text-align:right;color:var(--green)">${fmt(t.ent)}</td>`).join('')}
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }

  $('tabelleContent').innerHTML = mainTable + uscCatTable + entCatTable;
}

function exportTabelleCsv() {
  const modalita = $('tabelleModalita').value;
  const anni = modalita === 'anno'
    ? [parseInt($('tabelleAnno').value)]
    : [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort();

  const lines = [];
  if (modalita === 'anno') {
    lines.push(['Mese','Entrate','Uscite','Guadagno'].join(','));
    buildPivotAnno(anni[0]).forEach(r => {
      lines.push([r.label, r.entrate.toFixed(2), r.uscite.toFixed(2), r.guadagno.toFixed(2)].join(','));
    });
  } else {
    const header = ['Mese', ...anni.flatMap(a => [`Entrate ${a}`, `Uscite ${a}`, `Guadagno ${a}`])];
    lines.push(header.join(','));
    MESI_NOMI.forEach((label, m) => {
      const cols = anni.flatMap(a => {
        const righe = speseData.filter(r => r.data?.getFullYear()===a && r.data?.getMonth()===m);
        const ent = righe.filter(r=>r.tipo==='Entrate').reduce((s,r)=>s+r.costo,0);
        const usc = righe.filter(r=>r.tipo==='Uscite').reduce((s,r)=>s+r.costo,0);
        return [ent.toFixed(2), usc.toFixed(2), (ent-usc).toFixed(2)];
      });
      lines.push([label, ...cols].join(','));
    });
    const totals = anni.flatMap(a => {
      const ent = speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0);
      const usc = speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0);
      return [ent.toFixed(2), usc.toFixed(2), (ent-usc).toFixed(2)];
    });
    lines.push(['Totale', ...totals].join(','));
  }

  const csv  = lines.join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `tabella_${modalita==='anno'?$('tabelleAnno').value:'tutti_anni'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── ALLIEVI ───────────────────────────────────────────────
const TIPO_COLORS = [
  { bg: 'rgba(201,169,110,0.15)', border: '#c9a96e', text: '#c9a96e' },
  { bg: 'rgba(92,184,92,0.12)',   border: '#5cb85c', text: '#5cb85c' },
  { bg: 'rgba(91,192,222,0.12)',  border: '#5bc0de', text: '#5bc0de' },
  { bg: 'rgba(155,89,182,0.12)',  border: '#9b59b6', text: '#9b59b6' },
  { bg: 'rgba(230,126,34,0.12)',  border: '#e67e22', text: '#e67e22' },
  { bg: 'rgba(26,188,156,0.12)',  border: '#1abc9c', text: '#1abc9c' },
];
const tipoColorMap = {};
let tipoColorIdx = 0;
function getTipoColor(tipo) {
  if (!tipo) return { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
  if (!tipoColorMap[tipo]) {
    tipoColorMap[tipo] = TIPO_COLORS[tipoColorIdx % TIPO_COLORS.length];
    tipoColorIdx++;
  }
  return tipoColorMap[tipo];
}

let allieviSortCol = 'nomeCompleto';
let allieviSortAsc = true;
let editAllieviIdx = null;

async function renderAllievi() {
  $('allieviLoading').style.display=''; $('allieviTableWrap').style.display='none'; $('allieviEmpty').style.display='none';
  if (!allieviData.length) await loadAllievi();
  $('allieviLoading').style.display='none';

  const tipi = [...new Set(allieviData.map(r=>r.tipo).filter(Boolean))].sort();
  $('filterTipoAllievo').innerHTML = '<option value="">Tutti i tipi</option>' + tipi.map(t=>`<option value="${t}">${t}</option>`).join('');

  document.querySelectorAll('#allieviTable th.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.onclick = () => {
      const col = th.dataset.acol;
      if (allieviSortCol === col) allieviSortAsc = !allieviSortAsc;
      else { allieviSortCol = col; allieviSortAsc = true; }
      document.querySelectorAll('#allieviTable th.sortable .sort-arrow').forEach(a => a.textContent = '↕');
      th.querySelector('.sort-arrow').textContent = allieviSortAsc ? '↑' : '↓';
      applyAllieviFilters();
    };
  });

  applyAllieviFilters();
}

function applyAllieviFilters() {
  const search = $('searchAllievi').value.toLowerCase();
  const tipo   = $('filterTipoAllievo').value;
  let filtered = allieviData.filter(r => {
    if (search && !r.nomeCompleto.toLowerCase().includes(search) && !r.mail.toLowerCase().includes(search)) return false;
    if (tipo && r.tipo !== tipo) return false;
    return true;
  });

  filtered = filtered.sort((a, b) => {
    let va = String(a[allieviSortCol]||'').toLowerCase();
    let vb = String(b[allieviSortCol]||'').toLowerCase();
    return allieviSortAsc ? va.localeCompare(vb,'it') : vb.localeCompare(va,'it');
  });

  if (!filtered.length) { $('allieviTableWrap').style.display='none'; $('allieviEmpty').style.display=''; return; }
  $('allieviEmpty').style.display='none'; $('allieviTableWrap').style.display='';

  $('allieviBody').innerHTML = filtered.map(r => {
    const c = getTipoColor(r.tipo);
    const badgeStyle = `background:${c.bg};border:1px solid ${c.border};color:${c.text};display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;`;
    // nome cliccabile → riepilogo allievo
    const nomeSafe = escHtml(r.nomeCompleto).replace(/'/g,'&#39;');
    return `<tr>
      <td style="font-weight:500;cursor:pointer;" onclick="apriRiepilogoAllievo('${nomeSafe}')" title="Apri riepilogo">
        <span style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;">${escHtml(r.nomeCompleto)}</span>
      </td>
      <td><span style="${badgeStyle}">${escHtml(r.tipo)}</span></td>
      <td style="color:var(--text-muted)">${escHtml(String(r.tesseramento))}</td>
      <td style="color:var(--text-muted)">${escHtml(r.cellulare)}</td>
      <td style="color:var(--text-muted)">${escHtml(r.mail)}</td>
      <td style="color:var(--text-dim);font-size:12px;">${escHtml(r.note)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditAllievo('${r._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteAllievo('${r._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function setTipoChip(val) {
  document.querySelectorAll('#aTipoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tipo === val);
  });
  $('aTipo').value = val || '';
}

function openNewAllievo() {
  editAllieviIdx = null;
  $('modalAllieviTitle').textContent = 'Nuovo allievo';
  ['aCognome','aNome','aTesseramento','aCellulare','aMail','aIndirizzo','aNote'].forEach(id => { $(id).value=''; });
  setTipoChip('');
  $('modalAllieviOverlay').style.display = 'flex';
  $('aCognome').focus();
}

function openEditAllievo(id) {
  const r = allieviData.find(r => r._id === id);
  if (!r) return;
  editAllieviIdx = id;
  $('modalAllieviTitle').textContent = 'Modifica allievo';
  $('aCognome').value      = r.cognome;
  $('aNome').value         = r.nome;
  $('aTesseramento').value = r.tesseramento;
  $('aCellulare').value    = r.cellulare;
  $('aMail').value         = r.mail;
  $('aIndirizzo').value    = r.indirizzo;
  $('aNote').value         = r.note;
  setTipoChip(r.tipo);
  $('modalAllieviOverlay').style.display = 'flex';
}

function closeAllieviModal() { $('modalAllieviOverlay').style.display = 'none'; editAllieviIdx = null; }

async function saveAllievo() {
  const cognome     = $('aCognome').value.trim();
  const nome        = $('aNome').value.trim();
  const tipo        = $('aTipo').value.trim();
  const tesseramento= $('aTesseramento').value.trim();
  const cellulare   = $('aCellulare').value.trim();
  const mail        = $('aMail').value.trim();
  const indirizzo   = $('aIndirizzo').value.trim();
  const note        = $('aNote').value.trim();
  const nomeCompleto= `${cognome} ${nome}`.trim();

  if (!cognome && !nome) return alert('Inserisci almeno cognome o nome.');

  const docData = { cognome, nome, nomeCompleto, tipo, tesseramento, cellulare, mail, indirizzo, note };

  try {
    if (editAllieviIdx === null) {
      const id = await fsAdd(COLL_ALLIEVI, docData);
      allieviData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_ALLIEVI, editAllieviIdx, docData);
      const r = allieviData.find(r => r._id === editAllieviIdx);
      if (r) Object.assign(r, docData);
    }
    closeAllieviModal();
    applyAllieviFilters();
  } catch (e) {
    alert('Errore durante il salvataggio.');
  }
}

async function deleteAllievo(id) {
  const r = allieviData.find(r => r._id === id);
  if (!r) return;
  const ok = confirm(`Eliminare l'allievo "${r.nomeCompleto}"?\nQuesta operazione non può essere annullata.`);
  if (!ok) return;
  try {
    await fsDelete(COLL_ALLIEVI, id);
    allieviData = allieviData.filter(r => r._id !== id);
    applyAllieviFilters();
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
  }
}

// ── ISCRIZIONI ────────────────────────────────────────────
const TIPO_ISC_COLORS = {
  'Prova': { bg:'rgba(91,192,222,0.12)',  border:'#5bc0de', text:'#5bc0de' },
  'x1':   { bg:'rgba(201,169,110,0.12)', border:'#c9a96e', text:'#c9a96e' },
  'x5':   { bg:'rgba(155,89,182,0.12)',  border:'#9b59b6', text:'#9b59b6' },
  'x10':  { bg:'rgba(92,184,92,0.12)',   border:'#5cb85c', text:'#5cb85c' },
};

let editIscrizioniIdx = null;

async function renderIscrizioni() {
  $('iscrizioniLoading').style.display=''; $('iscrizioniTableWrap').style.display='none'; $('iscrizioniEmpty').style.display='none';
  if (!iscrizioniData.length) await loadIscrizioni();
  if (!corsiData.length) await loadCorsi();
  if (!allieviData.length) await loadAllievi();
  $('iscrizioniLoading').style.display='none';

  const anni = [...new Set(iscrizioniData.map(r=>r.as).filter(Boolean))].sort().reverse();
  $('filterAS').innerHTML = '<option value="">Tutte le A.S.</option>' + anni.map(a=>`<option value="${a}">${a}</option>`).join('');

  applyIscrizioniFilters();
}

function applyIscrizioniFilters() {
  const search = ($('searchIscrizioni').value||'').toLowerCase();
  const as     = $('filterAS').value;
  const pag    = $('filterPagato').value;
  let filtered = iscrizioniData.filter(r => {
    if (search && !r.allievo.toLowerCase().includes(search) && !r.corso.toLowerCase().includes(search)) return false;
    if (as && r.as !== as) return false;
    if (pag === 'si'  && !isPagato(r.pagato)) return false;
    if (pag === 'no'  &&  isPagato(r.pagato)) return false;
    return true;
  });

  $('iscrizioniCount').textContent = `${filtered.length} iscrizioni`;
  const totale = filtered.reduce((s,r)=>s+r.costo,0);
  $('iscrizioniTotale').textContent = filtered.length ? `Totale: ${fmt(totale)}` : '';

  if (!filtered.length) { $('iscrizioniTableWrap').style.display='none'; $('iscrizioniEmpty').style.display=''; return; }
  $('iscrizioniEmpty').style.display='none'; $('iscrizioniTableWrap').style.display='';

  $('iscrizioniBody').innerHTML = filtered.map(r => {
    const pag  = isPagato(r.pagato);
    const tc   = TIPO_ISC_COLORS[r.tipo] || { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
    const tStyle = `background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;`;
    return `<tr>
      <td style="font-weight:500;cursor:pointer;" onclick="apriRiepilogoAllievo('${escHtml(r.allievo).replace(/'/g,"&#39;")}')" title="Apri riepilogo">
        <span style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;">${escHtml(r.allievo)}</span>
      </td>
      <td><span class="badge badge-gold">${escHtml(r.as)}</span></td>
      <td>${fmtDate(r.data)}</td>
      <td><span style="${tStyle}">${escHtml(r.tipo)}</span></td>
      <td>${escHtml(r.corso)}</td>
      <td>${fmtDate(r.dataPag)}</td>
      <td>
        <span class="badge ${pag?'badge-green':'badge-red'}">${pag?'Sì':'No'}</span>
      </td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${r.costo?fmt(r.costo):'—'}</td>
      <td style="font-size:12px;color:var(--text-muted)">${escHtml(r.note)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditIscrizione('${r._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteIscrizione('${r._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function isPagato(v) {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === 'sì' || s === 'si' || s === 'true' || s === '1' || s === 'yes';
}

function getCostoCorso(nomeCorso, tipo) {
  const corso = corsiData.find(c => c.nome === nomeCorso);
  if (!corso) return 0;
  const map = { 'Prova': corso.prova, 'x1': corso.x1, 'x5': corso.x5, 'x10': corso.x10 };
  return map[tipo] || 0;
}

function openNuovaIscrizione() {
  editIscrizioniIdx = null;
  $('modalIscTitle').textContent = 'Nuova iscrizione';
  $('iAllievo').value = '';
  $('iAS').value = currentAnnoScolastico();
  $('iData').valueAsDate = new Date();
  $('iDataPag').value = '';
  $('iPagato').checked = false;
  $('iNote').value = '';
  $('iCosto').value = '';
  setTipoIscChip('');
  populateCorsiSelect();
  $('modalIscOverlay').style.display = 'flex';
  $('iAllievo').focus();
}

function openEditIscrizione(id) {
  const r = iscrizioniData.find(r => r._id === id);
  if (!r) return;
  editIscrizioniIdx = id;
  $('modalIscTitle').textContent = 'Modifica iscrizione';
  $('iAllievo').value  = r.allievo;
  $('iAS').value       = r.as;
  $('iData').value     = r.data ? (r.data instanceof Date ? r.data.toISOString().split('T')[0] : String(r.data)) : '';
  $('iDataPag').value  = r.dataPag ? (r.dataPag instanceof Date ? r.dataPag.toISOString().split('T')[0] : String(r.dataPag)) : '';
  $('iPagato').checked = isPagato(r.pagato);
  $('iNote').value     = r.note;
  $('iCosto').value    = r.costo || '';
  setTipoIscChip(r.tipo);
  populateCorsiSelect(r.corso);
  $('modalIscOverlay').style.display = 'flex';
}

function setTipoIscChip(val) {
  document.querySelectorAll('#iTipoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tipo === val);
  });
  $('iTipo').value = val || '';
  autoAggiornaCosto();
}

function populateCorsiSelect(selected) {
  const sel = $('iCorso');
  sel.innerHTML = '<option value="">— seleziona corso —</option>' +
    corsiData.map(c => `<option value="${c.nome}"${c.nome===selected?' selected':''}>${c.nome}</option>`).join('');
  autoAggiornaCosto();
}

function autoAggiornaCosto() {
  const corso = $('iCorso') ? $('iCorso').value : '';
  const tipo  = $('iTipo') ? $('iTipo').value : '';
  if (corso && tipo) {
    const costo = getCostoCorso(corso, tipo);
    if (costo) $('iCosto').value = costo;
  }
}

function populateAllieviDatalist() {
  const dl = $('allieviList');
  if (!dl) return;
  dl.innerHTML = allieviData.map(a => `<option value="${escHtml(a.nomeCompleto)}">`).join('');
}

function currentAnnoScolastico() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return m >= 8 ? `${y}/${y+1}` : `${y-1}/${y}`;
}

function closeIscModal() { $('modalIscOverlay').style.display = 'none'; editIscrizioniIdx = null; }

async function saveIscrizione() {
  const allievo = $('iAllievo').value.trim();
  const as      = $('iAS').value.trim();
  const data    = $('iData').value;
  const tipo    = $('iTipo').value;
  const corso   = $('iCorso').value;
  const dataPag = $('iDataPag').value;
  const pagato  = $('iPagato').checked ? 'Sì' : 'No';
  const costo   = parseFloat($('iCosto').value) || 0;
  const note    = $('iNote').value.trim();

  if (!allievo) return alert('Seleziona un allievo.');
  if (!tipo)    return alert('Seleziona il tipo.');
  if (!corso)   return alert('Seleziona un corso.');

  const docData = { allievo, as, data, tipo, corso, dataPag, pagato, costo, note };

  try {
    if (editIscrizioniIdx === null) {
      const id = await fsAdd(COLL_ISCRIZIONI, docData);
      iscrizioniData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_ISCRIZIONI, editIscrizioniIdx, docData);
      const r = iscrizioniData.find(r => r._id === editIscrizioniIdx);
      if (r) Object.assign(r, docData);
    }
    closeIscModal(); applyIscrizioniFilters();
  } catch (e) {
    alert('Errore durante il salvataggio.');
  }
}

async function deleteIscrizione(id) {
  const r = iscrizioniData.find(r => r._id === id);
  if (!r) return;
  if (!confirm(`Eliminare l'iscrizione di "${r.allievo}" — ${r.corso} (${r.tipo})?\nL'operazione non può essere annullata.`)) return;
  try {
    await fsDelete(COLL_ISCRIZIONI, id);
    iscrizioniData = iscrizioniData.filter(r => r._id !== id);
    applyIscrizioniFilters();
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
  }
}

// ── PRESENZE ─────────────────────────────────────────────
let presView        = 'calendario';
let presCalYear     = new Date().getFullYear();
let presCalMonth    = new Date().getMonth();
let editPresIdx     = null;
let presExtraAllievi= [];

async function renderPresenze() {
  if (!presenzeData.length) await loadPresenze();
  if (!corsiData.length)    await loadCorsi();
  if (!allieviData.length)  await loadAllievi();

  const corsi = [...new Set(presenzeData.map(r=>r.corso).filter(Boolean))].sort();
  const fCorso = document.getElementById('presFiltroCorso');
  const prevCorso = fCorso.value;
  fCorso.innerHTML = '<option value="">Tutti i corsi</option>' +
    corsi.map(c=>`<option value="${escHtml(c)}"${c===prevCorso?' selected':''}>${escHtml(c)}</option>`).join('');

  const fMese = document.getElementById('presFiltroMese');
  if (!fMese.value) {
    const now = new Date();
    fMese.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }

  renderPresView();
}

function renderPresView() {
  const view = presView;
  const el   = document.getElementById('presView');
  if (!el) return;
  if (view === 'calendario') renderPresCalendario(el);
  else if (view === 'elenco') renderPresElenco(el);
  else if (view === 'corso')  renderPresCorsо(el);
  else if (view === 'allievo') renderPresAllievo(el);
}

function filteredPresenze() {
  const filtroCorso = (document.getElementById('presFiltroCorso')||{}).value || '';
  const filtroMese  = (document.getElementById('presFiltroMese')||{}).value  || '';
  return presenzeData.filter(r => {
    if (filtroCorso && r.corso !== filtroCorso) return false;
    if (filtroMese) {
      const [fy, fm] = filtroMese.split('-');
      const d = new Date(r.giorno);
      if (isNaN(d)) return true;
      if (d.getFullYear() !== parseInt(fy) || d.getMonth()+1 !== parseInt(fm)) return false;
    }
    return true;
  });
}

// ── VISTA CALENDARIO ──────────────────────────────────────
function renderPresCalendario(el) {
  const filtroMese = (document.getElementById('presFiltroMese')||{}).value || '';
  let y = presCalYear, m = presCalMonth;
  if (filtroMese) {
    const [fy,fm] = filtroMese.split('-');
    y = parseInt(fy); m = parseInt(fm)-1;
    presCalYear = y; presCalMonth = m;
  }

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;
  const monthLabel = new Date(y, m, 1).toLocaleDateString('it-IT', {month:'long', year:'numeric'});
  const today = new Date(); today.setHours(0,0,0,0);

  const byDay = {};
  filteredPresenze().forEach(r => {
    const d = new Date(r.giorno);
    if (isNaN(d)) return;
    if (d.getFullYear()===y && d.getMonth()===m) {
      const k = d.getDate();
      if (!byDay[k]) byDay[k] = [];
      byDay[k].push(r);
    }
  });

  const giorni = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  let cells = '';
  for (let i=0; i<startOffset; i++) cells += `<div class="pres-cal-day pres-cal-empty"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const dt = new Date(y, m, d);
    const isToday = dt.getTime() === today.getTime();
    const records = byDay[d] || [];
    const pills = records.map(r =>
      `<div class="pres-cal-pill" title="${escHtml(r.corso)}: ${escHtml(r.allievi.join(', '))}"
        onclick="event.stopPropagation();openEditPresenza('${r._id}')">${escHtml(r.corso)}</div>`
    ).join('');
    const dayStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += `<div class="pres-cal-day${isToday?' pres-cal-today':''}${records.length?' pres-cal-has-data':''}"
      onclick="openPresForDay('${dayStr}', null)">
      <div class="pres-cal-day-num">${d}</div>
      <div class="pres-cal-dot">${pills}</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="pres-cal-nav">
      <button class="pres-cal-btn" id="calPrev">&#8249;</button>
      <div class="pres-cal-nav-title">${monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</div>
      <button class="pres-cal-btn" id="calNext">&#8250;</button>
    </div>
    <div class="pres-cal-grid">
      ${giorni.map(g=>`<div class="pres-cal-head">${g}</div>`).join('')}
      ${cells}
    </div>`;

  document.getElementById('calPrev').onclick = () => {
    presCalMonth--; if (presCalMonth<0) { presCalMonth=11; presCalYear--; }
    const fMese = document.getElementById('presFiltroMese');
    fMese.value = `${presCalYear}-${String(presCalMonth+1).padStart(2,'0')}`;
    renderPresView();
  };
  document.getElementById('calNext').onclick = () => {
    presCalMonth++; if (presCalMonth>11) { presCalMonth=0; presCalYear++; }
    const fMese = document.getElementById('presFiltroMese');
    fMese.value = `${presCalYear}-${String(presCalMonth+1).padStart(2,'0')}`;
    renderPresView();
  };
}

// ── VISTA ELENCO ──────────────────────────────────────────
function renderPresElenco(el) {
  const data = filteredPresenze().sort((a,b) => new Date(b.giorno)-new Date(a.giorno));
  if (!data.length) { el.innerHTML = '<div class="table-empty">Nessuna presenza nel periodo selezionato.</div>'; return; }

  el.innerHTML = `
    <div class="table-wrap">
      ${data.map(r => `
        <div class="pres-elenco-row">
          <div class="pres-elenco-date">${fmtDate(r.giorno)}</div>
          <div class="pres-elenco-corso">${escHtml(r.corso)}</div>
          <div class="pres-elenco-allievi">
            ${r.allievi.map(a=>`<span class="pres-allievo-chip">${escHtml(a)}</span>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-left:auto;white-space:nowrap;">${r.allievi.length} pres.</div>
          <div class="pres-elenco-actions" style="display:flex;gap:4px;margin-left:10px;">
            <button class="btn-table" onclick="openEditPresenza('${r._id}')" title="Modifica">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
            </button>
            <button class="btn-table btn-del" onclick="deletePresenza('${r._id}')" title="Elimina">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── VISTA PER CORSO ───────────────────────────────────────
function renderPresCorsо(el) {
  const data = filteredPresenze();
  const corsiMap = {};
  data.forEach(r => {
    if (!corsiMap[r.corso]) corsiMap[r.corso] = [];
    corsiMap[r.corso].push(r);
  });
  if (!Object.keys(corsiMap).length) { el.innerHTML = '<div class="table-empty">Nessuna presenza nel periodo.</div>'; return; }

  el.innerHTML = Object.entries(corsiMap).sort().map(([corso, records]) => {
    const tuttiAllievi = {};
    records.forEach(r => r.allievi.forEach(a => { tuttiAllievi[a] = (tuttiAllievi[a]||0)+1; }));
    const allieviRanked = Object.entries(tuttiAllievi).sort((a,b)=>b[1]-a[1]);
    const totLezioni = records.length;

    return `
      <div class="card pres-corso-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="font-size:15px;font-weight:500;flex:1;">${escHtml(corso)}</div>
          <span class="badge badge-gold">${totLezioni} lez.</span>
          <span class="badge badge-gray">${allieviRanked.length} allievi</span>
        </div>
        <div class="pres-allievo-grid">
          ${allieviRanked.map(([nome,count]) => `
            <div class="pres-allievo-row">
              <div class="pres-allievo-nome">${escHtml(nome)}</div>
              <div class="pres-allievo-count">${count}/${totLezioni} pres.</div>
              <div class="pres-heat-bar-wrap">
                <div class="pres-heat-bar" style="width:${Math.round(count/totLezioni*100)}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-left:8px;width:32px;text-align:right;">${Math.round(count/totLezioni*100)}%</div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ── VISTA PER ALLIEVO ─────────────────────────────────────
function renderPresAllievo(el) {
  const data = filteredPresenze();
  if (!data.length) { el.innerHTML = '<div class="table-empty">Nessuna presenza nel periodo.</div>'; return; }

  const allieviMap = {};
  data.forEach(r => r.allievi.forEach(a => {
    if (!allieviMap[a]) allieviMap[a] = { count: 0, corsi: {} };
    allieviMap[a].count++;
    allieviMap[a].corsi[r.corso] = (allieviMap[a].corsi[r.corso]||0)+1;
  }));
  const sorted = Object.entries(allieviMap).sort((a,b)=>b[1].count-a[1].count);
  const maxCount = sorted[0]?.[1]?.count || 1;

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Presenze per allievo — ${data.length} lezioni registrate</div>
      <div class="pres-allievo-grid">
        ${sorted.map(([nome, info]) => {
          const corsiStr = Object.entries(info.corsi).map(([c,n])=>`${c} (${n})`).join(' · ');
          return `
            <div class="pres-allievo-row">
              <div class="pres-allievo-nome">${escHtml(nome)}</div>
              <div class="pres-allievo-count">${info.count} pres.</div>
              <div class="pres-heat-bar-wrap">
                <div class="pres-heat-bar" style="width:${Math.round(info.count/maxCount*100)}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-dim);flex:2;padding-left:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(corsiStr)}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── MODAL PRESENZA ────────────────────────────────────────
function openPresForDay(giorno, corso) {
  editPresIdx     = null;
  presExtraAllievi= [];
  document.getElementById('modalPresTitle').textContent = 'Registra presenza';
  document.getElementById('pGiorno').value = giorno || new Date().toISOString().split('T')[0];
  document.getElementById('pNote').value   = '';
  populatePCorso(corso);
  renderPresChecklist([]);
  document.getElementById('presExtraList').innerHTML = '';
  document.getElementById('pExtraAllievo').value = '';
  document.getElementById('modalPresOverlay').style.display = 'flex';
}

function openNuovaPresenza() {
  openPresForDay(new Date().toISOString().split('T')[0], null);
}

function openEditPresenza(id) {
  const r = presenzeData.find(r => r._id === id);
  if (!r) return;
  editPresIdx     = id;
  presExtraAllievi= [];
  document.getElementById('modalPresTitle').textContent = 'Modifica presenza';
  document.getElementById('pGiorno').value = r.giorno;
  document.getElementById('pNote').value   = r.note || '';
  populatePCorso(r.corso);
  renderPresChecklist(r.allievi);
  document.getElementById('presExtraList').innerHTML = '';
  document.getElementById('pExtraAllievo').value = '';
  document.getElementById('modalPresOverlay').style.display = 'flex';
}

function populatePCorso(selected) {
  const sel = document.getElementById('pCorso');
  sel.innerHTML = '<option value="">— seleziona —</option>' +
    corsiData.map(c=>`<option value="${escHtml(c.nome)}"${c.nome===selected?' selected':''}>${escHtml(c.nome)}</option>`).join('');
  const getChecked = () => editPresIdx ? ((presenzeData.find(r=>r._id===editPresIdx)||{}).allievi||[]) : [];
  if (selected) renderPresChecklist(getChecked());
  sel.onchange = () => renderPresChecklist([]);
}

function getAllieviForCorso(nomeCorso) {
  const iscr = [...new Set(iscrizioniData.filter(r => r.corso === nomeCorso).map(r => r.allievo))]
    .sort((a,b)=>a.localeCompare(b,'it'));
  return iscr;
}

// Helper: lezioni totali da tipo iscrizione
function lezioniDaTipo(tipo) {
  if (tipo === 'x1')    return 1;
  if (tipo === 'x5')    return 5;
  if (tipo === 'x10')   return 10;
  if (tipo === 'Prova') return 1;
  return 0;
}

// Helper: lezioni rimanenti per allievo in un corso
function lezioniRimanentePerAllievo(nomeAllievo, nomeCorso) {
  const iscrizioni = iscrizioniData.filter(r => r.allievo === nomeAllievo && r.corso === nomeCorso);
  const totLezioni = iscrizioni.reduce((s, r) => s + lezioniDaTipo(r.tipo), 0);
  if (totLezioni === 0) return null;
  const presTot = presenzeData.filter(p => p.corso === nomeCorso && p.allievi.includes(nomeAllievo)).length;
  return { totLezioni, presTot, rimanenti: Math.max(0, totLezioni - presTot) };
}

function renderPresChecklist(checked) {
  const nomeCorso = document.getElementById('pCorso').value;
  const list      = document.getElementById('presAllieviList');
  if (!nomeCorso) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Seleziona prima un corso</div>';
    updatePresConteggio();
    return;
  }

  const iscritti  = getAllieviForCorso(nomeCorso);
  const checkedSet= new Set(checked);

  if (!iscritti.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Nessun allievo iscritto a questo corso.</div>';
    updatePresConteggio();
    return;
  }

  const allChecked = iscritti.every(n => checkedSet.has(n));
  list.innerHTML = `
    <label class="pres-check-item" id="presCheckAll" data-nome="__all__"
      style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:8px;">
      <input type="checkbox" id="cbSelectAll" ${allChecked?'checked':''}
        onchange="toggleSelectAll(this)">
      <span class="pres-check-name" style="font-weight:600;color:var(--text);">Seleziona tutti</span>
      <span style="font-size:10px;color:var(--text-dim);">${iscritti.length} iscritti</span>
    </label>
    ${iscritti.map(nome => {
      const isCk = checkedSet.has(nome);
      const rimInfo = lezioniRimanentePerAllievo(nome, nomeCorso);
      let alertBadge = '';
      if (rimInfo) {
        if (rimInfo.rimanenti === 0)
          alertBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(224,85,85,0.15);color:#e05555;margin-left:auto;flex-shrink:0;">ESAURITO</span>';
        else if (rimInfo.rimanenti === 1)
          alertBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(255,165,0,0.15);color:orange;margin-left:auto;flex-shrink:0;">ultima lezione</span>';
        else
          alertBadge = `<span style="font-size:10px;color:var(--text-dim);margin-left:auto;flex-shrink:0;">${rimInfo.rimanenti} rim.</span>`;
      }
      return `<label class="pres-check-item${isCk?' checked':''}" data-nome="${escHtml(nome)}">
        <input type="checkbox" ${isCk?'checked':''} onchange="onPresCheck(this)">
        <span class="pres-check-name">${escHtml(nome)}</span>
        ${alertBadge}
      </label>`;
    }).join('')}`;

  updatePresConteggio();
}

function toggleSelectAll(cb) {
  document.querySelectorAll('#presAllieviList .pres-check-item:not(#presCheckAll) input[type=checkbox]').forEach(c => {
    c.checked = cb.checked;
    c.closest('.pres-check-item').classList.toggle('checked', cb.checked);
  });
  updatePresConteggio();
}

function onPresCheck(cb) {
  const item = cb.closest('.pres-check-item');
  if (item) item.classList.toggle('checked', cb.checked);
  const all = [...document.querySelectorAll('#presAllieviList .pres-check-item:not(#presCheckAll) input[type=checkbox]')];
  const cbAll = document.getElementById('cbSelectAll');
  if (cbAll) cbAll.checked = all.every(c=>c.checked);
  updatePresConteggio();
}

function updatePresConteggio() {
  const fromList = document.querySelectorAll('#presAllieviList input[type=checkbox]:checked').length;
  const count = fromList + presExtraAllievi.length;
  const label = document.getElementById('presConteggioLabel');
  if (label) label.textContent = count > 0 ? `(${count} presenti)` : '';
}

function addPresExtra() {
  const val = document.getElementById('pExtraAllievo').value.trim();
  if (!val) return;
  const inList = [...document.querySelectorAll('#presAllieviList .pres-check-item:not(#presCheckAll)')]
    .find(el => el.dataset.nome === val);
  if (inList) {
    const cb = inList.querySelector('input[type=checkbox]');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    document.getElementById('pExtraAllievo').value = '';
    return;
  }
  if (presExtraAllievi.includes(val)) { document.getElementById('pExtraAllievo').value=''; return; }
  presExtraAllievi.push(val);
  renderExtraChips();
  document.getElementById('pExtraAllievo').value = '';
  updatePresConteggio();
}

function removePresExtra(nome) {
  presExtraAllievi = presExtraAllievi.filter(n=>n!==nome);
  renderExtraChips();
  updatePresConteggio();
}

function renderExtraChips() {
  document.getElementById('presExtraList').innerHTML = presExtraAllievi.map(nome =>
    `<span class="pres-extra-chip">${escHtml(nome)}
      <button onclick="removePresExtra('${escHtml(nome)}')">&times;</button>
    </span>`
  ).join('');
}

function closePresModal() {
  document.getElementById('modalPresOverlay').style.display = 'none';
  editPresIdx = null; presExtraAllievi = [];
}

async function savePresenza() {
  const giorno = document.getElementById('pGiorno').value;
  const corso  = document.getElementById('pCorso').value;
  const note   = document.getElementById('pNote').value.trim();
  if (!giorno) return alert('Inserisci la data.');
  if (!corso)  return alert('Seleziona un corso.');

  const fromList = [...document.querySelectorAll('#presAllieviList input[type=checkbox]:checked')]
    .map(cb => cb.closest('.pres-check-item').dataset.nome)
    .filter(n => n && n !== '__all__');
  const allPresenti = [...new Set([...fromList, ...presExtraAllievi])].sort((a,b)=>a.localeCompare(b,'it'));

  const docData = { giorno, corso, allievi: allPresenti, note };

  try {
    if (editPresIdx === null) {
      const id = await fsAdd(COLL_PRESENZE, docData);
      presenzeData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_PRESENZE, editPresIdx, docData);
      const r = presenzeData.find(r=>r._id===editPresIdx);
      if (r) Object.assign(r, docData);
    }
    closePresModal(); renderPresView();
  } catch (e) {
    alert('Errore durante il salvataggio.');
  }
}

async function deletePresenza(id) {
  const r = presenzeData.find(r=>r._id===id);
  if (!r) return;
  if (!confirm(`Eliminare la presenza del ${fmtDate(r.giorno)} — ${r.corso}?`)) return;
  try {
    await fsDelete(COLL_PRESENZE, id);
    presenzeData = presenzeData.filter(r=>r._id!==id);
    renderPresView();
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
  }
}

// ══════════════════════════════════════════════════════════
//  RIEPILOGO ALLIEVO
// ══════════════════════════════════════════════════════════

function initRiepilogoAllievo() {
  const input = $('riepilogoSearch');
  const btn   = $('btnRiepilogoCerca');
  if (!input || !btn) return;

  const cerca = async () => {
    const val = input.value.trim();
    if (!val) return;
    if (!iscrizioniData.length) await loadIscrizioni();
    if (!presenzeData.length)   await loadPresenze();
    if (!corsiData.length)       await loadCorsi();
    if (!allieviData.length)     await loadAllievi();
    // Popola datalist
    const dl = $('riepilogoAllieviList');
    if (dl) dl.innerHTML = allieviData.map(a=>`<option value="${escHtml(a.nomeCompleto)}">`).join('');
    document.getElementById('riepilogoAllievoTitolo').textContent = val;
    document.getElementById('riepilogoAllievoSub').textContent    = 'Storico iscrizioni, pagamenti e presenze.';
    renderRiepilogoAllievo(val);
  };

  btn.addEventListener('click', cerca);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') cerca(); });
}

// Popola datalist riepilogo quando si entra nella sezione
async function renderRiepilogoSection() {
  if (!allieviData.length) await loadAllievi();
  const dl = $('riepilogoAllieviList');
  if (dl) dl.innerHTML = allieviData.map(a=>`<option value="${escHtml(a.nomeCompleto)}">`).join('');
}
async function apriRiepilogoAllievo(nomeCompleto) {
  if (!iscrizioniData.length) await loadIscrizioni();
  if (!presenzeData.length)   await loadPresenze();
  if (!corsiData.length)       await loadCorsi();

  document.getElementById('riepilogoAllievoTitolo').textContent = nomeCompleto;
  document.getElementById('riepilogoAllievoSub').textContent    = 'Storico iscrizioni, pagamenti e presenze.';
  document.getElementById('riepilogoSearch').value = nomeCompleto;

  showSection('riepilogo-allievo');
  renderRiepilogoAllievo(nomeCompleto);
}

function renderRiepilogoAllievo(nomeCompleto) {
  const el = document.getElementById('riepilogoAllievoContent');
  if (!el) return;

  const iscrizioni = iscrizioniData.filter(r => r.allievo === nomeCompleto);
  const presenze   = presenzeData.filter(r => r.allievi.includes(nomeCompleto));

  const riepilogo = iscrizioni.map(isc => {
    const lezioniTotali   = lezioniDaTipo(isc.tipo);
    const presenzeAlCorso = presenze.filter(p => p.corso === isc.corso).length;
    const consumate       = Math.min(lezioniTotali, presenzeAlCorso);
    const rimanenti       = Math.max(0, lezioniTotali - presenzeAlCorso);
    return { ...isc, lezioniTotali, consumate, rimanenti };
  });

  const totPagato   = iscrizioni.filter(r => isPagato(r.pagato)).length;
  const totDaPagare = iscrizioni.length - totPagato;
  const importoTot  = iscrizioni.reduce((s, r) => s + (r.costo || 0), 0);
  const importoPag  = iscrizioni.filter(r => isPagato(r.pagato)).reduce((s, r) => s + (r.costo || 0), 0);

  // Anni e corsi per filtri presenze
  const corsiPresenze = [...new Set(presenze.map(p => p.corso).filter(Boolean))].sort();
  const anniPresenze  = [...new Set(presenze.map(p => p.giorno?.slice(0,4)).filter(Boolean))].sort().reverse();

  el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:24px;">
      <div class="kpi-card"><div class="kpi-label">Iscrizioni</div><div class="kpi-value">${iscrizioni.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pagamenti OK</div><div class="kpi-value kpi-green">${totPagato}</div></div>
      <div class="kpi-card"><div class="kpi-label">Da pagare</div><div class="kpi-value${totDaPagare > 0 ? ' kpi-red' : ''}">${totDaPagare}</div></div>
      <div class="kpi-card"><div class="kpi-label">Totale</div><div class="kpi-value">${fmt(importoTot)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Incassato</div><div class="kpi-value kpi-green">${fmt(importoPag)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Presenze</div><div class="kpi-value">${presenze.length}</div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Iscrizioni e lezioni rimanenti</div>
      ${!riepilogo.length ? '<div class="table-empty" style="margin-top:12px;">Nessuna iscrizione.</div>' : `
      <div class="table-wrap" style="margin-top:12px;max-height:320px;overflow-y:auto;">
        <table class="data-table">
          <thead style="position:sticky;top:0;z-index:2;background:var(--surface);">
            <tr>
              <th>A.S.</th><th>Data</th><th>Corso</th><th>Tipo</th>
              <th>Pagato</th><th style="text-align:right">Costo</th>
              <th style="text-align:center">Tot.</th>
              <th>Progresso</th>
              <th style="text-align:center">Rimaste</th>
            </tr>
          </thead>
          <tbody>
            ${riepilogo.map(r => {
              const pct = r.lezioniTotali > 0 ? Math.round(r.consumate / r.lezioniTotali * 100) : 0;
              const rimColor = r.rimanenti === 0 ? 'color:var(--text-dim)' : r.rimanenti <= 2 ? 'color:orange' : 'color:var(--text)';
              const pagatoOk = isPagato(r.pagato);
              return `<tr>
                <td style="color:var(--text-muted)">${escHtml(r.as)}</td>
                <td style="color:var(--text-muted)">${fmtDate(r.data)}</td>
                <td style="font-weight:500">${escHtml(r.corso)}</td>
                <td><span style="background:var(--accent-dim);border:1px solid rgba(201,169,110,0.2);color:var(--accent);padding:2px 8px;border-radius:99px;font-size:11px;">${escHtml(r.tipo)}</span></td>
                <td>${pagatoOk
                  ? `<span style="color:var(--green);font-size:12px;">✓ Sì</span>${r.dataPag ? `<br><span style="color:var(--text-dim);font-size:10px;">${fmtDate(r.dataPag)}</span>` : ''}`
                  : '<span style="color:var(--red);font-size:12px;">✗ No</span>'}</td>
                <td style="text-align:right;font-weight:500">${fmt(r.costo)}</td>
                <td style="text-align:center;color:var(--text-muted)">${r.lezioniTotali}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden;min-width:60px;">
                      <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:99px;"></div>
                    </div>
                    <span style="font-size:11px;color:var(--text-muted)">${r.consumate}/${r.lezioniTotali}</span>
                  </div>
                </td>
                <td style="text-align:center;">
                  <span style="font-size:14px;font-weight:700;${rimColor}">
                    ${r.rimanenti}${r.rimanenti <= 2 && r.rimanenti > 0 ? ' ⚠' : r.rimanenti === 0 ? ' ✓' : ''}
                  </span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <div class="card-title">Storico presenze</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;margin-bottom:12px;">
        <select class="filter-select" id="riepilogoPresCorso" style="width:180px;">
          <option value="">Tutti i corsi</option>
          ${corsiPresenze.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
        </select>
        <select class="filter-select" id="riepilogoPresAnno" style="width:120px;">
          <option value="">Tutti gli anni</option>
          ${anniPresenze.map(a=>`<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div id="riepilogoPresTable">
        ${buildPresenzeTable(presenze)}
      </div>
    </div>
  `;

  // Filtri presenze
  const applyPresFilter = () => {
    const corso = document.getElementById('riepilogoPresCorso')?.value || '';
    const anno  = document.getElementById('riepilogoPresAnno')?.value  || '';
    const filtered = presenze.filter(p => {
      if (corso && p.corso !== corso) return false;
      if (anno  && !p.giorno?.startsWith(anno)) return false;
      return true;
    });
    const tEl = document.getElementById('riepilogoPresTable');
    if (tEl) tEl.innerHTML = buildPresenzeTable(filtered);
  };
  document.getElementById('riepilogoPresCorso')?.addEventListener('change', applyPresFilter);
  document.getElementById('riepilogoPresAnno')?.addEventListener('change', applyPresFilter);
}

function buildPresenzeTable(presenze) {
  const sorted = [...presenze].sort((a,b) => b.giorno.localeCompare(a.giorno));
  if (!sorted.length) return '<div class="table-empty" style="margin-top:0;">Nessuna presenza.</div>';
  return `
    <div class="table-wrap" style="max-height:300px;overflow-y:auto;">
      <table class="data-table">
        <thead style="position:sticky;top:0;z-index:2;background:var(--surface);">
          <tr><th>Data</th><th>Corso</th><th>Note</th></tr>
        </thead>
        <tbody>
          ${sorted.map(p=>`
          <tr>
            <td style="white-space:nowrap">${fmtDate(p.giorno)}</td>
            <td>${escHtml(p.corso)}</td>
            <td style="color:var(--text-dim);font-size:12px;">${escHtml(p.note||'—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── CHART CONFIG ──────────────────────────────────────────
function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#888', font: { size: 11 }, boxWidth: 10, padding: 12 } },
      tooltip: { backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#f0ede8', bodyColor: '#888', callbacks: {
        label: ctx => ' ' + fmt(ctx.raw)
      }}
    },
    scales: {
      x: { ticks: { color: '#666', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#666', font: { size: 11 }, callback: v => '€'+v.toLocaleString('it-IT') }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };
}

function donutOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { color: '#888', font: { size: 11 }, boxWidth: 10, padding: 14 } },
      tooltip: { backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#f0ede8', bodyColor: '#888', callbacks: {
        label: ctx => ' ' + fmt(ctx.raw)
      }}
    }
  };
}

function donutColors() {
  return ['#c9a96e','#5cb85c','#e05555','#5bc0de','#9b59b6','#e67e22','#1abc9c','#e74c3c','#3498db','#f39c12'];
}

// ── UTILITY ──────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── TEMA ─────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('danza_theme', theme);
  const sun  = $('iconSun');
  const moon = $('iconMoon');
  if (sun && moon) {
    sun.style.display  = theme === 'light' ? '' : 'none';
    moon.style.display = theme === 'light' ? 'none' : '';
  }
  const gridColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
  const tickColor = theme === 'light' ? '#999' : '#666';
  Chart.defaults.color = tickColor;
  Chart.defaults.borderColor = gridColor;
  const active = document.querySelector('.section.active');
  if (active) {
    const id = active.id.replace('sec-','');
    if (['dashboard','annuale','generale'].includes(id)) {
      setTimeout(() => {
        if (id==='dashboard') renderDashboard();
        if (id==='annuale')   updateAnnuale(parseInt($('annoRiep').value), parseInt($('meseRiep').value)||null);
        if (id==='generale')  renderGenerale();
      }, 50);
    }
  }
}

// ── COMPENSI ──────────────────────────────────────────────
function renderCompensi() {
  if (!speseData.length) { $('compensiContent').innerHTML = LOADING_HTML; return; }

  const annoSel = $('compensiAnno');
  const anni = [...new Set(
    speseData.filter(r => r.categoria === 'Contributo team').map(r => r.data?.getFullYear()).filter(Boolean)
  )].sort((a,b) => b-a);

  if (!anni.length) {
    $('compensiContent').innerHTML = '<div class="table-empty">Nessun pagamento con categoria "Contributo team".</div>';
    return;
  }

  const curAnno = parseInt(annoSel.value) && anni.includes(parseInt(annoSel.value))
    ? parseInt(annoSel.value) : anni[0];
  annoSel.innerHTML = anni.map(a => `<option value="${a}"${a===curAnno?' selected':''}>${a}</option>`).join('');

  const rows = speseData.filter(r => r.categoria === 'Contributo team' && r.data?.getFullYear() === curAnno);

  if (!rows.length) {
    $('compensiContent').innerHTML = '<div class="table-empty">Nessun compenso registrato per questo anno.</div>';
    return;
  }

  // Group by name extracted from description: "Lucà Rossella - compenso Gennaio" → key "Lucà Rossella"
  const groupMap = {};
  rows.forEach(r => {
    const key = r.descrizione.includes(' - ') ? r.descrizione.split(' - ')[0].trim() : r.descrizione.trim();
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(r);
  });

  const groupKeys = Object.keys(groupMap).sort();
  const copyIcon = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 10V3a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const csvIcon  = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  const tables = groupKeys.map((key, idx) => {
    const title   = key.split(' ').pop();
    const entries = [...groupMap[key]].sort((a,b) => (a.data||0) - (b.data||0));
    const totale  = entries.reduce((s,r) => s + r.costo, 0);
    return `<div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">${escHtml(title)}</div>
        <div style="display:flex;gap:6px">
          <button class="btn-secondary" data-comp-copy="${idx}" style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:5px">${copyIcon} Copia</button>
          <button class="btn-secondary" data-comp-csv="${idx}"  style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:5px">${csvIcon} CSV</button>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:0">
        <table class="data-table">
          <thead><tr>
            <th>Data</th>
            <th>Descrizione</th>
            <th style="text-align:right">Costo</th>
          </tr></thead>
          <tbody>
            ${entries.map(r => `<tr>
              <td style="white-space:nowrap;color:var(--text-muted)">${fmtDate(r.data)}</td>
              <td>${escHtml(r.descrizione)}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${fmt(r.costo)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="pivot-total">
            <td colspan="2" style="text-align:right">TOT</td>
            <td style="text-align:right;color:var(--accent)">${fmt(totale)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;
  }).join('');

  $('compensiContent').innerHTML = tables;

  groupKeys.forEach((key, idx) => {
    const entries = [...groupMap[key]].sort((a,b) => (a.data||0) - (b.data||0));
    const totale  = entries.reduce((s,r) => s + r.costo, 0);

    const n = (v) => v.toFixed(2).replace('.', ',');

    const copyBtn = $('compensiContent').querySelector(`[data-comp-copy="${idx}"]`);
    copyBtn?.addEventListener('click', () => {
      const text = [
        'Data\tDescrizione\tCosto',
        ...entries.map(r => `${fmtDate(r.data)}\t${r.descrizione}\t${n(r.costo)}`),
        `TOT\t\t${n(totale)}`
      ].join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.textContent = '✓ Copiato';
        setTimeout(() => { copyBtn.innerHTML = orig; }, 1500);
      });
    });

    const csvBtn = $('compensiContent').querySelector(`[data-comp-csv="${idx}"]`);
    csvBtn?.addEventListener('click', () => {
      const lines = [
        'Data;Descrizione;Costo',
        ...entries.map(r => `${fmtDate(r.data)};"${r.descrizione.replace(/"/g,'""')}";${n(r.costo)}`),
        `TOT;;${n(totale)}`
      ];
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `compensi_${key.replace(/\s+/g,'_')}_${curAnno}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  });
}

// ── NOTA MENSILE ──────────────────────────────────────────
function renderNotaMensile() {
  if (!speseData.length) { $('notaMensileContent').innerHTML = LOADING_HTML; return; }

  const annoSel = $('notaAnno');
  const meseSel = $('notaMese');

  const anni = [...new Set(speseData.map(r => r.data?.getFullYear()).filter(Boolean))].sort((a,b) => b-a);
  if (!anni.length) { $('notaMensileContent').innerHTML = '<div class="table-empty">Nessun dato disponibile.</div>'; return; }

  const curAnno = anni.includes(parseInt(annoSel.value)) ? parseInt(annoSel.value) : anni[0];
  annoSel.innerHTML = anni.map(a => `<option value="${a}"${a===curAnno?' selected':''}>${a}</option>`).join('');

  const mesiDisp = [...new Set(
    speseData.filter(r => r.data?.getFullYear()===curAnno).map(r => r.data?.getMonth()).filter(v => v!=null)
  )].sort((a,b) => a-b);

  const curMese = mesiDisp.includes(parseInt(meseSel.value)) ? parseInt(meseSel.value) : mesiDisp[mesiDisp.length-1];
  meseSel.innerHTML = mesiDisp.map(m => `<option value="${m}"${m===curMese?' selected':''}>${MESI_NOMI[m]}</option>`).join('');

  const rows = speseData
    .filter(r => r.data?.getFullYear()===curAnno && r.data?.getMonth()===curMese)
    .sort((a,b) => (a.data||0) - (b.data||0));

  if (!rows.length) { $('notaMensileContent').innerHTML = '<div class="table-empty">Nessuna transazione per questo mese.</div>'; return; }

  // totali
  const totEnt     = rows.filter(r=>r.tipo==='Entrate').reduce((s,r)=>s+r.costo,0);
  const totUsc     = rows.filter(r=>r.tipo==='Uscite').reduce((s,r)=>s+r.costo,0);
  const cassaRow   = buildCassaMensile().find(r=>r.year===curAnno && r.month===curMese);
  const inCassa    = cassaRow ? cassaRow.cassa : null;

  const totCassaEnt = rows.filter(r=>r.tipo==='Entrate'&&r.pagamento==='Contanti').reduce((s,r)=>s+r.costo,0);
  const totCassaUsc = rows.filter(r=>r.tipo==='Uscite' &&r.pagamento==='Contanti').reduce((s,r)=>s+r.costo,0);
  const totBancaEnt = rows.filter(r=>r.tipo==='Entrate'&&r.pagamento!=='Contanti').reduce((s,r)=>s+r.costo,0);
  const totBancaUsc = rows.filter(r=>r.tipo==='Uscite' &&r.pagamento!=='Contanti').reduce((s,r)=>s+r.costo,0);

  const fmtCell = (v) => v ? `<span style="font-variant-numeric:tabular-nums">${fmt(v)}</span>` : '';

  const copyIcon = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 10V3a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const csvIcon  = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const pdfIcon  = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 1h5.5L11 3.5V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3"/><path d="M8.5 1v3H11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="4" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="4" y1="9.5" x2="7.5" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  $('notaMensileContent').innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:16px">
        <div>
          <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;color:var(--text)">Nota mensile</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${MESI_NOMI[curMese]} ${curAnno}</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
          <div style="text-align:right;min-width:160px">
            <div style="font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);margin-bottom:7px">Totali</div>
            <div style="font-size:12px;margin-bottom:3px;display:flex;justify-content:space-between;gap:16px"><span style="color:var(--text-muted)">Entrate</span><span style="color:var(--green);font-weight:500">${fmt(totEnt)}</span></div>
            <div style="font-size:12px;margin-bottom:3px;display:flex;justify-content:space-between;gap:16px"><span style="color:var(--text-muted)">Uscite</span><span style="color:var(--red);font-weight:500">${fmt(totUsc)}</span></div>
            ${inCassa!==null?`<div style="font-size:12px;display:flex;justify-content:space-between;gap:16px"><span style="color:var(--text-muted)">In cassa</span><span style="color:var(--accent);font-weight:500">${fmt(inCassa)}</span></div>`:''}
          </div>
          <div style="display:flex;gap:6px;align-self:flex-start">
            <button class="btn-secondary" id="notaCopyBtn" style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:5px">${copyIcon} Copia</button>
            <button class="btn-secondary" id="notaCsvBtn"  style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:5px">${csvIcon} CSV</button>
            <button class="btn-secondary" id="notaPdfBtn"  style="padding:4px 10px;font-size:11px;display:flex;align-items:center;gap:5px">${pdfIcon} PDF</button>
          </div>
        </div>
      </div>
      <div class="table-wrap" style="margin-top:0;overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th rowspan="2" style="border-right:1px solid var(--border2)">Data</th>
              <th rowspan="2" style="border-right:1px solid var(--border2)">Descrizione</th>
              <th colspan="2" style="text-align:center;border-bottom:1px solid var(--border);border-right:1px solid var(--border2)">Cassa</th>
              <th colspan="2" style="text-align:center;border-bottom:1px solid var(--border)">Banca</th>
            </tr>
            <tr>
              <th style="text-align:right;color:var(--green);border-right:1px solid var(--border)">Entrate</th>
              <th style="text-align:right;color:var(--red);border-right:1px solid var(--border2)">Uscite</th>
              <th style="text-align:right;color:var(--green);border-right:1px solid var(--border)">Entrate</th>
              <th style="text-align:right;color:var(--red)">Uscite</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const c = r.pagamento === 'Contanti';
              const e = r.tipo === 'Entrate';
              return `<tr>
                <td style="white-space:nowrap;color:var(--text-muted);border-right:1px solid var(--border)">${fmtDate(r.data)}</td>
                <td style="border-right:1px solid var(--border)">${escHtml(r.descrizione)}</td>
                <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${c&&e?fmtCell(r.costo):''}</td>
                <td style="text-align:right;color:var(--red);border-right:1px solid var(--border2)">${c&&!e?fmtCell(r.costo):''}</td>
                <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${!c&&e?fmtCell(r.costo):''}</td>
                <td style="text-align:right;color:var(--red)">${!c&&!e?fmtCell(r.costo):''}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot><tr class="pivot-total">
            <td colspan="2" style="text-align:right;border-right:1px solid var(--border2)">TOT</td>
            <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${totCassaEnt?fmt(totCassaEnt):'—'}</td>
            <td style="text-align:right;color:var(--red);border-right:1px solid var(--border2)">${totCassaUsc?fmt(totCassaUsc):'—'}</td>
            <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${totBancaEnt?fmt(totBancaEnt):'—'}</td>
            <td style="text-align:right;color:var(--red)">${totBancaUsc?fmt(totBancaUsc):'—'}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>`;

  const n = (v) => v.toFixed(2).replace('.', ',');

  // copy
  $('notaCopyBtn')?.addEventListener('click', () => {
    const header = 'Data\tDescrizione\tCassa Entrate\tCassa Uscite\tBanca Entrate\tBanca Uscite';
    const dataLines = rows.map(r => {
      const c = r.pagamento==='Contanti', e = r.tipo==='Entrate';
      return [fmtDate(r.data), r.descrizione,
        c&&e?n(r.costo):'', c&&!e?n(r.costo):'',
        !c&&e?n(r.costo):'', !c&&!e?n(r.costo):''
      ].join('\t');
    });
    const totLine = `TOT\t\t${n(totCassaEnt)}\t${n(totCassaUsc)}\t${n(totBancaEnt)}\t${n(totBancaUsc)}`;
    const text = [header, ...dataLines, totLine].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = $('notaCopyBtn');
      const orig = btn.innerHTML;
      btn.textContent = '✓ Copiato';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    });
  });

  // csv (separatore ; per compatibilità Excel italiano)
  $('notaCsvBtn')?.addEventListener('click', () => {
    const lines = [
      'Data;Descrizione;Cassa Entrate;Cassa Uscite;Banca Entrate;Banca Uscite',
      ...rows.map(r => {
        const c = r.pagamento==='Contanti', e = r.tipo==='Entrate';
        return [fmtDate(r.data), `"${r.descrizione.replace(/"/g,'""')}"`,
          c&&e?n(r.costo):'', c&&!e?n(r.costo):'',
          !c&&e?n(r.costo):'', !c&&!e?n(r.costo):''
        ].join(';');
      }),
      `TOT;;${n(totCassaEnt)};${n(totCassaUsc)};${n(totBancaEnt)};${n(totBancaUsc)}`
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `nota_mensile_${MESI_NOMI[curMese]}_${curAnno}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // pdf
  $('notaPdfBtn')?.addEventListener('click', () => {
    document.title = `Nota mensile — ${MESI_NOMI[curMese]} ${curAnno}`;
    window.print();
  });
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  await requireAuth();

  const savedTheme = localStorage.getItem('danza_theme') || 'dark';
  if (savedTheme === 'light') applyTheme('light');

  $('btnTheme').addEventListener('click', () => {
    const isLight = document.body.classList.contains('light');
    applyTheme(isLight ? 'dark' : 'light');
  });
  $('hamburger').addEventListener('click', () => {
    const sb = $('sidebar');
    const main = document.querySelector('.main');
    if (window.innerWidth <= 768) {
      sb.classList.toggle('open');
    } else {
      sb.classList.toggle('hidden');
      main.classList.toggle('full');
    }
  });

  $('btnLogout').addEventListener('click', async () => {
    sessionStorage.removeItem('danza_auth');
    await signOut(auth);
    window.location.replace('login.html');
  });

  document.querySelectorAll('.nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });

  // Modal spesa
  $('modalClose').addEventListener('click', closeModal);
  $('modalCancel').addEventListener('click', closeModal);
  $('modalSave').addEventListener('click', saveEdit);
  $('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });

  // Modal allievo
  $('btnNuovoAllievo').addEventListener('click', openNewAllievo);
  $('modalAllieviClose').addEventListener('click', closeAllieviModal);
  $('modalAllieviCancel').addEventListener('click', closeAllieviModal);
  $('modalAllieviSave').addEventListener('click', saveAllievo);
  $('modalAllieviOverlay').addEventListener('click', e => { if (e.target === $('modalAllieviOverlay')) closeAllieviModal(); });

  document.querySelectorAll('#aTipoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#aTipoGrid .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('aTipo').value = chip.dataset.tipo;
    });
  });

  // Presenze
  $('btnNuovaPresenza').addEventListener('click', async () => {
    if (!corsiData.length)       await loadCorsi();
    if (!allieviData.length)     await loadAllievi();
    if (!iscrizioniData.length)  await loadIscrizioni();
    if (!presenzeData.length)    await loadPresenze();
    populateAllieviDatalist();
    openNuovaPresenza();
  });
  $('modalPresClose').addEventListener('click', closePresModal);
  $('modalPresCancel').addEventListener('click', closePresModal);
  $('modalPresSave').addEventListener('click', savePresenza);
  $('modalPresOverlay').addEventListener('click', e => { if (e.target === $('modalPresOverlay')) closePresModal(); });
  $('btnPresAddExtra').addEventListener('click', addPresExtra);
  $('pExtraAllievo').addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); addPresExtra(); } });

  document.querySelectorAll('.pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      presView = btn.dataset.view;
      renderPresView();
    });
  });

  $('presFiltroCorso').addEventListener('change', renderPresView);
  $('presFiltroMese').addEventListener('change', () => {
    const [y,m] = ($('presFiltroMese').value||'').split('-');
    if (y && m) { presCalYear = parseInt(y); presCalMonth = parseInt(m)-1; }
    renderPresView();
  });

  // Tabelle filtri
  $('tabelleModalita').addEventListener('change', () => {
    $('tabelleAnnoGroup').style.display = $('tabelleModalita').value === 'anno' ? '' : 'none';
    updateTabelle();
  });
  $('tabelleAnno').addEventListener('change', updateTabelle);
  $('btnTabelleCsv').addEventListener('click', exportTabelleCsv);

  // Filtri allievi live
  $('searchAllievi').addEventListener('input', applyAllieviFilters);
  $('filterTipoAllievo').addEventListener('change', applyAllieviFilters);

  // Filtri iscrizioni live
  $('searchIscrizioni').addEventListener('input', applyIscrizioniFilters);
  $('filterAS').addEventListener('change', applyIscrizioniFilters);
  $('filterPagato').addEventListener('change', applyIscrizioniFilters);
  $('btnClearIscFiltri').addEventListener('click', () => {
    $('searchIscrizioni').value = '';
    $('filterAS').value = '';
    $('filterPagato').value = '';
    applyIscrizioniFilters();
  });

  // Modal iscrizione
  $('btnNuovaIscrizione').addEventListener('click', async () => {
    if (!corsiData.length) await loadCorsi();
    if (!allieviData.length) await loadAllievi();
    populateAllieviDatalist();
    openNuovaIscrizione();
  });
  $('modalIscClose').addEventListener('click', closeIscModal);
  $('modalIscCancel').addEventListener('click', closeIscModal);
  $('modalIscSave').addEventListener('click', saveIscrizione);
  $('modalIscOverlay').addEventListener('click', e => { if (e.target === $('modalIscOverlay')) closeIscModal(); });

  document.querySelectorAll('#iTipoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#iTipoGrid .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('iTipo').value = chip.dataset.tipo;
      autoAggiornaCosto();
    });
  });

  $('iCorso').addEventListener('change', autoAggiornaCosto);
  $('compensiAnno').addEventListener('change', renderCompensi);
  $('notaAnno').addEventListener('change', renderNotaMensile);
  $('notaMese').addEventListener('change', renderNotaMensile);

  initElencoFilters();
  initInserimento();
  initRiepilogoAllievo();

  showSection('dashboard');

  // Caricamento parallelo di tutte le collezioni
  try {
    await Promise.all([loadSpese(), loadAllievi(), loadCorsi(), loadIscrizioni(), loadPresenze()]);
  } catch (e) {
    if (e.code === 'permission-denied') {
      alert('Account non autorizzato.');
      sessionStorage.removeItem('danza_auth');
      await signOut(auth);
      window.location.replace('login.html');
      return;
    }
    throw e;
  }

  renderDashboard();
}

// Handler usati negli attributi onclick generati dai template:
// app.js è un modulo ES, quindi vanno esposti su window.
Object.assign(window, {
  openEdit, deleteRow,
  openEditAllievo, deleteAllievo,
  openEditIscrizione, deleteIscrizione,
  openEditPresenza, deletePresenza, openPresForDay,
  apriRiepilogoAllievo,
  toggleSelectAll, onPresCheck, removePresExtra,
});

document.addEventListener('DOMContentLoaded', init);
