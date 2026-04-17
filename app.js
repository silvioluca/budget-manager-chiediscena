/* ═══════════════════════════════════════════════════════
   DANZA DASHBOARD — app.js
   Struttura foglio Google:
   - Entrate/Uscite: Data, Costo, Descrizione, Categoria, Tipo, Pagamento
   - Allievi: Cognome, Nome, Nome completo, Tipo, Tesseramento, Cellulare, Mail, Indirizzo, Note
   - Iscrizioni: Allievo, A.S., Tipo abbonamento, Mesi, Data inizio, Data fine, Pagato, Corsi, N. corsi, Costo, Note
   - Presenze: Giorno, Corso, Allievi presenti
   ═══════════════════════════════════════════════════════ */

// ── CONFIGURAZIONE ───────────────────────────────────────
// Sostituisci con l'URL del tuo Google Apps Script deployato
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzIdSBkSIwnAz_PytrLHdgOMRPjNt7Iqz75dTK-m57AyvRdtuumdxlq8DxykCR9uTCGHg/exec';

// Nomi dei fogli
const SHEET_SPESE     = 'Entrate/Uscite';
const SHEET_ALLIEVI   = 'Allievi';
const SHEET_ISCRIZIONI= 'Iscrizioni';
const SHEET_TABELLE   = 'Tabelle';
const SHEET_PRESENZE  = 'Presenze';

// Categorie
const CAT_USCITE  = ['Affitto','Arredamento','Bollette','Cibo','Contributo collaboratore','Contributo team','Corsi di aggiornamento','Manutenzione','Strumenti','Utilità','Tasse','Trasporti','Versamento','Altro'];
const CAT_ENTRATE = ['Allievi','Sponsor','Versamento','Altro'];

// ── STATO ────────────────────────────────────────────────
let speseData     = [];   // righe grezze dal foglio (senza header)
let allieviData   = [];
let iscrizioniData= [];
let tabelleData   = [];

let currentType   = 'Uscite';
let currentCat    = '';
let currentPag    = '';
let editRowIndex  = null; // indice 1-based nel foglio

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
  const dt = new Date(d);
  if (isNaN(dt)) return d;
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

// ── APPS SCRIPT API ──────────────────────────────────────
async function apiGet(sheet) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    return getMockData(sheet);
  }
  const url = `${APPS_SCRIPT_URL}?sheet=${encodeURIComponent(sheet)}`;
  const res  = await fetch(url);
  const data = await res.json();
  return data; // array di array
}

async function apiPost(payload) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
    showFeedback('⚠️ Configura APPS_SCRIPT_URL in app.js', true);
    return {ok: false};
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return res.json();
}

// ── MOCK DATA (per anteprima senza Apps Script) ───────────
function getMockData(sheet) {
  if (sheet === SHEET_SPESE) {
    return [
      ['Data','Costo','Descrizione','Categoria','Tipo','Pagamento'],
      ['2025-01-10', 500, 'Affitto gennaio', 'Affitto', 'Uscite', 'Bonifico'],
      ['2025-01-15', 1200, 'Iscrizioni corsi', 'Allievi', 'Entrate', 'Contanti'],
      ['2025-02-01', 80,  'Pulizie', 'Manutenzione', 'Uscite', 'Contanti'],
      ['2025-02-10', 950, 'Quote febbraio', 'Allievi', 'Entrate', 'Bonifico'],
      ['2025-03-01', 500, 'Affitto marzo',  'Affitto', 'Uscite', 'Bonifico'],
      ['2025-03-20', 200, 'Corso aggiornamento', 'Corsi di aggiornamento','Uscite','Carta'],
      ['2025-04-05', 1100,'Quote aprile','Allievi','Entrate','Contanti'],
      ['2025-04-10', 500, 'Affitto aprile','Affitto','Uscite','Bonifico'],
      ['2025-05-01', 500, 'Affitto maggio','Affitto','Uscite','Bonifico'],
      ['2025-05-15', 1300,'Quote maggio','Allievi','Entrate','Bonifico'],
      ['2025-06-01', 500, 'Affitto giugno','Affitto','Uscite','Bonifico'],
      ['2025-06-10', 900, 'Quote giugno','Allievi','Entrate','Contanti'],
      ['2024-09-01', 500, 'Affitto settembre 2024','Affitto','Uscite','Bonifico'],
      ['2024-09-10', 800, 'Quote settembre','Allievi','Entrate','Contanti'],
      ['2024-10-01', 500, 'Affitto ottobre','Affitto','Uscite','Bonifico'],
      ['2024-10-15', 1000,'Quote ottobre','Allievi','Entrate','Bonifico'],
      ['2024-11-01', 500, 'Affitto novembre','Affitto','Uscite','Bonifico'],
      ['2024-11-20', 150, 'Strumenti','Strumenti','Uscite','Carta'],
      ['2024-12-01', 500, 'Affitto dicembre','Affitto','Uscite','Bonifico'],
      ['2024-12-15', 850, 'Quote dicembre','Allievi','Entrate','Contanti'],
    ];
  }
  if (sheet === SHEET_ALLIEVI) {
    return [
      ['Cognome','Nome','Nome completo','Tipo','Tesseramento','Cellulare','Mail','Indirizzo','Note'],
      ['Rossi','Giulia','Rossi Giulia','Bambini','2025','333-1234567','giulia@mail.it','Via Roma 1',''],
      ['Bianchi','Sara','Bianchi Sara','Adulti','2025','333-2345678','sara@mail.it','Via Milano 2',''],
      ['Verdi','Elena','Verdi Elena','Adulti','2025','333-3456789','elena@mail.it','Via Napoli 3',''],
      ['Ferrari','Lucia','Ferrari Lucia','Bambini','2024','333-4567890','lucia@mail.it','Via Torino 4','Rinnovare'],
      ['Romano','Chiara','Romano Chiara','Adulti','2025','333-5678901','chiara@mail.it','Via Venezia 5',''],
    ];
  }
  if (sheet === SHEET_ISCRIZIONI) {
    return [
      ['Allievo','A.S.','Tipo abbonamento','Mesi','Data inizio','Data fine','Pagato','Corsi','N. corsi','Costo','Note'],
      ['Rossi Giulia','2024/2025','Mensile',1,'2025-09-01','2025-06-30','Sì','Danza classica',1,80,''],
      ['Bianchi Sara','2024/2025','Annuale',10,'2025-09-01','2025-06-30','Sì','Danza moderna, Hip hop',2,150,''],
      ['Verdi Elena','2024/2025','Semestrale',6,'2025-01-01','2025-06-30','No','Danza classica',1,80,'Da saldare'],
      ['Ferrari Lucia','2023/2024','Annuale',10,'2024-09-01','2024-06-30','Sì','Danza classica',1,70,''],
    ];
  }
  return [['Colonna A','Colonna B'],['Dato 1','Dato 2']];
}

// ── CARICAMENTO DATI ─────────────────────────────────────
async function loadSpese() {
  const rows = await apiGet(SHEET_SPESE);
  // Salta la prima riga (header)
  speseData = rows.slice(1).map((r, i) => ({
    _idx: i + 2, // indice 1-based nel foglio (riga 1 = header)
    data: parseDate(r[0]),
    costo: parseNum(r[1]),
    descrizione: r[2] || '',
    categoria: r[3] || '',
    tipo: r[4] || '',
    pagamento: r[5] || '',
  })).filter(r => r.costo !== 0 || r.descrizione);
}

async function loadAllievi() {
  const rows = await apiGet(SHEET_ALLIEVI);
  allieviData = rows.slice(1).map((r, i) => ({
    _idx: i + 2,
    cognome: r[0] || '',
    nome: r[1] || '',
    nomeCompleto: r[2] || (r[0] + ' ' + r[1]),
    tipo: r[3] || '',
    tesseramento: r[4] || '',
    cellulare: r[5] || '',
    mail: r[6] || '',
    indirizzo: r[7] || '',
    note: r[8] || '',
  }));
}

async function loadIscrizioni() {
  const rows = await apiGet(SHEET_ISCRIZIONI);
  iscrizioniData = rows.slice(1).map((r, i) => ({
    _idx: i + 2,
    allievo: r[0] || '',
    as: r[1] || '',
    abbonamento: r[2] || '',
    mesi: r[3] || '',
    dataInizio: r[4] || '',
    dataFine: r[5] || '',
    pagato: r[6] || '',
    corsi: r[7] || '',
    nCorsi: r[8] || '',
    costo: parseNum(r[9]),
    note: r[10] || '',
  }));
}

async function loadTabelle() {
  const rows = await apiGet(SHEET_TABELLE);
  tabelleData = rows;
}

// ── NAVIGAZIONE ──────────────────────────────────────────
const sections = ['dashboard','inserimento','elenco','annuale','generale','tabelle','allievi','iscrizioni'];

function showSection(name) {
  sections.forEach(s => {
    $('sec-'+s)?.classList.remove('active');
    document.querySelector(`[data-section="${s}"]`)?.classList.remove('active');
  });
  $('sec-'+name)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  // Carica dati on-demand
  if (name === 'dashboard')   renderDashboard();
  if (name === 'elenco')      renderElenco();
  if (name === 'annuale')     renderAnnuale();
  if (name === 'generale')    renderGenerale();
  if (name === 'tabelle')     renderTabelle();
  if (name === 'allievi')     renderAllievi();
  if (name === 'iscrizioni')  renderIscrizioni();

  // Mobile: chiudi sidebar
  if (window.innerWidth <= 768) {
    $('sidebar').classList.remove('open');
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
function renderDashboard() {
  const entrate = speseData.filter(r => r.tipo === 'Entrate').reduce((s,r) => s+r.costo, 0);
  const uscite  = speseData.filter(r => r.tipo === 'Uscite').reduce((s,r) => s+r.costo, 0);
  const saldo   = entrate - uscite;

  $('kpiAllievi').textContent = allieviData.length || '—';
  $('kpiEntrate').textContent = fmt(entrate);
  $('kpiUscite').textContent  = fmt(uscite);
  $('kpiSaldo').textContent   = fmt(saldo);
  $('kpiSaldo').className     = 'kpi-value ' + (saldo >= 0 ? 'kpi-green' : 'kpi-red');

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

  const row = [data, costo, descrizione, currentCat, currentType, currentPag];
  const res = await apiPost({ action: 'append', sheet: SHEET_SPESE, row });

  $('btnSubmit').disabled = false;
  if (res.ok !== false) {
    showFeedback('✓ Salvato correttamente!');
    speseData.push({
      _idx: speseData.length + 2,
      data: new Date(data),
      costo, descrizione, categoria: currentCat, tipo: currentType, pagamento: currentPag
    });
    resetForm();
  } else {
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
  const empty   = $('tableEmpty');

  loading.style.display = 'none';
  table.style.display   = '';

  // Popola filtri anno/categoria
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

  // Sort
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
          <button class="btn-table" onclick="openEdit(${r._idx})" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteRow(${r._idx})" title="Elimina">
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
function openEdit(idx) {
  const r = speseData.find(r => r._idx === idx);
  if (!r) return;
  editRowIndex = idx;
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
  const row = [
    $('mData').value,
    parseFloat($('mCosto').value),
    $('mDescrizione').value,
    $('mCategoria').value,
    $('mTipo').value,
    $('mPagamento').value,
  ];
  const res = await apiPost({ action: 'update', sheet: SHEET_SPESE, rowIndex: editRowIndex, row });
  if (res.ok !== false) {
    const r = speseData.find(r => r._idx === editRowIndex);
    if (r) { r.data=new Date(row[0]); r.costo=row[1]; r.descrizione=row[2]; r.categoria=row[3]; r.tipo=row[4]; r.pagamento=row[5]; }
    closeModal(); applyFilters();
  }
}

async function deleteRow(idx) {
  if (!confirm('Eliminare questa voce?')) return;
  const res = await apiPost({ action: 'delete', sheet: SHEET_SPESE, rowIndex: idx });
  if (res.ok !== false) {
    speseData = speseData.filter(r => r._idx !== idx);
    applyFilters();
  }
}

// ── RIEPILOGO ANNUALE ─────────────────────────────────────
function renderAnnuale() {
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

  // Grafico: se mese selezionato → settimanale, altrimenti mensile
  let labels, ent, usc;
  if (mese) {
    // Raggruppa per giorno del mese
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

  // Donut categorie uscite
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

  // Breakdown uscite
  const totalUsc = sortedUsc.reduce((s,e)=>s+e[1],0);
  $('catBreakdown').innerHTML = sortedUsc.length ? sortedUsc.map(([cat,val]) => `
    <div class="cat-breakdown-row">
      <span class="cat-breakdown-name">${escHtml(cat)}</span>
      <div class="cat-breakdown-bar-wrap"><div class="cat-breakdown-bar" style="width:${totalUsc?val/totalUsc*100:0}%"></div></div>
      <span class="cat-breakdown-val">${fmt(val)}</span>
    </div>
  `).join('') : '<p style="color:var(--text-dim);padding:12px 0;font-size:13px;">Nessuna uscita nel periodo.</p>';

  // Breakdown entrate
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
  const anni = [...new Set(speseData.map(r=>r.data?.getFullYear()).filter(Boolean))].sort();
  const ent  = anni.map(a=>speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
  const usc  = anni.map(a=>speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===a).reduce((s,r)=>s+r.costo,0));
  const saldo= ent.map((e,i)=>e-usc[i]);

  // ── Grafico area/linea ──
  if (chartGeneraleArea) chartGeneraleArea.destroy();
  chartGeneraleArea = new Chart($('chartGeneraleArea'), {
    type: 'line',
    data: {
      labels: anni,
      datasets: [
        {
          label: 'Entrate',
          data: ent,
          borderColor: '#5cb85c',
          backgroundColor: 'rgba(92,184,92,0.10)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: '#5cb85c',
          pointBorderColor: '#0d0d0f',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
        {
          label: 'Uscite',
          data: usc,
          borderColor: '#e05555',
          backgroundColor: 'rgba(224,85,85,0.10)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: '#e05555',
          pointBorderColor: '#0d0d0f',
          pointBorderWidth: 2,
          borderWidth: 2,
        },
        {
          label: 'Saldo',
          data: saldo,
          borderColor: '#c9a96e',
          backgroundColor: 'rgba(201,169,110,0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: '#c9a96e',
          pointBorderColor: '#0d0d0f',
          pointBorderWidth: 2,
          borderWidth: 2,
          borderDash: [5,3],
        },
      ]
    },
    options: {
      ...chartOpts(),
      plugins: {
        ...chartOpts().plugins,
        legend: { labels: { color: '#888', font: { size: 11 }, boxWidth: 10, padding: 14 } },
        tooltip: {
          backgroundColor: '#18181b',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0ede8',
          bodyColor: '#888',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` }
        }
      }
    }
  });

  // ── Waterfall saldo trimestrale ──
  const trimSet = new Set();
  speseData.forEach(r => {
    if (!r.data) return;
    const y = r.data.getFullYear();
    const q = Math.floor(r.data.getMonth()/3)+1;
    trimSet.add(`${y}-Q${q}`);
  });
  const trimLabels = [...trimSet].sort();

  const trimSaldi = trimLabels.map(label => {
    const [y, q] = label.split('-Q');
    const year = parseInt(y), quarter = parseInt(q);
    const months = [0,1,2].map(i => (quarter-1)*3+i);
    const e = speseData.filter(r=>r.tipo==='Entrate'&&r.data?.getFullYear()===year&&months.includes(r.data.getMonth())).reduce((s,r)=>s+r.costo,0);
    const u = speseData.filter(r=>r.tipo==='Uscite' &&r.data?.getFullYear()===year&&months.includes(r.data.getMonth())).reduce((s,r)=>s+r.costo,0);
    return e - u;
  });

  // Floating bar: ogni barra = [min(start,end), max(start,end)]
  // Chart.js floating bar accetta data: [[y0, y1]]
  let running = 0;
  const wfData   = [];
  const wfColors = [];
  const wfLabels = [...trimLabels, 'TOTALE'];

  trimSaldi.forEach(v => {
    const start = running;
    const end   = running + v;
    wfData.push([start, end]);
    wfColors.push(v >= 0 ? 'rgba(92,184,92,0.75)' : 'rgba(224,85,85,0.75)');
    running = end;
  });
  // Barra totale: da 0 al valore finale
  const totFinale = running;
  wfData.push([0, totFinale]);
  wfColors.push(totFinale >= 0 ? 'rgba(201,169,110,0.85)' : 'rgba(224,85,85,0.85)');

  if (chartWaterfall) chartWaterfall.destroy();
  chartWaterfall = new Chart($('chartWaterfall'), {
    type: 'bar',
    data: {
      labels: wfLabels,
      datasets: [{
        label: 'Saldo',
        data: wfData,
        backgroundColor: wfColors,
        borderColor: wfColors.map(c => c.replace(/[\d.]+\)$/, '1)')),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181b',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f0ede8',
          bodyColor: '#888',
          callbacks: {
            label: ctx => {
              const [lo, hi] = ctx.raw;
              const val = hi - lo;
              return ` ${fmt(val)}  (cumulato: ${fmt(hi)})`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#666', font: { size: 11 }, callback: v => '€'+v.toLocaleString('it-IT') }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  // Tabella
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
async function renderTabelle() {
  $('tabelleLoading').style.display = '';
  $('tabelleContent').style.display = 'none';
  if (!tabelleData.length) await loadTabelle();
  $('tabelleLoading').style.display = 'none';
  $('tabelleContent').style.display = '';

  if (!tabelleData.length) { $('tabelleContent').innerHTML = '<p style="color:var(--text-muted);padding:20px;">Nessun dato nel foglio Tabelle.</p>'; return; }

  const header = tabelleData[0];
  const rows   = tabelleData.slice(1);
  $('tabelleContent').innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${header.map(h=>`<th>${escHtml(String(h))}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escHtml(String(c??''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

// ── ALLIEVI ───────────────────────────────────────────────
// Palette colori per tipologia (ciclica)
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
let editAllieviIdx = null; // null = nuovo, number = _idx esistente

async function renderAllievi() {
  $('allieviLoading').style.display=''; $('allieviTableWrap').style.display='none'; $('allieviEmpty').style.display='none';
  if (!allieviData.length) await loadAllievi();
  $('allieviLoading').style.display='none';

  const tipi = [...new Set(allieviData.map(r=>r.tipo).filter(Boolean))].sort();
  $('filterTipoAllievo').innerHTML = '<option value="">Tutti i tipi</option>' + tipi.map(t=>`<option value="${t}">${t}</option>`).join('');

  // Sortable headers
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

  // Sort
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
    return `<tr>
      <td style="font-weight:500">${escHtml(r.nomeCompleto)}</td>
      <td><span style="${badgeStyle}">${escHtml(r.tipo)}</span></td>
      <td style="color:var(--text-muted)">${escHtml(String(r.tesseramento))}</td>
      <td style="color:var(--text-muted)">${escHtml(r.cellulare)}</td>
      <td style="color:var(--text-muted)">${escHtml(r.mail)}</td>
      <td style="color:var(--text-dim);font-size:12px;">${escHtml(r.note)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditAllievo(${r._idx})" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteAllievo(${r._idx})" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openNewAllievo() {
  editAllieviIdx = null;
  $('modalAllieviTitle').textContent = 'Nuovo allievo';
  ['aCognome','aNome','aTipo','aTesseramento','aCellulare','aMail','aIndirizzo','aNote'].forEach(id => { $(id).value=''; });
  $('modalAllieviOverlay').style.display = 'flex';
  $('aCognome').focus();
}

function openEditAllievo(idx) {
  const r = allieviData.find(r => r._idx === idx);
  if (!r) return;
  editAllieviIdx = idx;
  $('modalAllieviTitle').textContent = 'Modifica allievo';
  $('aCognome').value      = r.cognome;
  $('aNome').value         = r.nome;
  $('aTipo').value         = r.tipo;
  $('aTesseramento').value = r.tesseramento;
  $('aCellulare').value    = r.cellulare;
  $('aMail').value         = r.mail;
  $('aIndirizzo').value    = r.indirizzo;
  $('aNote').value         = r.note;
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

  const row = [cognome, nome, nomeCompleto, tipo, tesseramento, cellulare, mail, indirizzo, note];

  if (editAllieviIdx === null) {
    // Nuovo
    const res = await apiPost({ action: 'append', sheet: SHEET_ALLIEVI, row });
    if (res.ok !== false) {
      allieviData.push({ _idx: allieviData.length + 2, cognome, nome, nomeCompleto, tipo, tesseramento, cellulare, mail, indirizzo, note });
      closeAllieviModal();
      applyAllieviFilters();
    }
  } else {
    // Modifica
    const res = await apiPost({ action: 'update', sheet: SHEET_ALLIEVI, rowIndex: editAllieviIdx, row });
    if (res.ok !== false) {
      const r = allieviData.find(r => r._idx === editAllieviIdx);
      if (r) Object.assign(r, { cognome, nome, nomeCompleto, tipo, tesseramento, cellulare, mail, indirizzo, note });
      closeAllieviModal();
      applyAllieviFilters();
    }
  }
}

async function deleteAllievo(idx) {
  const r = allieviData.find(r => r._idx === idx);
  if (!r) return;
  const ok = confirm(`Eliminare l'allievo "${r.nomeCompleto}"?\nQuesta operazione non può essere annullata.`);
  if (!ok) return;
  const res = await apiPost({ action: 'delete', sheet: SHEET_ALLIEVI, rowIndex: idx });
  if (res.ok !== false) {
    allieviData = allieviData.filter(r => r._idx !== idx);
    applyAllieviFilters();
  }
}

// ── ISCRIZIONI ────────────────────────────────────────────
async function renderIscrizioni() {
  $('iscrizioniLoading').style.display=''; $('iscrizioniTableWrap').style.display='none'; $('iscrizioniEmpty').style.display='none';
  if (!iscrizioniData.length) await loadIscrizioni();
  $('iscrizioniLoading').style.display='none';

  const anni = [...new Set(iscrizioniData.map(r=>r.as).filter(Boolean))].sort().reverse();
  $('filterAS').innerHTML = '<option value="">Tutte le A.S.</option>' + anni.map(a=>`<option value="${a}">${a}</option>`).join('');

  applyIscrizioniFilters();
}

function applyIscrizioniFilters() {
  const search = $('searchIscrizioni').value.toLowerCase();
  const as     = $('filterAS').value;
  const filtered = iscrizioniData.filter(r => {
    if (search && !r.allievo.toLowerCase().includes(search)) return false;
    if (as && r.as !== as) return false;
    return true;
  });

  if (!filtered.length) { $('iscrizioniTableWrap').style.display='none'; $('iscrizioniEmpty').style.display=''; return; }
  $('iscrizioniEmpty').style.display='none'; $('iscrizioniTableWrap').style.display='';

  $('iscrizioniBody').innerHTML = filtered.map(r => {
    const pagBadge = r.pagato && r.pagato.toLowerCase().includes('s') ? 'badge-green' : 'badge-red';
    const pagLabel = r.pagato && r.pagato.toLowerCase().includes('s') ? 'Sì' : 'No';
    return `
      <tr>
        <td>${escHtml(r.allievo)}</td>
        <td><span class="badge badge-gold">${escHtml(r.as)}</span></td>
        <td>${escHtml(r.abbonamento)}</td>
        <td style="text-align:center">${r.mesi}</td>
        <td>${fmtDate(r.dataInizio)}</td>
        <td>${fmtDate(r.dataFine)}</td>
        <td><span class="badge ${pagBadge}">${pagLabel}</span></td>
        <td style="font-size:12px;color:var(--text-muted)">${escHtml(r.corsi)}</td>
        <td style="text-align:right">${fmt(r.costo)}</td>
        <td style="font-size:12px;color:var(--text-muted)">${escHtml(r.note)}</td>
      </tr>
    `;
  }).join('');
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

// ── INIT ──────────────────────────────────────────────────
async function init() {
  // Sidebar toggle
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

  // Logout
  $('btnLogout').addEventListener('click', () => {
    sessionStorage.removeItem('danza_auth');
    window.location.replace('login.html');
  });

  // Nav items
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

  // Filtri allievi/iscrizioni live
  $('searchAllievi').addEventListener('input', applyAllieviFilters);
  $('filterTipoAllievo').addEventListener('change', applyAllieviFilters);
  $('searchIscrizioni').addEventListener('input', applyIscrizioniFilters);
  $('filterAS').addEventListener('change', applyIscrizioniFilters);

  // Init elenco filtri
  initElencoFilters();
  // Init form inserimento
  initInserimento();

  // Carica dati principali
  await loadSpese();
  await loadAllievi();

  // Mostra dashboard
  showSection('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
