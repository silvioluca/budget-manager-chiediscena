/* ═══════════════════════════════════════════════════════
   DANZA DASHBOARD — app.js
   ═══════════════════════════════════════════════════════ */

// ── CONFIGURAZIONE ───────────────────────────────────────
import { auth, requireAuth, fsLoad, fsAdd, fsAddMany, fsUpdate, fsDelete, signOut } from './db.js?v=24';

const COLL_SPESE       = 'spese';
const COLL_CORSI       = 'corsi';
const COLL_ABBONAMENTI = 'abbonamenti';
const COLL_ALLIEVI     = 'allievi';
const COLL_ISCRIZIONI  = 'iscrizioni';
const COLL_PRESENZE    = 'presenze';
const COLL_PERSONALE   = 'personale';

const CAT_USCITE  = ['Affitto','Arredamento','Bollette','Cibo','Contributo collaboratore','Contributo team','Corsi di aggiornamento','Manutenzione','Strumenti','Utilità','Tasse','Trasporti','Versamento','Altro'];
const CAT_ENTRATE = ['Allievi','Tesseramento','Sponsor','Versamento','Altro'];

// ── STATO ────────────────────────────────────────────────
let speseData       = [];
let corsiData       = [];
let abbonamentiData = [];
let allieviData     = [];
let iscrizioniData  = [];
let presenzeData    = [];
let personaleData   = [];

let currentType   = 'Uscite';
let currentCat    = '';
let currentPag    = '';
let editRowIndex  = null;

const CASSA_SEED = 233.91; // saldo cassa a inizio luglio 2023

let chartDash      = null;
let chartAnnuale   = null;
let chartRepPres   = null;
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
// 'YYYY-MM-DD' → Date locale a mezzanotte (niente shift di fuso orario)
const ymdToDate = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])) : null;
};
const dateToYmd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
// scadenza tesseramento di default: un anno da oggi (tesseramento annuale)
const defaultTesseramentoScad = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return dateToYmd(d);
};

const parseNum = (v) => {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(',','.')) || 0;
};

const $ = (id) => document.getElementById(id);

// ── DIALOGHI (al posto di alert/confirm nativi) ──────────
let dialogResolve = null;

function openDialog(msg, showCancel) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    $('dialogMsg').textContent = msg;
    $('dialogCancel').style.display = showCancel ? '' : 'none';
    $('modalDialogOverlay').style.display = 'flex';
    $('dialogOk').focus();
  });
}

function closeDialog(val) {
  $('modalDialogOverlay').style.display = 'none';
  const r = dialogResolve;
  dialogResolve = null;
  if (r) r(val);
}

const appAlert   = (msg) => openDialog(msg, false);
const appConfirm = (msg) => openDialog(msg, true);

// ── TABELLE MOBILE: colonne prioritarie + tap per dettagli ──
// keep = colonne (1-based) visibili su mobile; le altre compaiono toccando la riga
const MOBILE_COLS = {
  speseTable:      { keep: [1, 2, 5] },   // Data, Descrizione, Importo
  allieviTable:    { keep: [1, 2] },      // Nome, Tipo
  iscrizioniTable: { keep: [1, 5, 8] },   // Allievo, Corso, Costo
  corsiTable:      { keep: [1, 3] },      // Nome, Tipo di abbonamento
  abbonamentiTable:{ keep: [2, 5] },      // Nome, Lezione singola (col. 1 = maniglia trascinamento)
  repPresTable:    { keep: [1, 2, 3] },   // Data, Corso, Presenti
  repIscTable:     { keep: [1, 2, 10] },  // Allievo, Corso, Rimanenti
  riepIscTable:    { keep: [3, 6, 9] },   // Corso, Costo, Rimaste
  riepStoricoTable:{ keep: [1, 2] },      // Data, Corso (Note col tap)
  presTabellaTable:{ keep: [1, 2, 4] },   // selezione, Data, Corso
};

function initMobileTables() {
  // regole di occultamento generate dalla config (unica fonte di verità).
  // Selettore per attributo (non id): una stessa "profilazione" può applicarsi
  // a più tabelle contemporaneamente in pagina (es. i corsi raggruppati per durata).
  let css = '@media (max-width: 768px) {';
  for (const [profile, cfg] of Object.entries(MOBILE_COLS)) {
    const sel = `[data-mobile-cols="${profile}"]`;
    const nots = cfg.keep.map(n => `:not(:nth-child(${n}))`).join('');
    css += `
      ${sel} { min-width: 0 !important; }
      ${sel} thead th${nots}, ${sel} tbody tr:not(.m-detail) td${nots} { display: none; }
      ${sel} tbody tr:not(.m-detail):not(.m-open) { cursor: pointer; }
    `;
  }
  css += '}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // tap sulla riga → riga di dettaglio con le colonne nascoste
  document.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    const tr = e.target.closest('tr');
    if (!tr || tr.closest('thead') || tr.classList.contains('m-detail')) return;
    const table = tr.closest('table');
    const profile = table?.dataset.mobileCols;
    if (!profile || !MOBILE_COLS[profile]) return;
    if (e.target.closest('[onclick], button, a, input, select')) return;

    const next = tr.nextElementSibling;
    if (next && next.classList.contains('m-detail')) {
      next.remove();
      tr.classList.remove('m-open');
      return;
    }
    table.querySelectorAll('tr.m-detail').forEach(x => x.remove());
    table.querySelectorAll('tr.m-open').forEach(x => x.classList.remove('m-open'));

    const keep = MOBILE_COLS[profile].keep;
    const ths  = [...table.querySelectorAll('thead th')];
    const dataRows = [];
    let actionsHtml = '';
    [...tr.children].forEach((td, i) => {
      if (keep.includes(i + 1)) return;
      const val = td.innerHTML.trim();
      if (!val) return;
      // le celle coi bottoni azione si accodano all'ultima riga di dati
      if (td.querySelector('.btn-table')) { actionsHtml += val; return; }
      const label = (ths[i]?.textContent || '').replace(/[↕↑↓]/g, '').trim();
      dataRows.push(`<div class="m-detail-row">${label ? `<span class="m-detail-label">${escHtml(label)}</span>` : ''}<span class="m-detail-val">${val}</span></div>`);
    });
    if (!dataRows.length && !actionsHtml) return;

    if (actionsHtml) {
      const acts = `<span class="m-detail-acts">${actionsHtml}</span>`;
      if (dataRows.length) {
        dataRows[dataRows.length - 1] = dataRows[dataRows.length - 1].replace(/<\/div>$/, `${acts}</div>`);
      } else {
        dataRows.push(`<div class="m-detail-row">${acts}</div>`);
      }
    }

    const det = document.createElement('tr');
    det.className = 'm-detail';
    det.innerHTML = `<td colspan="${keep.length}">${dataRows.join('')}</td>`;
    tr.classList.add('m-open');
    tr.after(det);
  });
}

// ── TABELLE ORDINABILI (delegato, copre tutte le .data-table) ──
// Interpreta il testo della cella come numero (con € o virgola decimale),
// data gg/mm/aaaa, o stringa; le celle vuote vanno sempre in fondo.
function parseSortValue(text) {
  const raw = text.replace(/[↕↑↓]/g, '').trim();
  if (!raw || raw === '—') return { num: null, str: '' };

  const cleaned = raw.replace(/[€\s]/g, ''); // via simbolo valuta e spazi (i punti restano: possono essere separatori migliaia)
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(cleaned)) {
    const num = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num)) return { num, str: raw.toLowerCase() };
  }
  const d = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (d) return { num: new Date(+d[3], +d[2]-1, +d[1]).getTime(), str: raw };
  return { num: null, str: raw.toLowerCase() };
}

function initSortableTables() {
  const style = document.createElement('style');
  style.textContent = `table.data-table thead th:not(:empty) { cursor: pointer; user-select: none; }
    table.data-table thead th .sort-arrow { margin-left: 4px; color: var(--text-dim); font-size: 10px; }`;
  document.head.appendChild(style);

  document.addEventListener('click', e => {
    const th = e.target.closest('table.data-table thead th');
    if (!th) return;
    const table = th.closest('table');
    const tbody = table?.querySelector('tbody');
    const headRow = th.parentElement;
    // tabelle a intestazione multi-riga (es. Nota mensile): struttura pivot, non ordinabile
    if (!tbody || table.querySelectorAll('thead tr').length > 1) return;
    if (!th.textContent.replace(/[↕↑↓]/g, '').trim()) return; // colonna azioni/vuota

    const idx = [...headRow.children].indexOf(th);
    if (idx === -1) return;

    const asc = th.dataset.sortDir !== 'asc';
    [...headRow.children].forEach(c => { delete c.dataset.sortDir; c.querySelector('.sort-arrow')?.remove(); });
    th.dataset.sortDir = asc ? 'asc' : 'desc';
    th.insertAdjacentHTML('beforeend', ` <span class="sort-arrow">${asc ? '↑' : '↓'}</span>`);

    // ogni riga dati con l'eventuale riga di dettaglio (tabelle mobile espandibili)
    // che la segue si spostano insieme, altrimenti finirebbero disaccoppiate
    const groups = [];
    tbody.querySelectorAll(':scope > tr').forEach(tr => {
      if (tr.classList.contains('m-detail')) return;
      const next = tr.nextElementSibling;
      groups.push({ row: tr, detail: next?.classList.contains('m-detail') ? next : null });
    });

    groups.sort((ga, gb) => {
      const va = parseSortValue(ga.row.children[idx]?.textContent || '');
      const vb = parseSortValue(gb.row.children[idx]?.textContent || '');
      let cmp;
      if (va.num !== null && vb.num !== null) cmp = va.num - vb.num;
      else if (!va.str && vb.str) cmp = 1;
      else if (va.str && !vb.str) cmp = -1;
      else cmp = va.str.localeCompare(vb.str, 'it');
      return asc ? cmp : -cmp;
    });

    groups.forEach(g => { tbody.appendChild(g.row); if (g.detail) tbody.appendChild(g.detail); });
  });
}

function initDialog() {
  $('dialogOk').addEventListener('click', () => closeDialog(true));
  $('dialogCancel').addEventListener('click', () => closeDialog(false));
  document.addEventListener('keydown', e => {
    if ($('modalDialogOverlay').style.display === 'flex') {
      if (e.key === 'Escape') closeDialog(false);
      if (e.key === 'Enter')  closeDialog(true);
    }
  });
}

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
    personale: r.personale || '',
  })).filter(r => r.costo !== 0 || r.descrizione);
}

// Normalizza i valori booleani ereditati dal vecchio Sheet (false/true → No/Sì)
// e ripara il documento su Firestore la prima volta che lo incontra. Inoltre,
// se il tesseramento ha una scadenza già passata, torna automaticamente "No"
// (sia in memoria che su Firestore).
function normalizzaTesseramento(r) {
  const raw = r.tesseramento;
  const s = String(raw).trim().toLowerCase();
  let fixed = null;
  if (raw === false || s === 'false') fixed = 'No';
  else if (raw === true || s === 'true') fixed = 'Sì';
  let tesseramento = fixed !== null ? fixed : (raw || '');

  if (isTesserato(tesseramento) && r.tesseramentoScad) {
    const oggi = new Date(); oggi.setHours(0,0,0,0);
    const scad = ymdToDate(r.tesseramentoScad);
    if (scad && scad < oggi) {
      tesseramento = 'No';
      fsUpdate(COLL_ALLIEVI, r._id, { tesseramento: 'No' }).catch(() => {});
      return tesseramento;
    }
  }

  if (fixed !== null) fsUpdate(COLL_ALLIEVI, r._id, { tesseramento: fixed }).catch(() => {});
  return tesseramento;
}

async function loadAllievi() {
  const rows = await fsLoad(COLL_ALLIEVI);
  allieviData = rows.map(r => ({
    _id: r._id,
    cognome: r.cognome || '',
    nome: r.nome || '',
    nomeCompleto: r.nomeCompleto || `${r.cognome || ''} ${r.nome || ''}`.trim(),
    tipo: r.tipo || '',
    tesseramento: normalizzaTesseramento(r),
    tesseramentoScad: r.tesseramentoScad || '',
    cellulare: r.cellulare || '',
    mail: r.mail || '',
    indirizzo: r.indirizzo || '',
    note: r.note || '',
  })).sort((a,b) => a.cognome.localeCompare(b.cognome,'it'));
}

async function loadIscrizioni() {
  const rows = await fsLoad(COLL_ISCRIZIONI);
  iscrizioniData = rows.map(r => ({
    _id: r._id,
    allievo:     r.allievo || '',
    as:          r.as || '',
    data:        r.data || '',
    tipo:        r.tipo || '',
    abbonamento: r.abbonamento || '', // assente sulle iscrizioni storiche pre-abbonamenti
    // selezione multipla: le storiche (un solo `corso` stringa, niente `corsi`) si convertono al volo
    corsi:    Array.isArray(r.corsi) ? r.corsi : (r.corso ? [r.corso] : []),
    dataPag:  r.dataPag || '',
    pagato:   r.pagato || '',
    costo:    parseNum(r.costo),
    note:     r.note || '',
    scadenza: r.scadenza || '', // solo corsi "a scadenza": data fissa, niente conteggio lezioni
  }));
}

// giorni di validità per le durate fisse dei corsi "a scadenza"
const SCAD_TIPO_GIORNI = { Mensile: 30, Bimestrale: 60, Semestrale: 180, Annuale: 365 };

// Legge Corsi (semplificati: nome, durata, abbonamenti ammessi) e Abbonamenti (solo
// pagamento: il corso frequentato si sceglie sempre in iscrizione).
// I vecchi corsi (prima di questo cambio) avevano i prezzi direttamente su di
// loro (tipoPrezzo, x1/x4/x8/x12 o costoAbbonamento/scadenzaTipo): la prima
// volta che li incontriamo generiamo per ciascuno un abbonamento "singolo"
// con lo stesso nome, cosi' le iscrizioni gia' fatte (che puntano al corso per
// nome, non ancora ad un abbonamento) restano valide senza dover essere
// toccate — si risolvono per nome (vedi resolveAbbonamentoNome). I campi
// legacy restano nel documento del corso (non vengono cancellati),
// semplicemente non sono piu' letti/usati una volta migrato.
async function loadCorsi() {
  const rawCorsi = await fsLoad(COLL_CORSI);
  await loadAbbonamenti();

  // ordine di visualizzazione: prosegue dal massimo già assegnato
  let prossimoOrdine = abbonamentiData.reduce((m, a) => Math.max(m, a.ordine ?? -1), -1) + 1;

  for (const r of rawCorsi) {
    // `migratoAbbonamento` è un segnaposto permanente: una volta migrato un
    // corso, non si ritenta più — anche se in seguito l'abbonamento generato
    // viene cancellato dall'operatore (altrimenti ricomparirebbe ad ogni
    // caricamento, perché il corso legacy conserva per sempre `tipoPrezzo`).
    if (!r.nome || r.tipoPrezzo === undefined || r.migratoAbbonamento) continue;

    const giaMigrato = abbonamentiData.some(a => a.nome === r.nome);
    if (!giaMigrato) {
      const abDoc = {
        nome: r.nome,
        tipoErogazione: r.tipoPrezzo === 'scadenza' ? 'scadenza' : 'pacchetti',
        ordine: prossimoOrdine++,
        prova: parseNum(r.prova), x1: parseNum(r.x1), x4: parseNum(r.x4), x8: parseNum(r.x8), x12: parseNum(r.x12),
        x4Scad: parseNum(r.x4Scad), x8Scad: parseNum(r.x8Scad), x12Scad: parseNum(r.x12Scad),
        costoAbbonamento: parseNum(r.costoAbbonamento), scadenzaTipo: r.scadenzaTipo || '', scadenzaData: r.scadenzaData || '',
        x5: parseNum(r.x5), x10: parseNum(r.x10),
      };
      try {
        const id = await fsAdd(COLL_ABBONAMENTI, abDoc);
        abbonamentiData.push({ _id: id, ...abDoc });
      } catch (e) { continue; /* non marcarlo migrato: riproverà al prossimo caricamento */ }
    }

    try { await fsUpdate(COLL_CORSI, r._id, { migratoAbbonamento: true }); } catch (e) {}
  }
  abbonamentiData.sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.nome.localeCompare(b.nome, 'it'));

  corsiData = rawCorsi.map(r => ({
    _id: r._id,
    nome: r.nome || '',
    durata: r.durata || '',
    abbonamenti: Array.isArray(r.abbonamenti) ? r.abbonamenti : [], // vuoto = valido per qualsiasi abbonamento
  })).filter(r => r.nome).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

async function loadAbbonamenti() {
  const rows = await fsLoad(COLL_ABBONAMENTI);
  abbonamentiData = rows.map(r => ({
    _id: r._id,
    nome: r.nome || '',
    tipoErogazione: r.tipoErogazione === 'scadenza' ? 'scadenza' : 'pacchetti',
    ordine: typeof r.ordine === 'number' ? r.ordine : null, // null = non ancora ordinato manualmente
    prova: parseNum(r.prova),
    x1:  parseNum(r.x1),
    x4:  parseNum(r.x4),
    x8:  parseNum(r.x8),
    x12: parseNum(r.x12),
    x4Scad:  parseNum(r.x4Scad),
    x8Scad:  parseNum(r.x8Scad),
    x12Scad: parseNum(r.x12Scad),
    costoAbbonamento: parseNum(r.costoAbbonamento),
    scadenzaTipo:     r.scadenzaTipo || '',
    scadenzaData:     r.scadenzaData || '',
    x5:  parseNum(r.x5),
    x10: parseNum(r.x10),
  })).filter(r => r.nome).sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.nome.localeCompare(b.nome, 'it'));
}

async function loadPresenze() {
  const rows = await fsLoad(COLL_PRESENZE);
  presenzeData = rows.map(r => ({
    _id:     r._id,
    giorno:  r.giorno || '',
    ora:     r.ora || '',
    corso:   r.corso || '',
    allievi: Array.isArray(r.allievi) ? r.allievi : [],
    note:    r.note || '',
  })).filter(r => r.giorno && r.corso);
}

// ── NAVIGAZIONE ──────────────────────────────────────────
const sections = ['dashboard','inserimento','elenco','annuale','generale','tabelle','allievi','corsi','personale','iscrizioni','presenze','riepilogo-allievo','compensi','nota-mensile','report-presenze','report-iscrizioni'];

function showSection(name) {
  sections.forEach(s => { $('sec-'+s)?.classList.remove('active'); });
  document.querySelectorAll('[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });
  $('sec-'+name)?.classList.add('active');

  if (name === 'dashboard')   renderDashboard();
  if (name === 'elenco')      renderElenco();
  if (name === 'annuale')     renderAnnuale();
  if (name === 'generale')    renderGenerale();
  if (name === 'tabelle')     renderTabelle();
  if (name === 'allievi')     renderAllievi();
  if (name === 'corsi')       setCorsiSubTab(corsiSubTab);
  if (name === 'personale')   renderPersonale();
  if (name === 'iscrizioni')  renderIscrizioni();
  if (name === 'presenze')    renderPresenze();
  if (name === 'riepilogo-allievo') renderRiepilogoSection();
  if (name === 'compensi')        renderCompensi();
  if (name === 'nota-mensile')    renderNotaMensile();
  if (name === 'report-presenze') renderReportPresenze();
  if (name === 'report-iscrizioni') renderReportIscrizioni();

  if (window.innerWidth <= 1024) {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay')?.classList.remove('show');
    window.scrollTo({ top: 0 });
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

  // Allievi attivi = iscritti nell'anno accademico corrente
  const asCorrente = currentAnnoScolastico();
  const attivi = new Set(iscrizioniData.filter(r => r.as === asCorrente).map(r => r.allievo)).size;
  $('kpiAllievi').textContent = attivi || '—';
  $('kpiAllieviAS').textContent = `· ${asCorrente}`;

  // Entrate / uscite / saldo del mese corrente
  const now = new Date();
  const delMese = speseData.filter(r => r.data && r.data.getFullYear() === now.getFullYear() && r.data.getMonth() === now.getMonth());
  const entrate = delMese.filter(r => r.tipo === 'Entrate').reduce((s,r) => s+r.costo, 0);
  const uscite  = delMese.filter(r => r.tipo === 'Uscite').reduce((s,r) => s+r.costo, 0);
  const saldo   = entrate - uscite;

  $('kpiEntrate').textContent = fmt(entrate);
  $('kpiUscite').textContent  = fmt(uscite);
  $('kpiSaldo').textContent   = fmt(saldo);
  $('kpiSaldo').className     = 'kpi-value ' + (saldo >= 0 ? 'kpi-green' : 'kpi-red');
  $('kpiCassa').textContent   = fmt(calcCassaCorrente());

  renderDashDaSaldare();
  renderDashProssime();
  renderDashScadenze();
  renderChartDash();
}

function renderDashDaSaldare() {
  const el = $('dashDaSaldare');
  // la prova è gratuita: non tracciata come "da pagare"
  const daSaldare = iscrizioniData
    .filter(r => r.tipo !== 'Prova' && !isPagato(r.pagato))
    .sort((a,b) => String(b.data).localeCompare(String(a.data)));

  if (!daSaldare.length) {
    el.innerHTML = '<p style="color:var(--green);font-size:13px;padding:6px 0;">✓ Tutte le iscrizioni sono saldate.</p>';
    return;
  }

  const tot = daSaldare.reduce((s,r) => s + (r.costo||0), 0);
  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${daSaldare.length} iscrizioni · ${fmt(tot)} da incassare</div>
    <div style="max-height:260px;overflow-y:auto;">
      ${daSaldare.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span style="cursor:pointer;color:var(--accent);text-decoration:underline;text-underline-offset:3px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            onclick="apriRiepilogoAllievo('${escHtml(r.allievo).replace(/'/g,"&#39;")}')">${escHtml(r.allievo)}</span>
          <span style="color:var(--text-muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${corsiDisplayHtml(r.corsi)} (${escHtml(r.tipo)})</span>
          <span style="color:var(--red);font-variant-numeric:tabular-nums;white-space:nowrap;">${r.costo ? fmt(r.costo) : '—'}</span>
        </div>`).join('')}
    </div>`;
}

// Prossime lezioni reali dal calendario: da oggi a +7 giorni
function renderDashProssime() {
  const el = $('dashProssime');
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const oggiYMD = `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,'0')}-${String(oggi.getDate()).padStart(2,'0')}`;
  const limite = new Date(oggi); limite.setDate(limite.getDate() + 7);
  const limiteYMD = `${limite.getFullYear()}-${String(limite.getMonth()+1).padStart(2,'0')}-${String(limite.getDate()).padStart(2,'0')}`;

  const GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const prossime = presenzeData
    .filter(p => p.giorno >= oggiYMD && p.giorno <= limiteYMD)
    .sort((a,b) => a.giorno.localeCompare(b.giorno) || (a.ora||'').localeCompare(b.ora||''));

  if (!prossime.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:6px 0;">Nessuna lezione in calendario nei prossimi 7 giorni. Usa "Importa calendario" nella scheda Presenze.</p>';
    return;
  }

  el.innerHTML = `
    <div style="max-height:260px;overflow-y:auto;">
      ${prossime.map(p => {
        const isOggi = p.giorno === oggiYMD;
        const domani = new Date(oggi); domani.setDate(domani.getDate() + 1);
        const domaniYMD = `${domani.getFullYear()}-${String(domani.getMonth()+1).padStart(2,'0')}-${String(domani.getDate()).padStart(2,'0')}`;
        const label = isOggi ? 'Oggi' : p.giorno === domaniYMD ? 'Domani' : GIORNI[new Date(p.giorno).getDay()];
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span class="badge ${isOggi ? 'badge-green' : 'badge-gold'}" style="white-space:nowrap;width:78px;justify-content:center;flex-shrink:0;">${label}</span>
          <span style="color:var(--text-muted);font-size:12px;white-space:nowrap;">${fmtDate(p.giorno)}${p.ora ? ` · ${p.ora}` : ''}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(p.corso)}</span>
          ${p.allievi.length ? `<span style="color:var(--text-dim);font-size:11px;white-space:nowrap;">${p.allievi.length} pres.</span>` : ''}
          <button class="btn-table" title="Registra presenze" onclick="openEditPresenza('${p._id}')">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>`;
      }).join('')}
    </div>`;
}

// Pacchetti (x4/x8/x12) e abbonamenti (corsi "a scadenza") in scadenza entro N giorni,
// PIÙ chi sta esaurendo le lezioni del pacchetto anche se la scadenza a calendario
// (se configurata) è ancora lontana. Ogni iscrizione è un caso a sé: scadenza e
// lezioni consumate si calcolano sulla SUA data di acquisto, non si sommano tra
// iscrizioni diverse né con altri pacchetti dello stesso allievo. Un'iscrizione
// con più corsi selezionati compare come candidata per ciascuno di essi (il
// conteggio lezioni resta però lo stesso, condiviso su tutti). La prova non ha
// scadenza: mai in questo elenco.
function pacchettiInScadenza(entroGiorni = 15, sogliaLezioni = 1) {
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const scadKeys = { x4: 'x4Scad', x8: 'x8Scad', x12: 'x12Scad' };

  // solo il pacchetto/abbonamento più recente per allievo+corso: uno già
  // sostituito da un acquisto successivo non deve restare per sempre
  // "scaduto"/"esaurito" nell'elenco.
  const latestPacchetto = new Map();
  const latestScadenza  = new Map();
  iscrizioniData.forEach(isc => {
    const corsi = isc.corsi && isc.corsi.length ? isc.corsi : [''];
    corsi.forEach(corso => {
      const key = `${isc.allievo}|||${corso}`;
      if (SCAD_TIPI_SET.has(isc.tipo)) {
        const cur = latestScadenza.get(key);
        if (!cur || isc.data > cur.isc.data) latestScadenza.set(key, { isc, corso });
      } else if (isc.tipo !== 'Prova') {
        const cur = latestPacchetto.get(key);
        if (!cur || isc.data > cur.isc.data) latestPacchetto.set(key, { isc, corso });
      }
    });
  });

  const risultati = [];

  latestScadenza.forEach(({ isc, corso }) => {
    const scadenza = ymdToDate(isc.scadenza);
    if (!scadenza) return;
    const giorniRimanenti = Math.round((scadenza - oggi) / 86400000);
    if (giorniRimanenti > entroGiorni) return;
    risultati.push({ allievo: isc.allievo, corso, tipo: isc.tipo, scadenza, giorniRimanenti, soloScadenza: true, motivo: 'data' });
  });

  latestPacchetto.forEach(({ isc, corso }) => {
    if (isc.tipo === 'x1') return; // lezione singola: nessun "pacchetto" da monitorare
    const lezioniTotali = lezioniDaTipo(isc.tipo);
    if (!lezioniTotali) return; // tipo non riconosciuto

    // lezioni di QUESTO pacchetto, condivise su tutti i corsi selezionati nell'iscrizione
    const consumate = presenzeConsumatePerIscrizione(isc);
    const rimanenti = Math.max(0, lezioniTotali - consumate);

    // scadenza a calendario del pacchetto, se l'abbonamento ne ha una configurata
    const scadKey = scadKeys[isc.tipo];
    const ab = scadKey ? abbonamentiData.find(a => a.nome === resolveAbbonamentoNome(isc)) : null;
    const giorniScad = ab ? parseNum(ab[scadKey]) : 0;
    let scadenza = null, giorniRimanenti = null;
    if (giorniScad) {
      const dataAcquisto = ymdToDate(isc.data);
      if (dataAcquisto) {
        scadenza = new Date(dataAcquisto);
        scadenza.setDate(scadenza.getDate() + giorniScad);
        giorniRimanenti = Math.round((scadenza - oggi) / 86400000);
      }
    }

    const scadeAPresto         = giorniRimanenti !== null && giorniRimanenti <= entroGiorni;
    const lezioniInEsaurimento = rimanenti <= sogliaLezioni;
    if (!scadeAPresto && !lezioniInEsaurimento) return;

    // se scade a breve E sta finendo le lezioni, la scadenza a calendario resta il motivo
    // principale (è l'informazione più urgente); altrimenti segnaliamo l'esaurimento lezioni
    risultati.push({
      allievo: isc.allievo, corso, tipo: isc.tipo,
      scadenza, giorniRimanenti, lezioniTotali, rimanenti, soloScadenza: false,
      motivo: scadeAPresto ? 'data' : 'lezioni',
    });
  });

  return risultati.sort((a, b) => {
    const ga = a.giorniRimanenti ?? Infinity, gb = b.giorniRimanenti ?? Infinity;
    if (ga !== gb) return ga - gb;
    return (a.rimanenti ?? Infinity) - (b.rimanenti ?? Infinity);
  });
}

function renderDashScadenze() {
  const el = $('dashScadenze');
  if (!el) return;
  const pacchetti = pacchettiInScadenza(15, 1);

  if (!pacchetti.length) {
    el.innerHTML = '<p style="color:var(--text-dim);font-size:13px;padding:6px 0;">Nessun pacchetto in scadenza né vicino all\'esaurimento.</p>';
    return;
  }

  el.innerHTML = `
    <div style="max-height:260px;overflow-y:auto;">
      ${pacchetti.map(p => {
        let badge, label;
        if (p.motivo === 'data') {
          const scaduto = p.giorniRimanenti < 0;
          badge = scaduto ? 'badge-red' : p.giorniRimanenti <= 3 ? 'badge-red' : 'badge-gold';
          label = scaduto ? 'Scaduto' : p.giorniRimanenti === 0 ? 'Oggi' : `${p.giorniRimanenti} gg`;
        } else {
          badge = p.rimanenti === 0 ? 'badge-red' : 'badge-gold';
          label = p.rimanenti === 0 ? 'Esaurito' : `${p.rimanenti} lez.`;
        }
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span class="badge ${badge}" style="white-space:nowrap;width:64px;justify-content:center;flex-shrink:0;">${label}</span>
          <span style="cursor:pointer;color:var(--accent);text-decoration:underline;text-underline-offset:3px;flex-shrink:0;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
            onclick="apriRiepilogoAllievo('${escHtml(p.allievo).replace(/'/g,"&#39;")}')">${escHtml(p.allievo)}</span>
          <span style="color:var(--text-muted);font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.corso ? escHtml(p.corso) : '—'} (${p.tipo})</span>
          ${p.soloScadenza ? '' : `<span style="color:var(--text-dim);font-size:11px;white-space:nowrap;">${p.rimanenti}/${p.lezioniTotali} lez.</span>`}
          ${p.scadenza ? `<span style="color:var(--text-dim);font-size:11px;white-space:nowrap;">${fmtDate(dateToYmd(p.scadenza))}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
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

  // descrizione precompilata quando scegli l'allievo da tesserare
  $('fTessAllievo')?.addEventListener('change', () => {
    const nome = $('fTessAllievo').value;
    const desc = $('fDescrizione');
    if (nome && (!desc.value.trim() || desc.value.startsWith('Tesseramento '))) {
      desc.value = `Tesseramento ${nome}`;
    }
  });
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
      updateTessAllievoGroup();
      updateFPersonaleGroup();
    });
  });
  updateTessAllievoGroup();
  updateFPersonaleGroup();
}

// Categoria "Tesseramento": mostra la tendina allievi
async function updateTessAllievoGroup() {
  const grp = $('tessAllievoGroup');
  if (!grp) return;
  const show = currentCat === 'Tesseramento';
  grp.style.display = show ? '' : 'none';
  if (!show) { $('fTessAllievo').value = ''; $('fTessScad').value = ''; return; }
  if (!$('fTessScad').value) $('fTessScad').value = defaultTesseramentoScad();
  if (!allieviData.length) await loadAllievi();
  const cur = $('fTessAllievo').value;
  $('fTessAllievo').innerHTML = '<option value="">— seleziona allievo —</option>' +
    allieviData.slice()
      .sort((a,b) => a.nomeCompleto.localeCompare(b.nomeCompleto,'it'))
      .map(a => `<option value="${escHtml(a.nomeCompleto)}">${escHtml(a.nomeCompleto)}${isTesserato(a.tesseramento) ? ' — già tesserato' : ''}</option>`)
      .join('');
  $('fTessAllievo').value = cur;
}

// Categoria "Contributo team": mostra la tendina del personale
async function updateFPersonaleGroup() {
  const grp = $('fPersonaleGroup');
  if (!grp) return;
  const show = currentCat === 'Contributo team';
  grp.style.display = show ? '' : 'none';
  if (!show) { $('fPersonale').value = ''; return; }
  if (!personaleData.length) await loadPersonale();
  const cur = $('fPersonale').value;
  $('fPersonale').innerHTML = '<option value="">— seleziona —</option>' +
    personaleData.map(p => `<option value="${escHtml(p.nomeCompleto)}">${escHtml(p.nomeCompleto)}</option>`).join('');
  $('fPersonale').value = cur;
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

  const tessAllievo = currentCat === 'Tesseramento' ? ($('fTessAllievo')?.value || '') : '';
  const tessScad    = currentCat === 'Tesseramento' ? ($('fTessScad')?.value || '') : '';
  const personale = currentCat === 'Contributo team' ? ($('fPersonale')?.value || '') : '';
  if (currentCat === 'Contributo team' && !personale) return showFeedback('Seleziona il personale.', true);

  $('btnSubmit').disabled = true;
  showFeedback('Salvataggio…');

  try {
    const docData = { data, costo, descrizione, categoria: currentCat, tipo: currentType, pagamento: currentPag };
    if (personale) docData.personale = personale;
    const id = await fsAdd(COLL_SPESE, docData);
    speseData.push({ _id: id, ...docData, data: new Date(data) });

    // aggiorna il tesseramento dell'allievo selezionato
    let extra = '';
    if (tessAllievo) {
      const a = allieviData.find(x => x.nomeCompleto === tessAllievo);
      if (a) {
        try {
          await fsUpdate(COLL_ALLIEVI, a._id, { tesseramento: 'Sì', tesseramentoScad: tessScad });
          a.tesseramento = 'Sì';
          a.tesseramentoScad = tessScad;
          extra = ` Tesseramento di ${tessAllievo}: Sì${tessScad ? ` fino al ${fmtDate(tessScad)}` : ''}.`;
        } catch (e) {
          extra = ` (aggiornamento tesseramento di ${tessAllievo} fallito)`;
        }
      }
    }

    $('btnSubmit').disabled = false;
    showFeedback('✓ Salvato correttamente!' + extra);
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

// ── IMPORT CSV ────────────────────────────────────────────
let csvValidDocs = [];

function initCsvImport() {
  const closeCsvModal = () => {
    $('modalCsvOverlay').style.display = 'none';
    csvValidDocs = [];
    $('csvPreview').innerHTML = '';
  };
  $('btnImportCsv')?.addEventListener('click', () => { $('modalCsvOverlay').style.display = 'flex'; });
  $('modalCsvClose')?.addEventListener('click', closeCsvModal);

  $('btnCsvTemplate')?.addEventListener('click', downloadCsvTemplate);
  $('btnCsvPick')?.addEventListener('click', () => $('csvFile').click());
  $('csvFile')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => previewCsv(reader.result);
    reader.readAsText(file);
    e.target.value = ''; // permette di riselezionare lo stesso file
  });
}

function downloadCsvTemplate() {
  const oggi = fmtDate(new Date().toISOString().slice(0,10));
  const lines = [
    'Data;Importo;Descrizione;Categoria;Tipo;Pagamento',
    `${oggi};25,50;Esempio uscita;Affitto;Uscite;Contanti`,
    `${oggi};100;Esempio entrata;Allievi;Entrate;Bonifico`,
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'modello_entrate_uscite.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Parser CSV con supporto virgolette; separatore auto (';' o ',')
function parseCsvText(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g)||[]).length >= (firstLine.match(/,/g)||[]).length ? ';' : ',';

  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

// 'GG/MM/AAAA' o 'AAAA-MM-GG' → 'AAAA-MM-GG'; null se invalida
function csvParseData(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3]);
    const dt = new Date(y, mo-1, d);
    if (dt.getFullYear()!==y || dt.getMonth()!==mo-1 || dt.getDate()!==d) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(v);
    return isNaN(dt) ? null : v;
  }
  return null;
}

// Match case-insensitive contro lista canonica; null se assente
function csvCanon(v, list) {
  v = String(v || '').trim();
  if (!v) return null;
  return list.find(x => x.toLowerCase() === v.toLowerCase()) || null;
}

function previewCsv(text) {
  const el = $('csvPreview');
  csvValidDocs = [];
  let rows;
  try { rows = parseCsvText(text); }
  catch (e) { el.innerHTML = '<div class="form-feedback error">File non leggibile.</div>'; return; }

  if (!rows.length) { el.innerHTML = '<div class="form-feedback error">File vuoto.</div>'; return; }

  // salta intestazione se presente
  const h0 = (rows[0][0]||'').toLowerCase();
  if (h0.includes('data')) rows = rows.slice(1);

  const errors = [];
  rows.forEach((r, i) => {
    const nr = i + 1;
    const data  = csvParseData(r[0]);
    const costo = parseNum(r[1]);
    const descrizione = String(r[2]||'').trim();
    const tipoRaw = String(r[4]||'').trim().toLowerCase();
    const tipo = ['uscite','uscita'].includes(tipoRaw) ? 'Uscite'
               : ['entrate','entrata'].includes(tipoRaw) ? 'Entrate' : null;
    const catList = tipo === 'Entrate' ? CAT_ENTRATE : CAT_USCITE;
    const categoria = csvCanon(r[3], catList);
    const pagRaw = String(r[5]||'').trim();
    const pagamento = pagRaw ? csvCanon(pagRaw, PAG_OPTIONS) : '';

    if (!data)        errors.push(`Riga ${nr}: data non valida ("${r[0]||''}")`);
    if (!costo || costo <= 0) errors.push(`Riga ${nr}: importo non valido ("${r[1]||''}")`);
    if (!descrizione) errors.push(`Riga ${nr}: descrizione mancante`);
    if (!tipo)        errors.push(`Riga ${nr}: tipo deve essere Entrate o Uscite ("${r[4]||''}")`);
    if (tipo && !categoria) errors.push(`Riga ${nr}: categoria "${r[3]||''}" non valida per ${tipo}`);
    if (pagRaw && pagamento === null) errors.push(`Riga ${nr}: pagamento "${pagRaw}" non valido (${PAG_OPTIONS.join(', ')})`);

    if (data && costo > 0 && descrizione && tipo && categoria && pagamento !== null) {
      csvValidDocs.push({ data, costo, descrizione, categoria, tipo, pagamento: pagamento || '' });
    }
  });

  const previewRows = csvValidDocs.slice(0, 10).map(d => `
    <tr>
      <td>${fmtDate(d.data)}</td>
      <td>${escHtml(d.descrizione)}</td>
      <td>${escHtml(d.categoria)}</td>
      <td><span class="badge ${d.tipo==='Entrate'?'badge-green':'badge-red'}">${d.tipo}</span></td>
      <td style="text-align:right">${fmt(d.costo)}</td>
      <td style="color:var(--text-muted)">${escHtml(d.pagamento)}</td>
    </tr>`).join('');

  el.innerHTML = `
    ${errors.length ? `<div style="font-size:12px;color:var(--red);margin-bottom:10px;max-height:140px;overflow-y:auto;">${errors.map(escHtml).join('<br>')}</div>` : ''}
    ${csvValidDocs.length ? `
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Tipo</th><th style="text-align:right">Importo</th><th>Pagamento</th></tr></thead>
          <tbody>${previewRows}</tbody>
        </table>
      </div>
      ${csvValidDocs.length > 10 ? `<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">…e altre ${csvValidDocs.length - 10} righe</div>` : ''}
      <div class="form-actions" style="justify-content:flex-start;margin-top:14px;">
        <button class="btn-primary" id="btnCsvImport">Importa ${csvValidDocs.length} righe${errors.length ? ' valide' : ''}</button>
        <button class="btn-secondary" id="btnCsvCancel">Annulla</button>
      </div>` : '<div class="form-feedback error">Nessuna riga valida da importare.</div>'}
  `;

  $('btnCsvImport')?.addEventListener('click', importCsvRows);
  $('btnCsvCancel')?.addEventListener('click', () => { csvValidDocs = []; el.innerHTML = ''; });
}

async function importCsvRows() {
  if (!csvValidDocs.length) return;
  const btn = $('btnCsvImport');
  btn.disabled = true;
  btn.textContent = 'Importazione…';
  try {
    const ids = await fsAddMany(COLL_SPESE, csvValidDocs);
    csvValidDocs.forEach((d, i) => {
      speseData.push({ _id: ids[i], ...d, data: new Date(d.data) });
    });
    $('csvPreview').innerHTML = `<div class="form-feedback">✓ Importate ${csvValidDocs.length} righe.</div>`;
    csvValidDocs = [];
    renderElenco(); // aggiorna tabella e filtri sotto la modale
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Riprova';
    $('csvPreview').insertAdjacentHTML('beforeend', '<div class="form-feedback error">Errore durante l\'importazione.</div>');
  }
}

// ── ELENCO SPESE ──────────────────────────────────────────

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

  // ordine di default: più recenti in cima; l'utente può poi ordinare
  // per qualunque colonna cliccando l'intestazione della tabella
  filtered = filtered.sort((a,b) => {
    if (!a.data) return 1; if (!b.data) return -1;
    return b.data - a.data;
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
  updateMPersonaleGroup(r.personale);
  $('modalOverlay').style.display = 'flex';
}

function closeModal() { $('modalOverlay').style.display = 'none'; editRowIndex = null; }

// Categoria "Contributo team" nella modifica: mostra/popola la tendina del personale
async function updateMPersonaleGroup(selected) {
  const grp = $('mPersonaleGroup');
  const show = $('mCategoria').value.trim() === 'Contributo team';
  grp.style.display = show ? '' : 'none';
  if (!show) { $('mPersonale').value = ''; return; }
  if (!personaleData.length) await loadPersonale();
  $('mPersonale').innerHTML = '<option value="">— seleziona —</option>' +
    personaleData.map(p => `<option value="${escHtml(p.nomeCompleto)}">${escHtml(p.nomeCompleto)}</option>`).join('');
  $('mPersonale').value = selected || '';
}

async function saveEdit() {
  if (!editRowIndex) return;
  const categoria = $('mCategoria').value;
  const personale = categoria === 'Contributo team' ? $('mPersonale').value : '';
  if (categoria === 'Contributo team' && !personale) return appAlert('Seleziona il personale.');

  const upd = {
    data:        $('mData').value,
    costo:       parseFloat($('mCosto').value),
    descrizione: $('mDescrizione').value,
    categoria,
    tipo:        $('mTipo').value,
    pagamento:   $('mPagamento').value,
    personale,
  };
  try {
    await fsUpdate(COLL_SPESE, editRowIndex, upd);
    const r = speseData.find(r => r._id === editRowIndex);
    if (r) Object.assign(r, upd, { data: new Date(upd.data) });
    closeModal(); applyFilters();
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deleteRow(id) {
  if (!await appConfirm('Eliminare questa voce?')) return;
  try {
    await fsDelete(COLL_SPESE, id);
    speseData = speseData.filter(r => r._id !== id);
    applyFilters();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
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

let editAllieviIdx = null;

async function renderAllievi() {
  $('allieviLoading').style.display=''; $('allieviTableWrap').style.display='none'; $('allieviEmpty').style.display='none';
  if (!allieviData.length) await loadAllievi();
  $('allieviLoading').style.display='none';

  const tipi = [...new Set(allieviData.map(r=>r.tipo).filter(Boolean))].sort();
  $('filterTipoAllievo').innerHTML = '<option value="">Tutti i tipi</option>' + tipi.map(t=>`<option value="${t}">${t}</option>`).join('');

  applyAllieviFilters();
}

// tesseramento valorizzato (e diverso da "no") = tesserato
function isTesserato(v) {
  const s = String(v || '').trim().toLowerCase();
  return s !== '' && s !== 'no' && s !== 'n';
}

function applyAllieviFilters() {
  const search = $('searchAllievi').value.toLowerCase();
  const tipo   = $('filterTipoAllievo').value;
  const tess   = $('filterTesseramento').value;
  let filtered = allieviData.filter(r => {
    if (search && !r.nomeCompleto.toLowerCase().includes(search) && !r.mail.toLowerCase().includes(search)) return false;
    if (tipo && r.tipo !== tipo) return false;
    if (tess === 'si' && !isTesserato(r.tesseramento)) return false;
    if (tess === 'no' &&  isTesserato(r.tesseramento)) return false;
    return true;
  });

  // ordine di default: cognome (nomeCompleto = "Cognome Nome"); l'utente
  // può poi ordinare per qualunque colonna cliccando l'intestazione
  filtered = filtered.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'it'));

  if (!filtered.length) { $('allieviTableWrap').style.display='none'; $('allieviEmpty').style.display=''; return; }
  $('allieviEmpty').style.display='none'; $('allieviTableWrap').style.display='';

  renderAllieviTables(filtered);
}

const ALLIEVI_THEAD = `<colgroup>
  <col style="width:24%"><col style="width:13%"><col style="width:13%">
  <col style="width:14%"><col style="width:18%"><col style="width:18%">
  <col style="width:72px">
</colgroup><thead><tr>
  <th>Nome completo</th><th>Tipo</th><th>Tesseramento</th>
  <th>Cellulare</th><th>Mail</th><th>Note</th>
  <th style="width:72px"></th>
</tr></thead>`;

function allievoRowHtml(r) {
  const c = getTipoColor(r.tipo);
  const badgeStyle = `background:${c.bg};border:1px solid ${c.border};color:${c.text};display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;`;
  // nome cliccabile → riepilogo allievo
  const nomeSafe = escHtml(r.nomeCompleto).replace(/'/g,'&#39;');
  return `<tr>
      <td style="font-weight:500;cursor:pointer;" onclick="apriRiepilogoAllievo('${nomeSafe}')" title="Apri riepilogo">
        <span style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;">${escHtml(r.nomeCompleto)}</span>
      </td>
      <td><span style="${badgeStyle}">${escHtml(r.tipo)}</span></td>
      <td style="color:var(--text-muted)">${escHtml(String(r.tesseramento))}${isTesserato(r.tesseramento) && r.tesseramentoScad ? `<br><span style="color:var(--text-dim);font-size:10px;">fino al ${fmtDate(r.tesseramentoScad)}</span>` : ''}</td>
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
}

function renderAllieviTables(filtered) {
  const raggruppa = ($('allieviRaggruppa')||{}).value || '';
  const wrap = $('allieviTableWrap');

  if (!raggruppa) {
    wrap.innerHTML = `<div class="table-wrap">
      <table class="data-table" id="allieviTable" data-mobile-cols="allieviTable">${ALLIEVI_THEAD}
        <tbody id="allieviBody">${filtered.map(allievoRowHtml).join('')}</tbody>
      </table>
    </div>`;
    return;
  }

  const gruppi = {};
  filtered.forEach(r => {
    const key = raggruppa === 'tipo' ? (r.tipo || '__none__') : (isTesserato(r.tesseramento) ? 'Tesserati' : 'Non tesserati');
    (gruppi[key] ||= []).push(r);
  });
  const chiavi = Object.keys(gruppi).sort((a, b) => {
    if (raggruppa === 'tesseramento') return a === 'Tesserati' ? -1 : b === 'Tesserati' ? 1 : 0;
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b, 'it', { numeric: true });
  });

  wrap.innerHTML = chiavi.map(k => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">${k === '__none__' ? 'Senza tipo' : escHtml(k)} <span style="color:var(--text-dim);font-weight:400;">(${gruppi[k].length})</span></div>
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table" data-mobile-cols="allieviTable">${ALLIEVI_THEAD}
          <tbody>${gruppi[k].map(allievoRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');
}

function setTipoChip(val) {
  document.querySelectorAll('#aTipoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tipo === val);
  });
  $('aTipo').value = val || '';
}

// Mostra/nasconde la data di scadenza in base al valore del select Tesseramento
function updateTesseramentoScadGroup(prefillIfEmpty) {
  const isSi = $('aTesseramento').value === 'Sì';
  $('aTesseramentoScadGroup').style.display = isSi ? '' : 'none';
  if (isSi && prefillIfEmpty && !$('aTesseramentoScad').value) {
    $('aTesseramentoScad').value = defaultTesseramentoScad();
  }
  if (!isSi) $('aTesseramentoScad').value = '';
}

function openNewAllievo() {
  editAllieviIdx = null;
  $('modalAllieviTitle').textContent = 'Nuovo allievo';
  ['aCognome','aNome','aCellulare','aMail','aIndirizzo','aNote'].forEach(id => { $(id).value=''; });
  $('aTesseramento').value = 'No';
  $('aTesseramentoScad').value = '';
  updateTesseramentoScadGroup(false);
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
  $('aTesseramento').value = isTesserato(r.tesseramento) ? 'Sì' : 'No';
  $('aTesseramentoScad').value = r.tesseramentoScad || '';
  updateTesseramentoScadGroup(false);
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
  const tesseramentoScad = tesseramento === 'Sì' ? $('aTesseramentoScad').value : '';
  const cellulare   = $('aCellulare').value.trim();
  const mail        = $('aMail').value.trim();
  const indirizzo   = $('aIndirizzo').value.trim();
  const note        = $('aNote').value.trim();
  const nomeCompleto= `${cognome} ${nome}`.trim();

  if (!cognome && !nome) return appAlert('Inserisci almeno cognome o nome.');

  const docData = { cognome, nome, nomeCompleto, tipo, tesseramento, tesseramentoScad, cellulare, mail, indirizzo, note };

  try {
    const isNuovo = editAllieviIdx === null;
    if (isNuovo) {
      const id = await fsAdd(COLL_ALLIEVI, docData);
      allieviData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_ALLIEVI, editAllieviIdx, docData);
      const r = allieviData.find(r => r._id === editAllieviIdx);
      if (r) Object.assign(r, docData);
    }
    closeAllieviModal();
    applyAllieviFilters();
    refreshRiepilogoIfActive();

    // nuovo allievo → proponi subito l'iscrizione
    if (isNuovo && await appConfirm(`Allievo "${nomeCompleto}" salvato.\nVuoi procedere subito con l'iscrizione?`)) {
      if (!corsiData.length) await loadCorsi();
      populateAllieviDatalist();
      openNuovaIscrizione();
      $('iAllievo').value = nomeCompleto;
    }
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deleteAllievo(id) {
  const r = allieviData.find(r => r._id === id);
  if (!r) return;
  const ok = await appConfirm(`Eliminare l'allievo "${r.nomeCompleto}"?\nQuesta operazione non può essere annullata.`);
  if (!ok) return;
  try {
    await fsDelete(COLL_ALLIEVI, id);
    allieviData = allieviData.filter(r => r._id !== id);
    applyAllieviFilters();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
  }
}

// ── CORSI (semplificati: nome, durata, abbonamenti ammessi) ──
let editCorsoId = null;
let corsiSubTab = 'corsi'; // 'corsi' | 'abbonamenti'

const CORSI_THEAD = `<colgroup>
  <col style="width:26%"><col style="width:16%"><col style="width:38%">
  <col style="width:70px">
</colgroup><thead><tr>
  <th>Nome</th><th>Durata</th><th>Tipo di abbonamento</th>
  <th style="width:70px"></th>
</tr></thead>`;

// Colori stabili per corso (in ordine alfabetico, come corsiData), usati nel
// calendario presenze per distinguere a colpo d'occhio le lezioni dei vari corsi.
const CORSO_COLORS = [
  { bg:'rgba(201,169,110,0.18)', border:'#c9a96e', text:'#c9a96e' },
  { bg:'rgba(92,184,92,0.18)',   border:'#5cb85c', text:'#5cb85c' },
  { bg:'rgba(91,192,222,0.18)',  border:'#5bc0de', text:'#5bc0de' },
  { bg:'rgba(155,89,182,0.18)',  border:'#9b59b6', text:'#9b59b6' },
  { bg:'rgba(230,126,34,0.18)',  border:'#e67e22', text:'#e67e22' },
  { bg:'rgba(26,188,156,0.18)',  border:'#1abc9c', text:'#1abc9c' },
  { bg:'rgba(52,152,219,0.18)',  border:'#3498db', text:'#3498db' },
  { bg:'rgba(231,76,60,0.18)',   border:'#e74c3c', text:'#e74c3c' },
  { bg:'rgba(241,196,15,0.18)',  border:'#f1c40f', text:'#c9a20b' },
  { bg:'rgba(149,165,166,0.18)', border:'#95a5a6', text:'#95a5a6' },
];
function getCorsoColor(nome) {
  if (!nome) return { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
  let idx = corsiData.findIndex(c => c.nome === nome);
  if (idx < 0) {
    // corso non (più) presente in anagrafica: hash del nome per un colore comunque stabile
    idx = [...nome].reduce((h, ch) => h + ch.charCodeAt(0), 0);
  }
  return CORSO_COLORS[idx % CORSO_COLORS.length];
}

// Stesso schema colori, ma per abbonamento (badge "Tipo di abbonamento" sui corsi)
function getAbbonamentoColor(nome) {
  if (!nome) return { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
  let idx = abbonamentiData.findIndex(a => a.nome === nome);
  if (idx < 0) idx = [...nome].reduce((h, ch) => h + ch.charCodeAt(0), 0);
  return CORSO_COLORS[idx % CORSO_COLORS.length];
}

function corsoRowHtml(c) {
  const dash = '<span style="color:var(--text-dim)">—</span>';
  const abbonamenti = c.abbonamenti || [];
  const abbonamentiCell = abbonamenti.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:4px;">${abbonamenti.map(nome => {
        const cc = getAbbonamentoColor(nome);
        return `<span style="background:${cc.bg};border:1px solid ${cc.border};color:${cc.text};display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;">${escHtml(nome)}</span>`;
      }).join('')}</div>`
    : '<span style="color:var(--text-dim);font-style:italic;">Tutti</span>';
  return `<tr>
      <td style="font-weight:500">${escHtml(c.nome)}</td>
      <td style="color:var(--text-muted)">${escHtml(c.durata) || dash}</td>
      <td>${abbonamentiCell}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditCorso('${c._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteCorso('${c._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

async function renderCorsi() {
  $('corsiLoading').style.display=''; $('corsiLoading').innerHTML = LOADING_HTML;
  $('corsiTableWrap').style.display='none'; $('corsiEmpty').style.display='none';
  if (!corsiData.length) await loadCorsi();
  $('corsiLoading').style.display='none';

  if (!corsiData.length) { $('corsiEmpty').style.display=''; return; }
  $('corsiTableWrap').style.display='';
  renderCorsiTables();
}

function renderCorsiTables() {
  const raggruppa = $('corsiRaggruppa').value;
  const wrap = $('corsiTableWrap');

  if (!raggruppa) {
    wrap.innerHTML = `<div class="table-wrap">
      <table class="data-table" id="corsiTable" data-mobile-cols="corsiTable">${CORSI_THEAD}
        <tbody id="corsiBody">${corsiData.map(corsoRowHtml).join('')}</tbody>
      </table>
    </div>`;
    return;
  }

  const gruppi = {};
  if (raggruppa === 'abbonamento') {
    // un corso senza restrizioni li accetta tutti: compare in ogni gruppo
    // ("Tutti gli abbonamenti") invece che in un unico "senza tipo"
    corsiData.forEach(c => {
      const lista = (c.abbonamenti && c.abbonamenti.length) ? c.abbonamenti : ['__tutti__'];
      lista.forEach(nome => { (gruppi[nome] ||= []).push(c); });
    });
  } else {
    corsiData.forEach(c => {
      const key = c.durata.trim() || '__none__';
      (gruppi[key] ||= []).push(c);
    });
  }
  const chiavi = Object.keys(gruppi).sort((a, b) => {
    if (a === '__none__' || a === '__tutti__') return 1;
    if (b === '__none__' || b === '__tutti__') return -1;
    return a.localeCompare(b, 'it', { numeric: true });
  });
  const etichetta = raggruppa === 'abbonamento' ? 'Senza restrizioni (tutti gli abbonamenti)' : 'Durata non specificata';

  wrap.innerHTML = chiavi.map(k => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">${(k === '__none__' || k === '__tutti__') ? etichetta : escHtml(k)}</div>
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table" data-mobile-cols="corsiTable">${CORSI_THEAD}
          <tbody>${gruppi[k].map(corsoRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');
}

// Griglia multi-selezione "Tipo di abbonamento" nella modale corso: le opzioni
// sono gli abbonamenti esistenti, ognuno attivabile/disattivabile a piacere
// (nessuna selezione = corso valido per qualsiasi abbonamento).
function populateCorsoAbbonamentiGrid(selected) {
  const selSet = new Set(selected || []);
  const grid = $('cAbbonamentiGrid');
  grid.innerHTML = abbonamentiData.map(a =>
    `<button type="button" class="cat-chip${selSet.has(a.nome) ? ' active' : ''}" data-abnome="${escHtml(a.nome)}">${escHtml(a.nome)}</button>`
  ).join('');
  $('cAbbonamenti').value = JSON.stringify([...selSet]);
  grid.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      const scelti = [...grid.querySelectorAll('.cat-chip.active')].map(c => c.dataset.abnome);
      $('cAbbonamenti').value = JSON.stringify(scelti);
    });
  });
}

function openNewCorso() {
  editCorsoId = null;
  $('modalCorsoTitle').textContent = 'Nuovo corso';
  ['cNome','cDurata'].forEach(id => { $(id).value=''; });
  populateCorsoAbbonamentiGrid([]);
  $('modalCorsoOverlay').style.display = 'flex';
  $('cNome').focus();
}

function openEditCorso(id) {
  const c = corsiData.find(c => c._id === id);
  if (!c) return;
  editCorsoId = id;
  $('modalCorsoTitle').textContent = 'Modifica corso';
  $('cNome').value   = c.nome;
  $('cDurata').value = c.durata;
  populateCorsoAbbonamentiGrid(c.abbonamenti);
  $('modalCorsoOverlay').style.display = 'flex';
}

function closeCorsoModal() { $('modalCorsoOverlay').style.display = 'none'; editCorsoId = null; }

async function saveCorso() {
  const nome    = $('cNome').value.trim();
  const durata  = $('cDurata').value.trim();
  let abbonamenti = [];
  try { abbonamenti = JSON.parse($('cAbbonamenti').value || '[]'); } catch (e) { abbonamenti = []; }

  if (!nome) return appAlert('Inserisci il nome del corso.');

  const docData = { nome, durata, abbonamenti };

  // rinomina: iscrizioni e presenze puntano al corso per nome
  if (editCorsoId !== null) {
    const old = corsiData.find(c => c._id === editCorsoId);
    if (old && old.nome !== nome) {
      const usato = iscrizioniData.some(r => r.corsi.includes(old.nome)) || presenzeData.some(r => r.corso === old.nome);
      if (usato && !await appConfirm(`Stai rinominando "${old.nome}" in "${nome}".\nLe iscrizioni e presenze esistenti restano legate al vecchio nome. Continuare?`)) return;
    }
  }

  try {
    if (editCorsoId === null) {
      const id = await fsAdd(COLL_CORSI, docData);
      corsiData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_CORSI, editCorsoId, docData);
      const c = corsiData.find(c => c._id === editCorsoId);
      if (c) Object.assign(c, docData);
    }
    corsiData.sort((a,b) => a.nome.localeCompare(b.nome, 'it'));
    closeCorsoModal();
    renderCorsi();
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deleteCorso(id) {
  const c = corsiData.find(c => c._id === id);
  if (!c) return;
  const usato = iscrizioniData.some(r => r.corsi.includes(c.nome)) || presenzeData.some(r => r.corso === c.nome);
  const msg = usato
    ? `Il corso "${c.nome}" ha iscrizioni o presenze registrate (che NON verranno cancellate).\nEliminarlo comunque?`
    : `Eliminare il corso "${c.nome}"?`;
  if (!await appConfirm(msg)) return;
  try {
    await fsDelete(COLL_CORSI, id);
    corsiData = corsiData.filter(c => c._id !== id);
    renderCorsi();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
  }
}

// ── ABBONAMENTI (solo pagamento: prezzi a pacchetti o a scadenza; i corsi si scelgono in iscrizione) ──
let editAbbonamentoId = null;

const ABBONAMENTI_THEAD = `<colgroup>
  <col style="width:28px">
  <col style="width:26%"><col style="width:16%">
  <col style="width:16%"><col style="width:14%"><col style="width:10%">
  <col style="width:70px">
</colgroup><thead><tr>
  <th></th>
  <th>Nome</th><th>Erogazione</th>
  <th style="text-align:right">Lezione singola</th>
  <th style="text-align:right">x4 / x8 / x12</th>
  <th></th>
  <th style="width:70px"></th>
</tr></thead>`;

const DRAG_HANDLE_SVG = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
  <circle cx="2.5" cy="2" r="1.3"/><circle cx="7.5" cy="2" r="1.3"/>
  <circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/>
  <circle cx="2.5" cy="12" r="1.3"/><circle cx="7.5" cy="12" r="1.3"/>
</svg>`;

// `draggable`: il riordino ha senso solo nella vista non raggruppata (l'ordine
// è globale su tutti gli abbonamenti); nelle viste raggruppate la colonna
// resta per l'allineamento ma senza maniglia trascinabile.
function abbonamentoRowHtml(a, draggable = true) {
  const dash = '<span style="color:var(--text-dim)">—</span>';
  const isScadenza = a.tipoErogazione === 'scadenza';
  const handleCell = draggable
    ? `<td class="drag-handle-cell" draggable="true" title="Trascina per riordinare">${DRAG_HANDLE_SVG}</td>`
    : `<td></td>`;
  return `<tr data-ab-id="${a._id}">
      ${handleCell}
      <td style="font-weight:500">${escHtml(a.nome)}</td>
      <td>${isScadenza ? 'A scadenza' : 'A pacchetti'}</td>
      ${isScadenza ? `
      <td style="text-align:right;font-variant-numeric:tabular-nums">${a.costoAbbonamento ? fmt(a.costoAbbonamento) : dash}</td>
      <td style="color:var(--text-muted)">${escHtml(a.scadenzaTipo) || dash}</td>
      <td></td>` : `
      <td style="text-align:right;font-variant-numeric:tabular-nums">${a.x1 ? fmt(a.x1) : dash}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted);font-size:12px;">${[a.x4,a.x8,a.x12].map(v=>v?fmt(v):'—').join(' / ')}</td>
      <td></td>`}
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditAbbonamento('${a._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deleteAbbonamento('${a._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

async function renderAbbonamenti() {
  $('abbonamentiLoading').style.display=''; $('abbonamentiLoading').innerHTML = LOADING_HTML;
  $('abbonamentiTableWrap').style.display='none'; $('abbonamentiEmpty').style.display='none';
  if (!abbonamentiData.length && !corsiData.length) await loadCorsi();
  $('abbonamentiLoading').style.display='none';

  if (!abbonamentiData.length) { $('abbonamentiEmpty').style.display=''; return; }
  $('abbonamentiTableWrap').style.display='';
  renderAbbonamentiTables();
}

function renderAbbonamentiTables() {
  const raggruppa = $('abbonamentiRaggruppa').value;
  const wrap = $('abbonamentiTableWrap');

  if (!raggruppa) {
    wrap.innerHTML = `<div class="table-wrap">
      <table class="data-table" id="abbonamentiTable" data-mobile-cols="abbonamentiTable">${ABBONAMENTI_THEAD}
        <tbody id="abbonamentiBody">${abbonamentiData.map(a => abbonamentoRowHtml(a, true)).join('')}</tbody>
      </table>
    </div>`;
    initAbbonamentiDragDrop();
    return;
  }

  const gruppi = {};
  abbonamentiData.forEach(a => {
    const key = a.tipoErogazione === 'scadenza' ? 'A scadenza' : 'A pacchetti';
    (gruppi[key] ||= []).push(a);
  });
  const chiavi = Object.keys(gruppi).sort((a, b) => a.localeCompare(b, 'it'));

  wrap.innerHTML = chiavi.map(k => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">${escHtml(k)} <span style="color:var(--text-dim);font-weight:400;">(${gruppi[k].length})</span></div>
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table" data-mobile-cols="abbonamentiTable">${ABBONAMENTI_THEAD}
          <tbody>${gruppi[k].map(a => abbonamentoRowHtml(a, false)).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');
}

// Drag and drop per riordinare gli abbonamenti (solo vista non raggruppata,
// dato che l'ordine è un'unica sequenza globale). La maniglia di trascinamento
// è l'unico elemento draggable, cosí i click sui pulsanti Modifica/Elimina
// nella stessa riga non vengono mai interpretati come inizio di un trascinamento.
function initAbbonamentiDragDrop() {
  const tbody = document.getElementById('abbonamentiBody');
  if (!tbody) return;
  let dragSrcId = null;

  tbody.querySelectorAll('tr[data-ab-id]').forEach(tr => {
    const handle = tr.querySelector('.drag-handle-cell');
    if (!handle) return;

    handle.addEventListener('dragstart', e => {
      dragSrcId = tr.dataset.abId;
      e.dataTransfer.effectAllowed = 'move';
      tr.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('dragging', 'drag-over'));
      dragSrcId = null;
    });

    tr.addEventListener('dragover', e => {
      if (!dragSrcId || dragSrcId === tr.dataset.abId) return;
      e.preventDefault();
      tr.classList.add('drag-over');
    });
    tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
    tr.addEventListener('drop', e => {
      e.preventDefault();
      tr.classList.remove('drag-over');
      const targetId = tr.dataset.abId;
      if (!dragSrcId || dragSrcId === targetId) return;
      reorderAbbonamenti(dragSrcId, targetId);
    });
  });
}

async function reorderAbbonamenti(srcId, targetId) {
  const srcIdx = abbonamentiData.findIndex(a => a._id === srcId);
  const targetIdx = abbonamentiData.findIndex(a => a._id === targetId);
  if (srcIdx === -1 || targetIdx === -1) return;

  const [moved] = abbonamentiData.splice(srcIdx, 1);
  abbonamentiData.splice(targetIdx, 0, moved);
  abbonamentiData.forEach((a, i) => { a.ordine = i; });
  renderAbbonamentiTables();

  try {
    await Promise.all(abbonamentiData.map((a, i) => fsUpdate(COLL_ABBONAMENTI, a._id, { ordine: i })));
  } catch (e) {
    appAlert('Errore durante il salvataggio del nuovo ordine.');
  }
}

// Toggle A pacchetti / A scadenza nella modale abbonamento
function setAbbonamentoTipoErogazione(val) {
  document.querySelectorAll('#abTipoErogazioneGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.erogazione === val);
  });
  $('abTipoErogazione').value = val;
  $('abPacchettiGroup').style.display = val === 'scadenza' ? 'none' : '';
  $('abScadenzaGroup').style.display  = val === 'scadenza' ? '' : 'none';
}

// Chip durata (Mensile/Bimestrale/Semestrale/Annuale/Personalizzata) nella modale abbonamento
function setAbbonamentoScadTipo(val) {
  document.querySelectorAll('#abScadTipoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.scadtipo === val);
  });
  $('abScadTipo').value = val;
  $('abScadDataGroup').style.display = val === 'Personalizzata' ? '' : 'none';
}

function openNewAbbonamento() {
  editAbbonamentoId = null;
  $('modalAbbonamentoTitle').textContent = 'Nuovo abbonamento';
  ['abNome','abX1','abX4','abX8','abX12','abX4Scad','abX8Scad','abX12Scad','abCostoAbb','abScadData'].forEach(id => { $(id).value=''; });
  setAbbonamentoTipoErogazione('pacchetti');
  setAbbonamentoScadTipo('');
  $('modalAbbonamentoOverlay').style.display = 'flex';
  $('abNome').focus();
}

function openEditAbbonamento(id) {
  const a = abbonamentiData.find(a => a._id === id);
  if (!a) return;
  editAbbonamentoId = id;
  $('modalAbbonamentoTitle').textContent = 'Modifica abbonamento';
  $('abNome').value = a.nome;
  $('abX1').value  = a.x1  || '';
  $('abX4').value  = a.x4  || '';
  $('abX8').value  = a.x8  || '';
  $('abX12').value = a.x12 || '';
  $('abX4Scad').value  = a.x4Scad  || '';
  $('abX8Scad').value  = a.x8Scad  || '';
  $('abX12Scad').value = a.x12Scad || '';
  $('abCostoAbb').value = a.costoAbbonamento || '';
  $('abScadData').value = a.scadenzaData || '';
  setAbbonamentoTipoErogazione(a.tipoErogazione);
  setAbbonamentoScadTipo(a.scadenzaTipo);
  $('modalAbbonamentoOverlay').style.display = 'flex';
}

function closeAbbonamentoModal() { $('modalAbbonamentoOverlay').style.display = 'none'; editAbbonamentoId = null; }

async function saveAbbonamento() {
  const nome = $('abNome').value.trim();
  const tipoErogazione = $('abTipoErogazione').value;
  const x1  = parseFloat($('abX1').value)  || 0;
  const x4  = parseFloat($('abX4').value)  || 0;
  const x8  = parseFloat($('abX8').value)  || 0;
  const x12 = parseFloat($('abX12').value) || 0;
  const x4Scad  = parseInt($('abX4Scad').value)  || 0;
  const x8Scad  = parseInt($('abX8Scad').value)  || 0;
  const x12Scad = parseInt($('abX12Scad').value) || 0;
  const costoAbbonamento = parseFloat($('abCostoAbb').value) || 0;
  const scadenzaTipo = $('abScadTipo').value;
  const scadenzaData = scadenzaTipo === 'Personalizzata' ? $('abScadData').value : '';

  if (!nome) return appAlert('Inserisci il nome dell\'abbonamento.');
  if (tipoErogazione === 'scadenza' && !scadenzaTipo) return appAlert('Seleziona la durata dell\'abbonamento.');
  if (tipoErogazione === 'scadenza' && scadenzaTipo === 'Personalizzata' && !scadenzaData) return appAlert('Inserisci la data di scadenza.');

  const docData = { nome, tipoErogazione, x1, x4, x8, x12, x4Scad, x8Scad, x12Scad, costoAbbonamento, scadenzaTipo, scadenzaData };

  // rinomina: le iscrizioni puntano all'abbonamento per nome
  if (editAbbonamentoId !== null) {
    const old = abbonamentiData.find(a => a._id === editAbbonamentoId);
    if (old && old.nome !== nome) {
      const usato = iscrizioniData.some(r => r.abbonamento === old.nome);
      if (usato && !await appConfirm(`Stai rinominando "${old.nome}" in "${nome}".\nLe iscrizioni esistenti restano legate al vecchio nome. Continuare?`)) return;
    }
  }

  try {
    if (editAbbonamentoId === null) {
      // nuovo: in coda all'ordine di visualizzazione attuale
      const ordine = abbonamentiData.reduce((m, a) => Math.max(m, a.ordine ?? -1), -1) + 1;
      const id = await fsAdd(COLL_ABBONAMENTI, { ...docData, ordine });
      abbonamentiData.push({ _id: id, prova: 0, x5: 0, x10: 0, ...docData, ordine });
    } else {
      await fsUpdate(COLL_ABBONAMENTI, editAbbonamentoId, docData);
      const a = abbonamentiData.find(a => a._id === editAbbonamentoId);
      if (a) Object.assign(a, docData);
    }
    abbonamentiData.sort((a,b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.nome.localeCompare(b.nome, 'it'));
    closeAbbonamentoModal();
    renderAbbonamenti();
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deleteAbbonamento(id) {
  const a = abbonamentiData.find(a => a._id === id);
  if (!a) return;
  const usato = iscrizioniData.some(r => r.abbonamento === a.nome);
  const msg = usato
    ? `L'abbonamento "${a.nome}" ha iscrizioni collegate (che NON verranno cancellate).\nEliminarlo comunque?`
    : `Eliminare l'abbonamento "${a.nome}"?`;
  if (!await appConfirm(msg)) return;
  try {
    await fsDelete(COLL_ABBONAMENTI, id);
    abbonamentiData = abbonamentiData.filter(a => a._id !== id);
    renderAbbonamenti();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
  }
}

// Sotto-schede Corsi / Abbonamenti dentro la sezione "Corsi"
function setCorsiSubTab(tab) {
  corsiSubTab = tab;
  document.querySelectorAll('#corsiSubTabSwitch .pres-view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === tab);
  });
  $('corsiSubCorsi').style.display        = tab === 'corsi' ? '' : 'none';
  $('corsiSubAbbonamenti').style.display  = tab === 'abbonamenti' ? '' : 'none';
  $('btnNuovoCorso').style.display        = tab === 'corsi' ? '' : 'none';
  $('btnNuovoAbbonamento').style.display  = tab === 'abbonamenti' ? '' : 'none';
  if (tab === 'corsi') renderCorsi();
  else renderAbbonamenti();
}

// ── PERSONALE ─────────────────────────────────────────────
let editPersonaleId = null;

async function loadPersonale() {
  const rows = await fsLoad(COLL_PERSONALE);
  personaleData = rows.map(r => ({
    _id: r._id,
    cognome: r.cognome || '',
    nome: r.nome || '',
    nomeCompleto: r.nomeCompleto || `${r.cognome || ''} ${r.nome || ''}`.trim(),
  })).filter(r => r.nomeCompleto).sort((a,b) => a.cognome.localeCompare(b.cognome,'it'));
}

async function renderPersonale() {
  $('personaleLoading').style.display=''; $('personaleLoading').innerHTML = LOADING_HTML;
  $('personaleTableWrap').style.display='none'; $('personaleEmpty').style.display='none';
  if (!personaleData.length) await loadPersonale();
  $('personaleLoading').style.display='none';

  if (!personaleData.length) { $('personaleEmpty').style.display=''; return; }
  $('personaleTableWrap').style.display='';

  $('personaleBody').innerHTML = personaleData.map(p => `
    <tr>
      <td style="font-weight:500">${escHtml(p.cognome)}</td>
      <td>${escHtml(p.nome)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn-table" onclick="openEditPersonale('${p._id}')" title="Modifica">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn-table btn-del" onclick="deletePersonale('${p._id}')" title="Elimina">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function openNewPersonale() {
  editPersonaleId = null;
  $('modalPersonaleTitle').textContent = 'Nuovo membro del personale';
  $('pCognome').value = ''; $('pNome').value = '';
  $('modalPersonaleOverlay').style.display = 'flex';
  $('pCognome').focus();
}

function openEditPersonale(id) {
  const p = personaleData.find(p => p._id === id);
  if (!p) return;
  editPersonaleId = id;
  $('modalPersonaleTitle').textContent = 'Modifica membro del personale';
  $('pCognome').value = p.cognome;
  $('pNome').value = p.nome;
  $('modalPersonaleOverlay').style.display = 'flex';
}

function closePersonaleModal() { $('modalPersonaleOverlay').style.display = 'none'; editPersonaleId = null; }

async function savePersonale() {
  const cognome = $('pCognome').value.trim();
  const nome    = $('pNome').value.trim();
  if (!cognome && !nome) return appAlert('Inserisci almeno cognome o nome.');

  const nomeCompleto = `${cognome} ${nome}`.trim();
  const docData = { cognome, nome, nomeCompleto };

  try {
    if (editPersonaleId === null) {
      const id = await fsAdd(COLL_PERSONALE, docData);
      personaleData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_PERSONALE, editPersonaleId, docData);
      const p = personaleData.find(p => p._id === editPersonaleId);
      if (p) Object.assign(p, docData);
    }
    personaleData.sort((a,b) => a.cognome.localeCompare(b.cognome,'it'));
    closePersonaleModal();
    renderPersonale();
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deletePersonale(id) {
  const p = personaleData.find(p => p._id === id);
  if (!p) return;
  const usato = speseData.some(r => r.personale === p.nomeCompleto);
  const msg = usato
    ? `"${p.nomeCompleto}" ha contributi registrati (che NON verranno cancellati).\nEliminarlo comunque?`
    : `Eliminare "${p.nomeCompleto}"?`;
  if (!await appConfirm(msg)) return;
  try {
    await fsDelete(COLL_PERSONALE, id);
    personaleData = personaleData.filter(p => p._id !== id);
    renderPersonale();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
  }
}

// ── ISCRIZIONI ────────────────────────────────────────────
const TIPO_ISC_COLORS = {
  'Prova': { bg:'rgba(91,192,222,0.12)',  border:'#5bc0de', text:'#5bc0de' },
  'x1':   { bg:'rgba(201,169,110,0.12)', border:'#c9a96e', text:'#c9a96e' },
  'x4':   { bg:'rgba(230,126,34,0.12)',  border:'#e67e22', text:'#e67e22' },
  'x8':   { bg:'rgba(155,89,182,0.12)',  border:'#9b59b6', text:'#9b59b6' },
  'x12':  { bg:'rgba(92,184,92,0.12)',   border:'#5cb85c', text:'#5cb85c' },
  // legacy (iscrizioni storiche)
  'x5':   { bg:'rgba(155,89,182,0.12)',  border:'#9b59b6', text:'#9b59b6' },
  'x10':  { bg:'rgba(92,184,92,0.12)',   border:'#5cb85c', text:'#5cb85c' },
  // corsi "a scadenza"
  'Mensile':      { bg:'rgba(52,152,219,0.12)', border:'#3498db', text:'#3498db' },
  'Bimestrale':   { bg:'rgba(26,188,156,0.12)', border:'#1abc9c', text:'#1abc9c' },
  'Semestrale':   { bg:'rgba(230,126,34,0.12)', border:'#e67e22', text:'#e67e22' },
  'Annuale':      { bg:'rgba(155,89,182,0.12)', border:'#9b59b6', text:'#9b59b6' },
  'Personalizzata': { bg:'rgba(201,169,110,0.12)', border:'#c9a96e', text:'#c9a96e' },
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
    if (search && !r.allievo.toLowerCase().includes(search) && !(r.corsi||[]).some(c => c.toLowerCase().includes(search))) return false;
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

  renderIscrizioniTables(filtered);
}

const ISCRIZIONI_THEAD = `<colgroup>
  <col style="width:15%"><col style="width:9%"><col style="width:10%"><col style="width:11%">
  <col style="width:13%"><col style="width:10%"><col style="width:7%"><col style="width:9%">
  <col style="width:8%"><col style="width:72px">
</colgroup><thead><tr>
  <th>Allievo</th><th>A.S.</th><th>Data</th><th>Tipo</th><th>Corsi</th>
  <th>Data pag.</th><th>Pagato</th><th style="text-align:right">Costo</th><th>Note</th>
  <th style="width:72px"></th>
</tr></thead>`;

// Corso di un'iscrizione: vuoto per gli abbonamenti "mix" (valgono su qualsiasi corso)
// Elenco dei corsi di un'iscrizione (selezione multipla): come badge nella UI
// o come semplice testo (per CSV/PDF, con `vuoto` a piacere per il fallback).
function corsiDisplayHtml(corsi) {
  if (!corsi || !corsi.length) return '<span style="color:var(--text-dim);font-style:italic;">Nessun corso</span>';
  return corsi.map(c => escHtml(c)).join(', ');
}
function corsiDisplayText(corsi, vuoto) {
  return (corsi && corsi.length) ? corsi.join(', ') : (vuoto ?? '');
}

function iscrizioneRowHtml(r) {
  const isProva = r.tipo === 'Prova';
  const pag  = isPagato(r.pagato);
  const tc   = TIPO_ISC_COLORS[r.tipo] || { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
  const tStyle = `background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;`;
  // la prova è gratuita: niente pagamento/costo da mostrare
  const pagatoCell = isProva
    ? '<span style="color:var(--text-dim)">—</span>'
    : `<span class="badge ${pag?'badge-green':'badge-red'}">${pag?'Sì':'No'}</span>`;
  const costoCell = isProva ? '<span style="color:var(--text-dim)">—</span>' : (r.costo?fmt(r.costo):'—');
  return `<tr>
      <td style="font-weight:500;cursor:pointer;" onclick="apriRiepilogoAllievo('${escHtml(r.allievo).replace(/'/g,"&#39;")}')" title="Apri riepilogo">
        <span style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;">${escHtml(r.allievo)}</span>
      </td>
      <td><span class="badge badge-gold">${escHtml(r.as)}</span></td>
      <td>${fmtDate(r.data)}</td>
      <td><span style="${tStyle}">${escHtml(r.tipo)}</span></td>
      <td>${corsiDisplayHtml(r.corsi)}</td>
      <td>${isProva ? '<span style="color:var(--text-dim)">—</span>' : fmtDate(r.dataPag)}</td>
      <td>${pagatoCell}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${costoCell}</td>
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
}

function renderIscrizioniTables(filtered) {
  const raggruppa = ($('iscrizioniRaggruppa')||{}).value || '';
  const wrap = $('iscrizioniTableWrap');

  if (!raggruppa) {
    wrap.innerHTML = `<div class="table-wrap">
      <table class="data-table" id="iscrizioniTable" data-mobile-cols="iscrizioniTable">${ISCRIZIONI_THEAD}
        <tbody id="iscrizioniBody">${filtered.map(iscrizioneRowHtml).join('')}</tbody>
      </table>
    </div>`;
    return;
  }

  const tesseratoMap = {};
  allieviData.forEach(a => { tesseratoMap[a.nomeCompleto] = isTesserato(a.tesseramento); });
  const gruppi = {};
  filtered.forEach(r => {
    if (raggruppa === 'corso') {
      const corsi = (r.corsi && r.corsi.length) ? r.corsi : ['__none__'];
      corsi.forEach(c => (gruppi[c] ||= []).push(r));
      return;
    }
    const key = raggruppa === 'tipo' ? (r.tipo || '__none__')
      : (tesseratoMap[r.allievo] ? 'Tesserati' : 'Non tesserati');
    (gruppi[key] ||= []).push(r);
  });
  const chiavi = Object.keys(gruppi).sort((a, b) => {
    if (raggruppa === 'tesseramento') return a === 'Tesserati' ? -1 : b === 'Tesserati' ? 1 : 0;
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b, 'it', { numeric: true });
  });
  const etichettaNone = raggruppa === 'corso' ? 'Nessun corso' : 'Senza tipo';

  wrap.innerHTML = chiavi.map(k => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">${k === '__none__' ? etichettaNone : escHtml(k)} <span style="color:var(--text-dim);font-weight:400;">(${gruppi[k].length})</span></div>
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table" data-mobile-cols="iscrizioniTable">${ISCRIZIONI_THEAD}
          <tbody>${gruppi[k].map(iscrizioneRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');
}

// Se il riepilogo allievo è aperto, lo rigenera (dopo modifiche alle iscrizioni)
function refreshRiepilogoIfActive() {
  const sec = $('sec-riepilogo-allievo');
  if (!sec?.classList.contains('active')) return;
  const nome = $('riepilogoAllievoTitolo')?.textContent.trim();
  if (nome && nome !== '—') renderRiepilogoAllievo(nome);
}

function isPagato(v) {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === 'sì' || s === 'si' || s === 'true' || s === '1' || s === 'yes';
}

function getCostoAbbonamento(nomeAbbonamento, tipo) {
  const ab = abbonamentiData.find(a => a.nome === nomeAbbonamento);
  if (!ab) return 0;
  const map = { 'Prova': ab.prova, 'x1': ab.x1, 'x4': ab.x4, 'x8': ab.x8, 'x12': ab.x12, 'x5': ab.x5, 'x10': ab.x10 };
  return map[tipo] || 0;
}

const SCAD_TIPI_SET = new Set(['Mensile', 'Bimestrale', 'Semestrale', 'Annuale', 'Personalizzata']);

// Scadenza di un'iscrizione a un abbonamento "a scadenza": data fissa (Personalizzata,
// uguale per tutti) oppure data iscrizione + giorni della durata scelta.
function calcolaScadenzaIscrizione(abbonamento, dataIscrizione) {
  if (!abbonamento || abbonamento.tipoErogazione !== 'scadenza' || !abbonamento.scadenzaTipo) return '';
  if (abbonamento.scadenzaTipo === 'Personalizzata') return abbonamento.scadenzaData || '';
  const giorni = SCAD_TIPO_GIORNI[abbonamento.scadenzaTipo];
  const d = ymdToDate(dataIscrizione);
  if (!giorni || !d) return '';
  d.setDate(d.getDate() + giorni);
  return dateToYmd(d);
}

// Select multi-selezione "Corsi" nella modale iscrizione: un pulsante chiuso
// (come una select) che mostra i corsi scelti ed espande, al click, un pannello
// con una checkbox per corso. Mostra solo i corsi che accettano l'abbonamento
// attualmente scelto (un corso senza restrizioni ne accetta qualunque),
// selezione libera e multipla — l'allievo comparirà nell'elenco presenze di
// OGNI corso selezionato, con lezioni rimanenti condivise tra tutti (pool
// unico di consumo). `selected` è l'elenco corsi da preselezionare (usato in
// apertura modale); se omesso si mantiene la selezione corrente ancora valida
// dopo il filtro (cambio abbonamento a modale già aperta).
function populateCorsiChipGridIscrizione(selected) {
  const nomeAb = $('iAbbonamento').value;
  const panel = $('iCorsiSelectPanel');
  const daMantenere = selected !== undefined ? selected : (JSON.parse($('iCorsi').value || '[]'));
  let corsiValidi = corsiData.filter(c => !nomeAb || !c.abbonamenti?.length || c.abbonamenti.includes(nomeAb));
  // non far sparire dal pannello i corsi già salvati sull'iscrizione anche se
  // nel frattempo non accettano più questo abbonamento: si eviterebbe altrimenti
  // di perdere silenziosamente il dato aprendo in modifica un'iscrizione storica
  daMantenere.forEach(nome => {
    if (!corsiValidi.some(c => c.nome === nome)) {
      const corsoEsistente = corsiData.find(c => c.nome === nome);
      if (corsoEsistente) corsiValidi = [...corsiValidi, corsoEsistente];
    }
  });
  const selSet = new Set(daMantenere.filter(nome => corsiValidi.some(c => c.nome === nome)));
  panel.innerHTML = corsiValidi.length ? corsiValidi.map(c =>
    `<label class="pres-check-item${selSet.has(c.nome) ? ' checked' : ''}" data-corsonome="${escHtml(c.nome)}">
      <input type="checkbox" ${selSet.has(c.nome) ? 'checked' : ''}>
      <span class="pres-check-name">${escHtml(c.nome)}</span>
    </label>`
  ).join('') : '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Nessun corso disponibile per questo abbonamento</div>';
  $('iCorsi').value = JSON.stringify([...selSet]);
  updateIscCorsiSelectLabel([...selSet]);
  panel.querySelectorAll('.pres-check-item').forEach(item => {
    item.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      item.classList.toggle('checked', e.target.checked);
      const scelti = [...panel.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.closest('.pres-check-item').dataset.corsonome);
      $('iCorsi').value = JSON.stringify(scelti);
      updateIscCorsiSelectLabel(scelti);
    });
  });
}

// Etichetta del pulsante "select" dei corsi: elenco scelto, o un placeholder.
function updateIscCorsiSelectLabel(scelti) {
  const label = $('iCorsiSelectLabel');
  if (!label) return;
  label.textContent = scelti.length ? scelti.join(', ') : '— seleziona corsi —';
  label.classList.toggle('has-value', scelti.length > 0);
}

function toggleIscCorsiPanel(forceClose) {
  const panel = $('iCorsiSelectPanel');
  const btn   = $('iCorsiSelectBtn');
  if (!panel || !btn) return;
  const willOpen = forceClose ? false : panel.style.display === 'none';
  panel.style.display = willOpen ? '' : 'none';
  btn.classList.toggle('open', willOpen);
}

// Adatta la modale iscrizione all'abbonamento selezionato: chip pacchetti oppure
// riquadro informativo con la scadenza (nessuna scelta, la decide l'abbonamento).
function updateIscrizioneAbbonamentoMode() {
  const ab = abbonamentiData.find(a => a.nome === $('iAbbonamento').value);
  // "Prova" è un abbonamento dedicato (non più un tipo scelto a mano tra i
  // pacchetti): selezionandolo il tipo è fisso e la lezione è sempre gratuita.
  const isProva     = !!ab && ab.nome === 'Prova';
  const isScadenza  = !!ab && ab.tipoErogazione === 'scadenza' && !isProva;

  // la griglia corsi si filtra ai soli corsi che accettano l'abbonamento scelto
  populateCorsiChipGridIscrizione();

  $('iTipoPacchettiGroup').style.display = (isScadenza || isProva) ? 'none' : '';
  $('iTipoScadenzaInfo').style.display   = isScadenza ? '' : 'none';
  $('iTipoProvaInfo').style.display      = isProva ? '' : 'none';

  if (isProva) {
    setTipoIscChip('Prova');
    return;
  }
  if (isScadenza) {
    $('iTipo').value = ab.scadenzaTipo || '';
    const scad = calcolaScadenzaIscrizione(ab, $('iData').value);
    $('iTipoScadenzaLabel').textContent = ab.scadenzaTipo
      ? `${ab.scadenzaTipo}${scad ? ' — scade il ' + fmtDate(scad) : ''}`
      : 'Nessuna durata configurata su questo abbonamento';
    $('iPagatoRow').style.display = '';
    $('iCostoGroup').style.display = '';
  } else if (SCAD_TIPI_SET.has($('iTipo').value) || $('iTipo').value === 'Prova') {
    // si arrivava da un abbonamento "a scadenza" o "Prova": il tipo va riscelto con le chip pacchetti
    $('iTipo').value = '';
    document.querySelectorAll('#iTipoGrid .cat-chip').forEach(c => c.classList.remove('active'));
    $('iPagatoRow').style.display = '';
    $('iCostoGroup').style.display = '';
  }
  autoAggiornaCosto();
}

function populateAbbonamentiSelect(selected) {
  const sel = $('iAbbonamento');
  sel.innerHTML = '<option value="">— seleziona abbonamento —</option>' +
    abbonamentiData.map(a => `<option value="${escHtml(a.nome)}"${a.nome===selected?' selected':''}>${escHtml(a.nome)}</option>`).join('');
}

function openNuovaIscrizione() {
  editIscrizioniIdx = null;
  $('modalIscTitle').textContent = 'Nuova iscrizione';
  $('iAllievo').value = '';
  $('iAS').value = currentAnnoScolastico();
  $('iData').valueAsDate = new Date();
  setPagatoChip('No');
  $('iNote').value = '';
  $('iCosto').value = '';
  setTipoIscChip('');
  populateAbbonamentiSelect('');
  populateCorsiChipGridIscrizione([]);
  toggleIscCorsiPanel(true);
  updateIscrizioneAbbonamentoMode();
  $('iTesseraAllievo').checked = false;
  $('iTesseramentoScad').value = '';
  updateIscTesseramentoGroup(false);
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
  setPagatoChip(isPagato(r.pagato) ? 'Sì' : 'No');
  $('iDataPag').value  = isPagato(r.pagato) && r.dataPag ? (r.dataPag instanceof Date ? r.dataPag.toISOString().split('T')[0] : String(r.dataPag)) : '';
  $('iNote').value     = r.note;
  $('iCosto').value    = r.costo || '';
  setTipoIscChip(r.tipo);
  // iscrizioni storiche (pre-abbonamenti): niente `abbonamento` salvato, l'operatore
  // può assegnarlo; i corsi restano comunque quelli già registrati sull'iscrizione
  populateAbbonamentiSelect(r.abbonamento || '');
  populateCorsiChipGridIscrizione(r.corsi || []);
  toggleIscCorsiPanel(true);
  updateIscrizioneAbbonamentoMode();
  // azione "una tantum": non è un dato salvato sull'iscrizione, si riparte scollegata
  $('iTesseraAllievo').checked = false;
  $('iTesseramentoScad').value = '';
  updateIscTesseramentoGroup(false);
  $('modalIscOverlay').style.display = 'flex';
}

// Mostra/nasconde la data di scadenza legata alla checkbox "Aggiorna tesseramento"
function updateIscTesseramentoGroup(prefillIfEmpty) {
  const checked = $('iTesseraAllievo').checked;
  $('iTesseramentoScadGroup').style.display = checked ? '' : 'none';
  if (checked && prefillIfEmpty && !$('iTesseramentoScad').value) {
    $('iTesseramentoScad').value = defaultTesseramentoScad();
  }
}

// Chips Pagato Sì/No: mostra la data pagamento solo con "Sì"
function setPagatoChip(val) {
  document.querySelectorAll('#iPagatoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.pagato === val);
  });
  $('iPagato').value = val;
  $('iDataPagGroup').style.display = val === 'Sì' ? '' : 'none';
  if (val !== 'Sì') $('iDataPag').value = '';
}

function setTipoIscChip(val) {
  document.querySelectorAll('#iTipoGrid .cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tipo === val);
  });
  $('iTipo').value = val || '';
  // la prova è gratuita: niente costo, niente tracciamento pagamento
  if (val === 'Prova') {
    $('iPagatoRow').style.display = 'none';
    $('iCostoGroup').style.display = 'none';
    setPagatoChip('No');
    $('iCosto').value = 0;
  } else {
    $('iPagatoRow').style.display = '';
    $('iCostoGroup').style.display = '';
  }
  autoAggiornaCosto();
}

function autoAggiornaCosto() {
  const nomeAbbonamento = $('iAbbonamento') ? $('iAbbonamento').value : '';
  const tipo = $('iTipo') ? $('iTipo').value : '';
  if (tipo === 'Prova') { $('iCosto').value = 0; return; } // la prova è sempre gratuita
  const ab = abbonamentiData.find(a => a.nome === nomeAbbonamento);
  if (ab && ab.tipoErogazione === 'scadenza') {
    $('iCosto').value = ab.costoAbbonamento || 0;
    return;
  }
  if (nomeAbbonamento && tipo) {
    const costo = getCostoAbbonamento(nomeAbbonamento, tipo);
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
  const allievo     = $('iAllievo').value.trim();
  const as          = $('iAS').value.trim();
  const data        = $('iData').value;
  const tipo        = $('iTipo').value;
  const abbonamento = $('iAbbonamento').value;
  const abbonamentoObj = abbonamentiData.find(a => a.nome === abbonamento);
  let corsi;
  try { corsi = JSON.parse($('iCorsi').value || '[]'); } catch (e) { corsi = []; }
  const dataPag     = $('iDataPag').value;
  const pagato      = $('iPagato').value || 'No';
  const costo       = parseFloat($('iCosto').value) || 0;
  const note        = $('iNote').value.trim();

  if (!allievo)     return appAlert('Seleziona un allievo.');
  if (!abbonamento) return appAlert('Seleziona un abbonamento.');
  if (!tipo)        return appAlert('Seleziona il tipo.');
  if (!corsi.length) return appAlert('Seleziona almeno un corso.');
  if (pagato === 'Sì' && !dataPag) return appAlert('Inserisci la data di pagamento.');

  // una sola prova per allievo, indipendentemente dal corso
  if (tipo === 'Prova') {
    const altraProva = iscrizioniData.some(r => r.allievo === allievo && r.tipo === 'Prova' && r._id !== editIscrizioniIdx);
    if (altraProva) return appAlert(`"${allievo}" ha già usufruito della prova gratuita (in un altro corso o in questo).`);
  }

  // abbonamenti "a scadenza": nessun conteggio lezioni, solo la data di scadenza
  // (la prova non ha mai scadenza, indipendentemente dall'erogazione dell'abbonamento "Prova")
  const scadenza = tipo !== 'Prova' && abbonamentoObj && abbonamentoObj.tipoErogazione === 'scadenza'
    ? calcolaScadenzaIscrizione(abbonamentoObj, data) : '';

  const docData = { allievo, as, data, tipo, abbonamento, corsi, dataPag: tipo === 'Prova' ? '' : dataPag, pagato: tipo === 'Prova' ? 'No' : pagato, costo, note, scadenza };

  const aggiornaTesseramento = $('iTesseraAllievo').checked;
  const tesseramentoScad = $('iTesseramentoScad').value;

  try {
    if (editIscrizioniIdx === null) {
      const id = await fsAdd(COLL_ISCRIZIONI, docData);
      iscrizioniData.push({ _id: id, ...docData });
    } else {
      await fsUpdate(COLL_ISCRIZIONI, editIscrizioniIdx, docData);
      const r = iscrizioniData.find(r => r._id === editIscrizioniIdx);
      if (r) Object.assign(r, docData);
    }

    // aggiorna il tesseramento dell'allievo, se richiesto
    if (aggiornaTesseramento) {
      const a = allieviData.find(x => x.nomeCompleto === allievo);
      if (a) {
        try {
          await fsUpdate(COLL_ALLIEVI, a._id, { tesseramento: 'Sì', tesseramentoScad });
          a.tesseramento = 'Sì';
          a.tesseramentoScad = tesseramentoScad;
        } catch (e) {}
      }
    }

    closeIscModal(); applyIscrizioniFilters();
    refreshRiepilogoIfActive();
  } catch (e) {
    appAlert('Errore durante il salvataggio.');
  }
}

async function deleteIscrizione(id) {
  const r = iscrizioniData.find(r => r._id === id);
  if (!r) return;
  if (!await appConfirm(`Eliminare l'iscrizione di "${r.allievo}" — ${corsiDisplayText(r.corsi, 'nessun corso')} (${r.tipo})?\nL'operazione non può essere annullata.`)) return;
  try {
    await fsDelete(COLL_ISCRIZIONI, id);
    iscrizioniData = iscrizioniData.filter(r => r._id !== id);
    applyIscrizioniFilters();
    refreshRiepilogoIfActive();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
  }
}

// ── PRESENZE ─────────────────────────────────────────────
let presView        = 'calendario';
let presCalYear     = new Date().getFullYear();
let presCalMonth    = new Date().getMonth();
let presCalHideWeekend = (() => { try { return localStorage.getItem('presCalHideWeekend') === '1'; } catch (e) { return false; } })();
let editPresIdx     = null;
let presExtraAllievi= [];
let presExtraProvaOk = new Set(); // nomi extra per cui è stata creata l'iscrizione Prova

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
  // "Da/A": di default il mese corrente, come per il Calendario
  const fDa = document.getElementById('presFiltroDa');
  const fA  = document.getElementById('presFiltroA');
  if (!fDa.value && !fA.value) {
    const now = new Date();
    fDa.value = dateToYmd(new Date(now.getFullYear(), now.getMonth(), 1));
    fA.value  = dateToYmd(new Date(now.getFullYear(), now.getMonth()+1, 0));
  }

  renderPresView();
}

// Mostra il filtro "Mese" solo nel Calendario (che naviga con le frecce),
// "Da/A" nelle altre viste (elenco, tabella, per corso, per allievo).
function updatePresFiltroVisibilita() {
  const isCalendario = presView === 'calendario';
  document.getElementById('presFiltroMeseGroup').style.display  = isCalendario ? '' : 'none';
  document.getElementById('presFiltroRangeGroup').style.display = isCalendario ? 'none' : '';
  document.getElementById('presFiltroRangeGroupA').style.display = isCalendario ? 'none' : '';
}

function renderPresView() {
  const view = presView;
  const el   = document.getElementById('presView');
  if (!el) return;
  updatePresFiltroVisibilita();
  if (view === 'calendario') renderPresCalendario(el);
  else if (view === 'elenco') renderPresElenco(el);
  else if (view === 'tabella') renderPresTabella(el);
  else if (view === 'corso')  renderPresCorsо(el);
  else if (view === 'allievo') renderPresAllievo(el);
}

// Nel Calendario il periodo lo decide la navigazione a mese (frecce), non il
// filtro Da/A: renderPresCalendario applica comunque il suo anno/mese dopo
// aver preso l'elenco filtrato solo per corso.
function filteredPresenze() {
  const filtroCorso = (document.getElementById('presFiltroCorso')||{}).value || '';
  let filtered = presenzeData.filter(r => !filtroCorso || r.corso === filtroCorso);

  if (presView !== 'calendario') {
    const da = (document.getElementById('presFiltroDa')||{}).value || '';
    const a  = (document.getElementById('presFiltroA')||{}).value  || '';
    filtered = filtered.filter(r => {
      if (da && r.giorno < da) return false;
      if (a  && r.giorno > a)  return false;
      return true;
    });
  }
  return filtered;
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

  const daysInMonth = new Date(y, m+1, 0).getDate();
  const monthLabel = new Date(y, m, 1).toLocaleDateString('it-IT', {month:'long', year:'numeric'});
  const today = new Date(); today.setHours(0,0,0,0);
  const hideWeekend = presCalHideWeekend;

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

  const giorniFull = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const giorni = hideWeekend ? giorniFull.slice(0,5) : giorniFull;

  // rettangoli tutti della stessa dimensione: griglia a 7 (o 5, weekend nascosto)
  // colonne fisse, celle vuote per l'offset iniziale del mese
  let cells = '';
  let offsetDone = false;
  for (let d=1; d<=daysInMonth; d++) {
    const dt = new Date(y, m, d);
    const dow = dt.getDay(); // 0=Dom..6=Sab
    if (hideWeekend && (dow===0 || dow===6)) continue;
    if (!offsetDone) {
      const idx = hideWeekend ? dow-1 : (dow+6)%7;
      for (let i=0; i<idx; i++) cells += `<div class="pres-cal-day pres-cal-empty"></div>`;
      offsetDone = true;
    }
    const isToday = dt.getTime() === today.getTime();
    const isPast  = dt.getTime() < today.getTime();
    const records = (byDay[d] || []).sort((a,b) => (a.ora||'').localeCompare(b.ora||''));
    const pills = records.map(r => {
      const cc = getCorsoColor(r.corso);
      return `<div class="pres-cal-pill" style="background:${cc.bg};color:${cc.text};" title="${r.ora ? escHtml(r.ora)+' ' : ''}${escHtml(r.corso)}: ${escHtml(r.allievi.join(', '))}"
        onclick="event.stopPropagation();openEditPresenza('${r._id}')">
        <span class="pres-cal-pill-dot" style="background:${cc.border};"></span>
        <span class="pres-cal-pill-text">${r.ora ? `${escHtml(r.ora)} ` : ''}${escHtml(r.corso)}</span>
      </div>`;
    }).join('');
    const dayStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += `<div class="pres-cal-day${isToday?' pres-cal-today':''}${isPast?' pres-cal-past':''}${records.length?' pres-cal-has-data':''}"
      onclick="openPresDayChooser('${dayStr}')">
      <div class="pres-cal-day-num">${d}</div>
      <div class="pres-cal-dot">${pills}</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="pres-cal-nav">
      <button class="pres-cal-btn" id="calPrev">&#8249;</button>
      <div class="pres-cal-nav-title">${monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</div>
      <button class="pres-cal-btn" id="calNext">&#8250;</button>
      <button class="btn-secondary" id="calToggleWeekend" style="padding:6px 12px;font-size:11px;">${hideWeekend ? 'Mostra weekend' : 'Nascondi weekend'}</button>
    </div>
    <div class="pres-cal-grid${hideWeekend ? ' pres-cal-grid-5' : ''}">
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
  document.getElementById('calToggleWeekend').onclick = () => {
    presCalHideWeekend = !presCalHideWeekend;
    try { localStorage.setItem('presCalHideWeekend', presCalHideWeekend ? '1' : '0'); } catch (e) {}
    renderPresView();
  };
}

// ── VISTA ELENCO ──────────────────────────────────────────
function renderPresElenco(el) {
  const data = filteredPresenze().sort((a,b) => b.giorno.localeCompare(a.giorno) || (a.ora||'').localeCompare(b.ora||''));
  if (!data.length) { el.innerHTML = '<div class="table-empty">Nessuna presenza nel periodo selezionato.</div>'; return; }

  // raggruppate per giorno, ma data - ora - nome corso restano sempre sulla stessa riga
  const byGiorno = {};
  data.forEach(r => { (byGiorno[r.giorno] ||= []).push(r); });
  const giorni = Object.keys(byGiorno).sort((a,b)=>b.localeCompare(a));

  el.innerHTML = `
    <div class="table-wrap">
      ${giorni.map(giorno => `
        <div class="pres-elenco-day-group">
          <div class="pres-elenco-day-header">${fmtDate(giorno)}</div>
          ${byGiorno[giorno].map(r => {
            return `
            <div class="pres-elenco-row">
              <div class="pres-elenco-main">
                <div class="pres-elenco-date">${fmtDate(r.giorno)}${r.ora ? ` · ${r.ora}` : ''}</div>
                <div class="pres-elenco-corso">${escHtml(r.corso)}</div>
                <div class="pres-elenco-count" style="font-size:11px;color:var(--text-dim);margin-left:auto;white-space:nowrap;">${r.allievi.length} pres.</div>
                <div class="pres-elenco-actions" style="display:flex;gap:4px;">
                  <button class="btn-table" onclick="openEditPresenza('${r._id}')" title="Modifica">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="btn-table btn-del" onclick="deletePresenza('${r._id}')" title="Elimina">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </div>
              <div class="pres-elenco-allievi">
                ${r.allievi.map(a=>`<span class="pres-allievo-chip">${escHtml(a)}</span>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>`;
}

// ── VISTA TABELLA (con selezione multipla per eliminare più lezioni insieme) ──
function renderPresTabella(el) {
  const data = filteredPresenze().sort((a,b) => b.giorno.localeCompare(a.giorno) || (a.ora||'').localeCompare(b.ora||''));
  if (!data.length) { el.innerHTML = '<div class="table-empty">Nessuna presenza nel periodo selezionato.</div>'; return; }

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
      <span class="count-label">${data.length} lezioni</span>
      <div id="presTabellaBulkBar" style="display:none;align-items:center;gap:10px;">
        <span id="presTabellaSelCount" style="font-size:12px;color:var(--text-muted);"></span>
        <button class="btn-secondary btn-del" id="btnPresTabellaDeleteSel">Elimina selezionate</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="presTabellaTable" data-mobile-cols="presTabellaTable">
        <colgroup>
          <col style="width:36px"><col style="width:15%"><col style="width:10%"><col style="width:26%">
          <col style="width:10%"><col style="width:auto"><col style="width:70px">
        </colgroup>
        <thead>
          <tr>
            <th><input type="checkbox" id="presTabSelectAll"></th>
            <th>Data</th><th>Ora</th><th>Corso</th>
            <th style="text-align:center">Presenti</th><th>Note</th>
            <th style="width:70px"></th>
          </tr>
        </thead>
        <tbody id="presTabellaBody">
          ${data.map(r => {
            const cc = getCorsoColor(r.corso);
            return `<tr>
              <td><input type="checkbox" class="pres-tab-check" data-id="${r._id}"></td>
              <td style="white-space:nowrap;color:var(--text-muted);">${fmtDate(r.giorno)}</td>
              <td>${r.ora ? escHtml(r.ora) : '<span style="color:var(--text-dim)">—</span>'}</td>
              <td style="color:${cc.text};font-weight:500;">${escHtml(r.corso)}</td>
              <td style="text-align:center;">${r.allievi.length}</td>
              <td style="color:var(--text-dim);font-size:12px;">${r.note ? escHtml(r.note) : '—'}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn-table" onclick="openEditPresenza('${r._id}')" title="Modifica">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="btn-table btn-del" onclick="deletePresenza('${r._id}')" title="Elimina">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6M8 3v6M3 3l.5 7h5L9 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  initPresTabellaBulkActions();
}

// Selezione multipla nella vista Tabella: spunta tutti/singoli e cancellazione
// in blocco delle lezioni scelte (con le rispettive presenze registrate).
function initPresTabellaBulkActions() {
  const selectAll = document.getElementById('presTabSelectAll');
  const bar = document.getElementById('presTabellaBulkBar');
  const selCountEl = document.getElementById('presTabellaSelCount');
  const getChecks = () => [...document.querySelectorAll('.pres-tab-check')];

  const updateBar = () => {
    const selected = getChecks().filter(c => c.checked);
    if (selected.length > 0) {
      bar.style.display = 'flex';
      selCountEl.textContent = `${selected.length} selezionate`;
    } else {
      bar.style.display = 'none';
    }
    if (selectAll) {
      const all = getChecks();
      selectAll.checked = all.length > 0 && selected.length === all.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < all.length;
    }
  };

  selectAll?.addEventListener('change', () => {
    getChecks().forEach(c => { c.checked = selectAll.checked; });
    updateBar();
  });
  getChecks().forEach(c => c.addEventListener('change', updateBar));

  document.getElementById('btnPresTabellaDeleteSel')?.addEventListener('click', async () => {
    const ids = getChecks().filter(c => c.checked).map(c => c.dataset.id);
    if (!ids.length) return;
    if (!await appConfirm(`Eliminare ${ids.length} lezioni selezionate?\nQuesta operazione non può essere annullata.`)) return;
    try {
      await Promise.all(ids.map(id => fsDelete(COLL_PRESENZE, id)));
      presenzeData = presenzeData.filter(p => !ids.includes(p._id));
      renderPresView();
    } catch (e) {
      appAlert('Errore durante l\'eliminazione di alcune lezioni.');
    }
  });
}

// Esporta in CSV le lezioni attualmente filtrate (stesso formato dell'import,
// più allievi presenti e note, per un backup/condivisione più completo).
function exportCalendarioPresenzeCsv() {
  const data = filteredPresenze().sort((a,b) => a.giorno.localeCompare(b.giorno) || (a.ora||'').localeCompare(b.ora||''));
  if (!data.length) return appAlert('Nessuna lezione da esportare nel periodo selezionato.');
  const lines = [
    'Giorno;Ora;Corso;Presenti;Allievi;Note',
    ...data.map(r => [
      fmtDate(r.giorno), r.ora || '', `"${r.corso.replace(/"/g,'""')}"`,
      r.allievi.length, `"${r.allievi.join(', ').replace(/"/g,'""')}"`, `"${(r.note||'').replace(/"/g,'""')}"`,
    ].join(';')),
  ];
  downloadCsv('calendario_presenze.csv', lines);
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
  presExtraAllievi= []; presExtraProvaOk = new Set(); $('pExtraProvaChip')?.classList.remove('active');
  document.getElementById('modalPresTitle').textContent = 'Registra presenza';
  document.getElementById('pGiorno').value = giorno || new Date().toISOString().split('T')[0];
  document.getElementById('pNote').value   = '';
  populatePCorso(corso);
  renderPresChecklist([]);
  document.getElementById('presExtraList').innerHTML = '';
  document.getElementById('pExtraAllievo').value = '';
  populateAllieviDatalist();
  $('modalPresDelete').style.display = 'none';
  document.getElementById('modalPresOverlay').style.display = 'flex';
}

function openNuovaPresenza() {
  openPresForDay(new Date().toISOString().split('T')[0], null);
}

// ── IMPORT CALENDARIO LEZIONI (CSV giorno; ora; corso) ────
let calImpDocs = [];

// '18:00' / '18.00' / '18' → 'HH:MM'; null se non interpretabile
function normalizzaOra(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1]), min = m[2] ? parseInt(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function initCalImport() {
  const close = () => {
    $('modalCalImpOverlay').style.display = 'none';
    calImpDocs = [];
    $('calImpPreview').innerHTML = '';
  };
  $('btnImportaCalendario').addEventListener('click', async () => {
    if (!corsiData.length)    await loadCorsi();
    if (!presenzeData.length) await loadPresenze();
    $('modalCalImpOverlay').style.display = 'flex';
  });
  $('calImpClose').addEventListener('click', close);

  $('btnCalTemplate').addEventListener('click', () => {
    const corsoEsempio = corsiData[0]?.nome || 'Pilates';
    const oggi = fmtDate(new Date().toISOString().slice(0,10));
    downloadCsv('modello_calendario.csv', [
      'Giorno;Ora;Corso',
      `${oggi};18:00;${corsoEsempio}`,
      `${oggi};19:30;${corsoEsempio}`,
    ]);
  });
  $('btnCalPick').addEventListener('click', () => $('calImpFile').click());
  $('calImpFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => previewCalImp(reader.result);
    reader.readAsText(file);
    e.target.value = '';
  });
}

function previewCalImp(text) {
  const el = $('calImpPreview');
  calImpDocs = [];
  let rows;
  try { rows = parseCsvText(text); }
  catch (e) { el.innerHTML = '<div class="form-feedback error">File non leggibile.</div>'; return; }
  if (!rows.length) { el.innerHTML = '<div class="form-feedback error">File vuoto.</div>'; return; }

  if ((rows[0][0]||'').toLowerCase().includes('giorno')) rows = rows.slice(1);

  const nomiCorsi = corsiData.map(c => c.nome);
  const errors = [];
  const visti = new Set();
  rows.forEach((r, i) => {
    const nr = i + 1;
    const giorno = csvParseData(r[0]);
    const ora    = normalizzaOra(r[1]);
    const corso  = csvCanon(r[2], nomiCorsi);

    if (!giorno)       errors.push(`Riga ${nr}: giorno non valido ("${r[0]||''}")`);
    if (ora === null)  errors.push(`Riga ${nr}: ora non valida ("${r[1]||''}")`);
    if (!corso)        errors.push(`Riga ${nr}: corso "${r[2]||''}" non presente nella scheda Corsi`);
    if (!giorno || ora === null || !corso) return;

    const key = `${giorno}|${ora}|${corso}`;
    if (visti.has(key)) { errors.push(`Riga ${nr}: duplicata nel file (${fmtDate(giorno)} ${ora} ${corso})`); return; }
    visti.add(key);
    if (presenzeData.some(p => p.giorno === giorno && p.corso === corso && (p.ora||'') === ora)) {
      errors.push(`Riga ${nr}: lezione già in calendario (${fmtDate(giorno)} ${ora} ${corso})`);
      return;
    }
    calImpDocs.push({ giorno, ora, corso, allievi: [], note: '' });
  });

  el.innerHTML = `
    ${errors.length ? `<div style="font-size:12px;color:var(--red);margin-bottom:10px;max-height:140px;overflow-y:auto;">${errors.map(escHtml).join('<br>')}</div>` : ''}
    ${calImpDocs.length ? `
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table">
          <thead><tr><th>Giorno</th><th>Ora</th><th>Corso</th></tr></thead>
          <tbody>${calImpDocs.slice(0, 10).map(d => `
            <tr><td>${fmtDate(d.giorno)}</td><td>${d.ora || '—'}</td><td>${escHtml(d.corso)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${calImpDocs.length > 10 ? `<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">…e altre ${calImpDocs.length - 10} lezioni</div>` : ''}
      <div class="form-actions" style="justify-content:flex-start;margin-top:14px;">
        <button class="btn-primary" id="btnCalImport">Importa ${calImpDocs.length} lezioni${errors.length ? ' valide' : ''}</button>
        <button class="btn-secondary" id="btnCalCancel">Annulla</button>
      </div>` : '<div class="form-feedback error">Nessuna lezione valida da importare.</div>'}
  `;

  $('btnCalImport')?.addEventListener('click', importCalRows);
  $('btnCalCancel')?.addEventListener('click', () => { calImpDocs = []; el.innerHTML = ''; });
}

async function importCalRows() {
  if (!calImpDocs.length) return;
  const btn = $('btnCalImport');
  btn.disabled = true;
  btn.textContent = 'Importazione…';
  try {
    const ids = await fsAddMany(COLL_PRESENZE, calImpDocs);
    calImpDocs.forEach((d, i) => presenzeData.push({ _id: ids[i], ...d }));
    $('calImpPreview').innerHTML = `<div class="form-feedback">✓ Importate ${calImpDocs.length} lezioni. Le trovi nel calendario.</div>`;
    calImpDocs = [];
    renderPresView();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Riprova';
    $('calImpPreview').insertAdjacentHTML('beforeend', '<div class="form-feedback error">Errore durante l\'importazione.</div>');
  }
}

// Giorno con lezioni registrate → scegli quale aprire o creane una nuova
function openPresDayChooser(dayStr) {
  const records = presenzeData.filter(r => r.giorno === dayStr);
  if (!records.length) { openPresForDay(dayStr, null); return; }
  records.sort((a,b) => (a.ora||'').localeCompare(b.ora||''));
  $('presDayTitle').textContent = `Lezioni del ${fmtDate(dayStr)}`;
  $('presDayList').innerHTML = records.map(r => {
    const cc = getCorsoColor(r.corso);
    return `
    <button class="btn-secondary" style="width:100%;justify-content:flex-start;gap:10px;border-left:3px solid ${cc.border};"
      onclick="closePresDayChooser();openEditPresenza('${r._id}')">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${cc.text};">${r.ora ? `${escHtml(r.ora)} · ` : ''}${escHtml(r.corso)}</span>
      <span style="color:var(--text-dim);font-size:11px;flex-shrink:0;margin-left:auto;">${r.allievi.length} pres.</span>
    </button>`;
  }).join('') + `
    <button class="btn-secondary" style="width:100%;justify-content:flex-start;margin-top:4px;color:var(--accent);"
      onclick="closePresDayChooser();openPresForDay('${dayStr}', null)">
      + Altro corso
    </button>`;
  $('modalPresDayOverlay').style.display = 'flex';
}

function closePresDayChooser() {
  $('modalPresDayOverlay').style.display = 'none';
}

function openEditPresenza(id) {
  const r = presenzeData.find(r => r._id === id);
  if (!r) return;
  editPresIdx     = id;
  presExtraAllievi= []; presExtraProvaOk = new Set(); $('pExtraProvaChip')?.classList.remove('active');
  document.getElementById('modalPresTitle').textContent = 'Modifica presenza';
  document.getElementById('pGiorno').value = r.giorno;
  document.getElementById('pNote').value   = r.note || '';
  populatePCorso(r.corso);
  renderPresChecklist(r.allievi);
  document.getElementById('presExtraList').innerHTML = '';
  document.getElementById('pExtraAllievo').value = '';
  populateAllieviDatalist();
  $('modalPresDelete').style.display = '';
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
  const iscr = [...new Set(iscrizioniData.filter(r => iscrizioneCopreCorso(r, nomeCorso)).map(r => r.allievo))]
    .sort((a,b)=>a.localeCompare(b,'it'));
  return iscr;
}

// Tutti gli altri allievi (intera anagrafica) NON iscritti a questo corso:
// candidati mostrati nell'accordion "altri allievi" della checklist presenze,
// per registrare comunque una presenza occasionale fuori dai propri corsi.
function getAllieviCompatibiliNonIscritti(nomeCorso) {
  const giaIscritti = new Set(getAllieviForCorso(nomeCorso));
  const nomi = new Set(allieviData.map(a => a.nomeCompleto).filter(Boolean));
  // include anche eventuali allievi presenti solo nelle iscrizioni ma non
  // (ancora) in anagrafica, per coerenza con getAllieviForCorso
  iscrizioniData.forEach(r => { if (r.allievo) nomi.add(r.allievo); });
  return [...nomi]
    .filter(nome => !giaIscritti.has(nome))
    .sort((a,b)=>a.localeCompare(b,'it'));
}

// Helper: lezioni totali da tipo iscrizione
function lezioniDaTipo(tipo) {
  if (tipo === 'x1')    return 1;
  if (tipo === 'x4')    return 4;
  if (tipo === 'x8')    return 8;
  if (tipo === 'x12')   return 12;
  if (tipo === 'Prova') return 1;
  // legacy
  if (tipo === 'x5')    return 5;
  if (tipo === 'x10')   return 10;
  return 0;
}

// Nome dell'abbonamento di un'iscrizione: quello salvato, oppure (iscrizioni
// storiche pre-abbonamenti) il nome del primo corso — la migrazione crea per
// ogni vecchio corso un abbonamento "singolo" con lo stesso identico nome.
function resolveAbbonamentoNome(isc) {
  return isc.abbonamento || (isc.corsi && isc.corsi[0]) || '';
}

// Un'iscrizione "copre" un corso se quel corso è tra quelli selezionati
// all'iscrizione: le lezioni rimanenti sono condivise tra tutti i corsi
// dell'iscrizione (pool di consumo unico).
function iscrizioneCopreCorso(isc, nomeCorso) {
  return !!(isc.corsi && isc.corsi.includes(nomeCorso));
}

// Presenze consumate da una specifica iscrizione (pacchetto/prova), contate
// dalla sua data di acquisto in poi, su QUALUNQUE dei corsi selezionati
// all'iscrizione (pool di consumo condiviso). `presenzeList` è opzionale
// (default: tutte). `finoAGiornoEsclusivo`, se indicato, esclude le presenze
// da quella data in poi: serve a non far "sconfinare" nel conteggio di un
// vecchio pacchetto (es. la prova) le presenze registrate DOPO che l'allievo
// ne ha acquistato uno nuovo — altrimenti riaprendo la prova risulterebbe già
// "consumata" dalle lezioni fatte con il pacchetto successivo.
function presenzeConsumatePerIscrizione(isc, presenzeList, finoAGiornoEsclusivo) {
  const corsi = isc.corsi || [];
  return (presenzeList || presenzeData).filter(p =>
    p.allievi.includes(isc.allievo) && p.giorno >= isc.data
    && (!finoAGiornoEsclusivo || p.giorno < finoAGiornoEsclusivo)
    && corsi.includes(p.corso)
  ).length;
}

// Helper: lezioni rimanenti per allievo in un corso
// Lezioni rimanenti del pacchetto/prova PIÙ RECENTE (rispetto al giorno della
// presenza che si sta guardando, non in assoluto) di questo allievo per questo
// corso. Senza questo vincolo, riaprendo una VECCHIA presenza — es. il giorno
// della prova — comparirebbe già il pacchetto acquistato DOPO quella data,
// nascondendo la pill "Prova" su quella lezione. Non si aggregano più
// iscrizioni diverse: ognuna ha la sua data di acquisto e le presenze contano
// solo da quella data in poi FINO alla prossima iscrizione (se esiste): senza
// questo limite superiore, le lezioni fatte col pacchetto successivo
// risulterebbero consumate anche sul pacchetto/prova precedente.
function lezioniRimanentePerAllievo(nomeAllievo, nomeCorso, giornoRiferimento) {
  const candidati = iscrizioniData.filter(r => r.allievo === nomeAllievo && iscrizioneCopreCorso(r, nomeCorso));
  const applicabili = candidati.filter(r => !giornoRiferimento || r.data <= giornoRiferimento);
  if (!applicabili.length) return null;
  const isc = applicabili.reduce((latest, r) => (!latest || r.data > latest.data) ? r : latest, null);

  const totLezioni = lezioniDaTipo(isc.tipo);
  if (totLezioni === 0) return null;

  const successive = candidati.filter(r => r.data > isc.data).map(r => r.data).sort();
  const finoAGiorno = successive.length ? successive[0] : null;

  const presTot = presenzeConsumatePerIscrizione(isc, null, finoAGiorno);
  return { totLezioni, presTot, rimanenti: Math.max(0, totLezioni - presTot), soloProva: isc.tipo === 'Prova' };
}

// Badge "rimaste"/"Prova" per una riga della checklist, calcolato in tempo reale:
// se la persona è spuntata ORA (e non lo era già nel record salvato) la sua
// presenza odierna viene contata subito come consumata, e viceversa se viene
// tolta la spunta a una presenza che invece era già salvata.
function presBadgeHtml(nome, nomeCorso, isCheckedNow) {
  const giorno = document.getElementById('pGiorno')?.value || '';
  const rimInfo = lezioniRimanentePerAllievo(nome, nomeCorso, giorno);
  if (!rimInfo) return '';

  const savedRecord = editPresIdx ? presenzeData.find(r => r._id === editPresIdx) : null;
  const eraGiaSalvata = !!(savedRecord && savedRecord.corso === nomeCorso && savedRecord.allievi.includes(nome));

  if (rimInfo.soloProva) {
    // "già effettuata" conta solo le presenze salvate PRIMA di questa (o in un'altra
    // lezione): la lezione di prova stessa, finché la stai creando/modificando,
    // deve restare "Prova" — "già effettuata" comparirà dalla lezione successiva.
    const presPrecedenti = eraGiaSalvata ? rimInfo.presTot - 1 : rimInfo.presTot;
    return presPrecedenti >= rimInfo.totLezioni
      ? '<span class="pres-check-badge" style="font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(224,85,85,0.15);color:#e05555;margin-left:auto;flex-shrink:0;">Prova già effettuata</span>'
      : '<span class="pres-check-badge" style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--accent-dim);color:var(--accent);margin-left:auto;flex-shrink:0;">Prova</span>';
  }

  let presTot = rimInfo.presTot;
  if (isCheckedNow && !eraGiaSalvata) presTot += 1;
  if (!isCheckedNow && eraGiaSalvata) presTot -= 1;
  const rimanenti = Math.max(0, rimInfo.totLezioni - presTot);

  if (rimanenti === 0)
    return '<span class="pres-check-badge" style="font-size:10px;padding:1px 6px;border-radius:99px;background:rgba(224,85,85,0.15);color:#e05555;margin-left:auto;flex-shrink:0;">Lezioni terminate</span>';
  return `<span class="pres-check-badge" style="font-size:10px;color:var(--text-dim);margin-left:auto;flex-shrink:0;">${rimanenti} rim.</span>`;
}

// Badge per le righe dell'accordion "altri allievi" (non iscritti a questo
// corso): mostra il loro abbonamento più recente, se ne hanno uno, invece
// delle lezioni rimaste — qui non si applica il conteggio di questo corso.
function presExtraBadgeHtml(nome) {
  const isc = iscrizioniData.filter(r => r.allievo === nome).sort((a,b) => String(b.data).localeCompare(String(a.data)))[0];
  const nomeAb = isc ? resolveAbbonamentoNome(isc) : '';
  if (!nomeAb) return '';
  return `<span class="pres-check-badge" style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--accent-dim);color:var(--accent);margin-left:auto;flex-shrink:0;">${escHtml(nomeAb)}</span>`;
}

function togglePresAccordion() {
  const body = document.getElementById('presAccordionBody');
  const toggle = document.getElementById('presAccordionToggle');
  if (!body || !toggle) return;
  const willOpen = body.style.display === 'none';
  body.style.display = willOpen ? '' : 'none';
  toggle.classList.toggle('open', willOpen);
}

function renderPresChecklist(checked) {
  const nomeCorso = document.getElementById('pCorso').value;
  const list      = document.getElementById('presAllieviList');
  if (!nomeCorso) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Seleziona prima un corso</div>';
    updatePresConteggio();
    return;
  }

  const iscritti    = getAllieviForCorso(nomeCorso);
  const nonIscritti = getAllieviCompatibiliNonIscritti(nomeCorso);
  const checkedSet  = new Set(checked);

  if (!iscritti.length && !nonIscritti.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Nessun allievo iscritto a questo corso.</div>';
    updatePresConteggio();
    return;
  }

  const allChecked = iscritti.length > 0 && iscritti.every(n => checkedSet.has(n));
  const primaryHtml = !iscritti.length
    ? '<div style="color:var(--text-dim);font-size:12px;padding:8px;">Nessun allievo iscritto a questo corso.</div>'
    : `<label class="pres-check-item" id="presCheckAll" data-nome="__all__"
      style="border-bottom:1px solid var(--border);margin-bottom:4px;padding-bottom:8px;">
      <input type="checkbox" id="cbSelectAll" ${allChecked?'checked':''}
        onchange="toggleSelectAll(this)">
      <span class="pres-check-name" style="font-weight:600;color:var(--text);">Seleziona tutti</span>
      <span style="font-size:10px;color:var(--text-dim);">${iscritti.length} iscritti</span>
    </label>
    ${iscritti.map(nome => {
      const isCk = checkedSet.has(nome);
      return `<label class="pres-check-item${isCk?' checked':''}" data-nome="${escHtml(nome)}">
        <input type="checkbox" ${isCk?'checked':''} onchange="onPresCheck(this)">
        <span class="pres-check-name">${escHtml(nome)}</span>
        ${presBadgeHtml(nome, nomeCorso, isCk)}
      </label>`;
    }).join('')}`;

  const accordionHtml = !nonIscritti.length ? '' : `
    <div class="pres-accordion" id="presAccordionWrap">
      <button type="button" class="pres-accordion-toggle" id="presAccordionToggle" onclick="togglePresAccordion()">
        <span class="pres-accordion-chevron">&#9656;</span>
        <span>Altri allievi</span>
        <span style="color:var(--text-dim);font-weight:400;">(${nonIscritti.length})</span>
      </button>
      <div class="pres-accordion-body" id="presAccordionBody" style="display:none;">
        ${nonIscritti.map(nome => {
          const isCk = checkedSet.has(nome);
          return `<label class="pres-check-item pres-check-item-extra${isCk?' checked':''}" data-nome="${escHtml(nome)}">
            <input type="checkbox" ${isCk?'checked':''} onchange="onPresCheck(this)">
            <span class="pres-check-name">${escHtml(nome)}</span>
            ${presExtraBadgeHtml(nome)}
          </label>`;
        }).join('')}
      </div>
    </div>`;

  list.innerHTML = primaryHtml + accordionHtml;
  updatePresConteggio();
}

// Ricalcola e sostituisce il badge di una riga in base allo stato attuale della sua checkbox.
// Le righe dell'accordion (non iscritti) hanno un badge statico (l'abbonamento),
// non legato alle lezioni rimaste su QUESTO corso: non va ricalcolato.
function updatePresRowBadge(item) {
  if (!item) return;
  const nome = item.dataset.nome;
  if (!nome || nome === '__all__') return;
  if (item.classList.contains('pres-check-item-extra')) return;
  const nomeCorso = document.getElementById('pCorso').value;
  const isChecked = item.querySelector('input[type=checkbox]')?.checked || false;
  const html = presBadgeHtml(nome, nomeCorso, isChecked);
  const oldBadge = item.querySelector('.pres-check-badge');
  if (oldBadge) oldBadge.outerHTML = html;
  else if (html) item.querySelector('.pres-check-name').insertAdjacentHTML('afterend', html);
}

// "Seleziona tutti" agisce solo sugli iscritti in prima lista (figli diretti
// di #presAllieviList): non spunta anche l'accordion dei non iscritti.
function toggleSelectAll(cb) {
  document.querySelectorAll('#presAllieviList > .pres-check-item:not(#presCheckAll) input[type=checkbox]').forEach(c => {
    c.checked = cb.checked;
    const item = c.closest('.pres-check-item');
    item.classList.toggle('checked', cb.checked);
    updatePresRowBadge(item);
  });
  updatePresConteggio();
}

function onPresCheck(cb) {
  const item = cb.closest('.pres-check-item');
  if (item) item.classList.toggle('checked', cb.checked);
  const all = [...document.querySelectorAll('#presAllieviList > .pres-check-item:not(#presCheckAll) input[type=checkbox]')];
  const cbAll = document.getElementById('cbSelectAll');
  if (cbAll) cbAll.checked = all.length > 0 && all.every(c=>c.checked);
  updatePresRowBadge(item);
  updatePresConteggio();
}

function updatePresConteggio() {
  const fromList = document.querySelectorAll('#presAllieviList input[type=checkbox]:checked').length;
  const count = fromList + presExtraAllievi.length;
  const label = document.getElementById('presConteggioLabel');
  if (label) label.textContent = count > 0 ? `(${count} presenti)` : '';
}

async function addPresExtra() {
  const input = document.getElementById('pExtraAllievo');
  const val = input.value.trim();
  if (!val) return;
  const inList = [...document.querySelectorAll('#presAllieviList .pres-check-item:not(#presCheckAll)')]
    .find(el => el.dataset.nome === val);
  if (inList) {
    const cb = inList.querySelector('input[type=checkbox]');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    input.value = '';
    return;
  }
  if (presExtraAllievi.includes(val)) { input.value=''; return; }

  const chipProva = document.getElementById('pExtraProvaChip');
  const vogliaProva = chipProva.classList.contains('active');
  presExtraAllievi.push(val);
  renderExtraChips();
  input.value = '';
  chipProva.classList.remove('active');
  updatePresConteggio();

  // allievo non iscritto + chip "Prova" attiva: crea subito l'iscrizione Prova
  if (vogliaProva) await creaIscrizioneProvaDaPresenza(val);
}

// Iscrizione Prova automatica per un allievo aggiunto come extra in Registra presenza.
// Rispetta la stessa regola "una sola prova per allievo" della modale Iscrizione.
async function creaIscrizioneProvaDaPresenza(allievo) {
  const corso = document.getElementById('pCorso').value;
  if (!corso) { await appAlert(`Seleziona prima il corso per registrare la prova di "${allievo}".`); return; }

  const altraProva = iscrizioniData.some(r => r.allievo === allievo && r.tipo === 'Prova');
  if (altraProva) {
    await appAlert(`"${allievo}" ha già usufruito della prova gratuita: presenza aggiunta, ma nessuna nuova iscrizione creata.`);
    return;
  }

  const docData = {
    allievo, as: currentAnnoScolastico(),
    data: document.getElementById('pGiorno').value || new Date().toISOString().slice(0,10),
    tipo: 'Prova', abbonamento: 'Prova', corso, dataPag: '', pagato: 'No', costo: 0,
    note: 'Creata da Registra presenza',
  };
  try {
    const id = await fsAdd(COLL_ISCRIZIONI, docData);
    iscrizioniData.push({ _id: id, ...docData });
    presExtraProvaOk.add(allievo);
    renderExtraChips();
  } catch (e) {
    await appAlert(`Errore durante la creazione dell'iscrizione prova per "${allievo}".`);
  }
}

function removePresExtra(nome) {
  presExtraAllievi = presExtraAllievi.filter(n=>n!==nome);
  presExtraProvaOk.delete(nome);
  renderExtraChips();
  updatePresConteggio();
}

function renderExtraChips() {
  document.getElementById('presExtraList').innerHTML = presExtraAllievi.map(nome => {
    // pill "Prova" solo se registrata in questa sessione; "Prova già effettuata"
    // se l'allievo aveva già usufruito della prova gratuita in precedenza (su
    // qualunque corso: la prova è unica per allievo, non per corso)
    const giaEffettuata = iscrizioniData.some(r => r.allievo === nome && r.tipo === 'Prova');
    const badge = presExtraProvaOk.has(nome)
      ? ' <strong style="color:var(--accent)">· Prova</strong>'
      : giaEffettuata
        ? ' <strong style="color:#e05555">· Prova già effettuata</strong>'
        : '';
    return `<span class="pres-extra-chip">${escHtml(nome)}${badge}
      <button onclick="removePresExtra('${escHtml(nome)}')">&times;</button>
    </span>`;
  }).join('');
}

function closePresModal() {
  document.getElementById('modalPresOverlay').style.display = 'none';
  editPresIdx = null; presExtraAllievi = []; presExtraProvaOk = new Set(); $('pExtraProvaChip')?.classList.remove('active');
}

async function savePresenza() {
  const giorno = document.getElementById('pGiorno').value;
  const corso  = document.getElementById('pCorso').value;
  const note   = document.getElementById('pNote').value.trim();
  if (!giorno) return appAlert('Inserisci la data.');
  if (!corso)  return appAlert('Seleziona un corso.');

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
    appAlert('Errore durante il salvataggio.');
  }
}

async function deletePresenza(id) {
  const r = presenzeData.find(r=>r._id===id);
  if (!r) return;
  if (!await appConfirm(`Eliminare la presenza del ${fmtDate(r.giorno)} — ${r.corso}?`)) return;
  try {
    await fsDelete(COLL_PRESENZE, id);
    presenzeData = presenzeData.filter(r=>r._id!==id);
    renderPresView();
  } catch (e) {
    appAlert('Errore durante l\'eliminazione.');
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
    populateRiepilogoDatalist();
    document.getElementById('riepilogoAllievoTitolo').textContent = val;
    document.getElementById('riepilogoAllievoSub').textContent    = 'Storico iscrizioni, pagamenti e presenze.';
    renderRiepilogoAllievo(val);
  };

  btn.addEventListener('click', cerca);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') cerca(); });

  // al focus svuota il campo → il browser mostra la lista completa;
  // selezionando un nome dalla lista la ricerca parte da sola
  input.addEventListener('focus', () => { input.value = ''; });
  input.addEventListener('input', () => {
    const nomi = [...($('riepilogoAllieviList')?.options || [])].map(o => o.value);
    if (nomi.includes(input.value)) cerca();
  });
}

// Datalist riepilogo: solo allievi che hanno almeno un'iscrizione
function populateRiepilogoDatalist() {
  const dl = $('riepilogoAllieviList');
  if (!dl) return;
  const nomi = [...new Set(iscrizioniData.map(r => r.allievo).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'it'));
  dl.innerHTML = nomi.map(n => `<option value="${escHtml(n)}">`).join('');
}

// Popola datalist riepilogo quando si entra nella sezione
async function renderRiepilogoSection() {
  if (!iscrizioniData.length) await loadIscrizioni();
  populateRiepilogoDatalist();
}
// Pulsante "+" sulla card Iscrizioni del riepilogo allievo: apre la modale
// nuova iscrizione con l'allievo già precompilato.
function apriNuovaIscrizionePerAllievo(nomeCompleto) {
  populateAllieviDatalist();
  openNuovaIscrizione();
  $('iAllievo').value = nomeCompleto;
}

async function apriRiepilogoAllievo(nomeCompleto) {
  if (!iscrizioniData.length) await loadIscrizioni();
  if (!presenzeData.length)   await loadPresenze();
  if (!corsiData.length)       await loadCorsi();
  if (!allieviData.length)     await loadAllievi();

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
    // corsi "a scadenza": nessun conteggio lezioni, solo il countdown alla data salvata
    if (SCAD_TIPI_SET.has(isc.tipo)) {
      const scad = ymdToDate(isc.scadenza);
      const oggi = new Date(); oggi.setHours(0,0,0,0);
      const giorniRimanenti = scad ? Math.round((scad - oggi) / 86400000) : null;
      return { ...isc, isScadenza: true, giorniRimanenti };
    }
    const lezioniTotali   = lezioniDaTipo(isc.tipo);
    // solo le presenze dalla data di acquisto DI QUESTO pacchetto in poi,
    // altrimenti presenze di pacchetti precedenti nello stesso corso lo farebbero
    // risultare già parzialmente consumato appena creato (per gli abbonamenti
    // "mix" si contano le presenze su qualunque corso)
    const presenzeAlCorso = presenzeConsumatePerIscrizione(isc, presenze);
    const consumate       = Math.min(lezioniTotali, presenzeAlCorso);
    const rimanenti       = Math.max(0, lezioniTotali - presenzeAlCorso);
    return { ...isc, isScadenza: false, lezioniTotali, consumate, rimanenti };
  });

  // la prova è gratuita: esclusa dai conteggi di pagamento
  const iscrizioniPagabili = iscrizioni.filter(r => r.tipo !== 'Prova');
  const totPagato   = iscrizioniPagabili.filter(r => isPagato(r.pagato)).length;
  const totDaPagare = iscrizioniPagabili.length - totPagato;
  const importoTot  = iscrizioniPagabili.reduce((s, r) => s + (r.costo || 0), 0);
  const importoPag  = iscrizioniPagabili.filter(r => isPagato(r.pagato)).reduce((s, r) => s + (r.costo || 0), 0);

  const anagrafica = allieviData.find(a => a.nomeCompleto === nomeCompleto);
  const tesserato  = anagrafica ? isTesserato(anagrafica.tesseramento) : null;

  // pulsante "Modifica allievo" in alto: apre l'anagrafica di questo allievo
  const btnModifica = document.getElementById('btnRiepilogoModifica');
  if (btnModifica) {
    btnModifica.style.display = anagrafica ? '' : 'none';
    btnModifica.onclick = anagrafica ? () => openEditAllievo(anagrafica._id) : null;
  }

  // Anni e corsi per filtri presenze
  const corsiPresenze = [...new Set(presenze.map(p => p.corso).filter(Boolean))].sort();
  const anniPresenze  = [...new Set(presenze.map(p => p.giorno?.slice(0,4)).filter(Boolean))].sort().reverse();

  el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:24px;">
      <div class="kpi-card"><div class="kpi-label">Iscrizioni</div><div class="kpi-value">${iscrizioniPagabili.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pagamenti OK</div><div class="kpi-value kpi-green">${totPagato}</div></div>
      <div class="kpi-card"><div class="kpi-label">Da pagare</div><div class="kpi-value${totDaPagare > 0 ? ' kpi-red' : ''}">${totDaPagare}</div></div>
      <div class="kpi-card"><div class="kpi-label">Totale</div><div class="kpi-value">${fmt(importoTot)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Incassato</div><div class="kpi-value kpi-green">${fmt(importoPag)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Presenze</div><div class="kpi-value">${presenze.length}</div></div>
      <div class="kpi-card"${anagrafica ? ` style="cursor:pointer;" onclick="openEditAllievo('${anagrafica._id}')" title="Clicca per modificare il tesseramento"` : ''}><div class="kpi-label">Tesserato</div><div class="kpi-value ${tesserato === null ? '' : tesserato ? 'kpi-green' : 'kpi-red'}">${tesserato === null ? '—' : tesserato ? 'Sì' : 'No'}</div></div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div class="card-title" style="margin-bottom:0;">Iscrizioni e lezioni rimanenti</div>
        <button class="btn-table" onclick="apriNuovaIscrizionePerAllievo('${escHtml(nomeCompleto).replace(/'/g,"&#39;")}')" title="Nuova iscrizione">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
      </div>
      ${!riepilogo.length ? '<div class="table-empty" style="margin-top:12px;">Nessuna iscrizione.</div>' : `
      <div class="table-wrap" style="margin-top:12px;max-height:320px;overflow-y:auto;">
        <table class="data-table" id="riepIscTable" data-mobile-cols="riepIscTable">
          <thead style="position:sticky;top:0;z-index:2;background:var(--surface);">
            <tr>
              <th>A.S.</th><th>Data</th><th>Corso</th><th>Tipo</th>
              <th>Pagato</th><th style="text-align:right">Costo</th>
              <th style="text-align:center">Tot.</th>
              <th>Progresso</th>
              <th style="text-align:center">Rimaste</th>
              <th style="width:72px"></th>
            </tr>
          </thead>
          <tbody>
            ${riepilogo.map(r => {
              const pct = r.lezioniTotali > 0 ? Math.round(r.consumate / r.lezioniTotali * 100) : 0;
              const rimColor = r.rimanenti === 0 ? 'color:var(--text-dim)' : r.rimanenti <= 2 ? 'color:orange' : 'color:var(--text)';
              const isProva  = r.tipo === 'Prova';
              const pagatoOk = isPagato(r.pagato);
              return `<tr>
                <td style="color:var(--text-muted)">${escHtml(r.as)}</td>
                <td style="color:var(--text-muted)">${fmtDate(r.data)}</td>
                <td style="font-weight:500">${corsiDisplayHtml(r.corsi)}</td>
                <td><span style="background:var(--accent-dim);border:1px solid rgba(201,169,110,0.2);color:var(--accent);padding:2px 8px;border-radius:99px;font-size:11px;">${escHtml(r.tipo)}</span></td>
                <td>${isProva ? '<span style="color:var(--text-dim)">—</span>' : `
                  <span class="badge ${pagatoOk ? 'badge-green' : 'badge-red'}">${pagatoOk ? 'Sì' : 'No'}</span>
                  ${pagatoOk && r.dataPag ? `<br><span style="color:var(--text-dim);font-size:10px;">${fmtDate(r.dataPag)}</span>` : ''}
                `}</td>
                <td style="text-align:right;font-weight:600;color:${isProva ? 'var(--text-dim)' : pagatoOk ? 'var(--green)' : 'var(--red)'};font-variant-numeric:tabular-nums;">${isProva ? '—' : fmt(r.costo)}</td>
                ${r.isScadenza ? `
                <td style="text-align:center;color:var(--text-dim)">—</td>
                <td style="color:var(--text-muted);font-size:12px;">${r.scadenza ? `Scade il ${fmtDate(r.scadenza)}` : 'Scadenza non impostata'}</td>
                <td style="text-align:center;">
                  <span style="font-size:13px;font-weight:700;${r.giorniRimanenti===null?'color:var(--text-dim)':r.giorniRimanenti<0?'color:var(--red)':r.giorniRimanenti<=15?'color:orange':'color:var(--text)'}">
                    ${r.giorniRimanenti===null ? '—' : r.giorniRimanenti < 0 ? 'Scaduto' : `${r.giorniRimanenti} gg`}
                  </span>
                </td>` : `
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
                </td>`}
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
            }).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div class="card-title" style="margin-bottom:0;">Storico presenze</div>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" id="riepPresCsv" style="padding:4px 10px;font-size:11px;">CSV</button>
          <button class="btn-secondary" id="riepPresPdf" style="padding:4px 10px;font-size:11px;">PDF</button>
        </div>
      </div>
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
  const getFilteredPres = () => {
    const corso = document.getElementById('riepilogoPresCorso')?.value || '';
    const anno  = document.getElementById('riepilogoPresAnno')?.value  || '';
    return presenze.filter(p => {
      if (corso && p.corso !== corso) return false;
      if (anno  && !p.giorno?.startsWith(anno)) return false;
      return true;
    }).sort((a,b) => b.giorno.localeCompare(a.giorno));
  };
  const applyPresFilter = () => {
    const tEl = document.getElementById('riepilogoPresTable');
    if (tEl) tEl.innerHTML = buildPresenzeTable(getFilteredPres());
  };
  document.getElementById('riepilogoPresCorso')?.addEventListener('change', applyPresFilter);
  document.getElementById('riepilogoPresAnno')?.addEventListener('change', applyPresFilter);

  // Export storico presenze
  document.getElementById('riepPresCsv')?.addEventListener('click', () => {
    const rows = getFilteredPres();
    downloadCsv(`presenze_${nomeCompleto.replace(/\s+/g,'_')}.csv`, [
      'Data;Corso;Note',
      ...rows.map(p => [fmtDate(p.giorno), `"${(p.corso||'').replace(/"/g,'""')}"`, `"${(p.note||'').replace(/"/g,'""')}"`].join(';'))
    ]);
  });
  document.getElementById('riepPresPdf')?.addEventListener('click', () => {
    const rows = getFilteredPres();
    openPrintTable(
      `Storico presenze — ${nomeCompleto}`,
      `${rows.length} presenze · generato il ${fmtDate(new Date().toISOString().slice(0,10))}`,
      ['Data','Corso','Note'],
      rows.map(p => [fmtDate(p.giorno), p.corso, p.note || '—'])
    );
  });
}

function buildPresenzeTable(presenze) {
  const sorted = [...presenze].sort((a,b) => b.giorno.localeCompare(a.giorno));
  if (!sorted.length) return '<div class="table-empty" style="margin-top:0;">Nessuna presenza.</div>';
  return `
    <div class="table-wrap" style="max-height:300px;overflow-y:auto;">
      <table class="data-table" id="riepStoricoTable" data-mobile-cols="riepStoricoTable">
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

// ── REPORT PRESENZE ───────────────────────────────────────
async function renderReportPresenze() {
  if (!presenzeData.length) await loadPresenze();
  if (!corsiData.length)    await loadCorsi();
  if (!allieviData.length)  await loadAllievi();

  // popola filtro corsi (mantiene la selezione)
  const selCorso = $('repCorso');
  const curCorso = selCorso.value;
  const corsi = [...new Set(presenzeData.map(r => r.corso).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
  selCorso.innerHTML = '<option value="">Tutti</option>' + corsi.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  selCorso.value = curCorso;

  // datalist allievi: nomi presenti nelle presenze + anagrafica
  const nomi = new Set(allieviData.map(a => a.nomeCompleto));
  presenzeData.forEach(r => r.allievi.forEach(n => nomi.add(n)));
  $('repAllieviList').innerHTML = [...nomi].sort((a,b)=>a.localeCompare(b,'it'))
    .map(n => `<option value="${escHtml(n)}">`).join('');

  renderReportPresView();
}

function getReportPresFiltered() {
  const corso   = $('repCorso').value;
  const da      = $('repDa').value;
  const a       = $('repA').value;
  const allievo = $('repAllievo').value.trim().toLowerCase();
  return presenzeData.filter(r => {
    if (corso && r.corso !== corso) return false;
    if (da && r.giorno < da) return false;
    if (a  && r.giorno > a)  return false;
    if (allievo && !r.allievi.some(n => n.toLowerCase() === allievo)) return false;
    return true;
  }).sort((x,y) => y.giorno.localeCompare(x.giorno));
}

function renderReportPresView() {
  const el = $('repPresContent');
  if (!el) return;
  const rows = getReportPresFiltered();
  const filtroAllievo = $('repAllievo').value.trim();

  if (!rows.length) {
    el.innerHTML = '<div class="table-empty">Nessuna presenza per i filtri selezionati.</div>';
    return;
  }

  const totPresenze = filtroAllievo ? rows.length : rows.reduce((s,r) => s + r.allievi.length, 0);

  el.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));">
      <div class="kpi-card"><div class="kpi-label">Lezioni</div><div class="kpi-value">${rows.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">${filtroAllievo ? 'Presenze allievo' : 'Presenze totali'}</div><div class="kpi-value">${totPresenze}</div></div>
    </div>
    <div class="card" style="margin-bottom:12px;">
      <div class="card-title">Andamento presenze per corso</div>
      <div class="chart-wrap"><canvas id="chartRepPres"></canvas></div>
    </div>
    <div class="table-wrap">
      <table class="data-table" id="repPresTable" data-mobile-cols="repPresTable">
        <thead><tr>
          <th>Data</th><th>Corso</th>
          <th style="text-align:center">Presenti</th>
          <th>Allievi</th><th>Note</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td style="white-space:nowrap;">${fmtDate(r.giorno)}</td>
            <td style="font-weight:500;">${escHtml(r.corso)}</td>
            <td style="text-align:center;color:var(--text-muted);">${r.allievi.length}</td>
            <td style="font-size:12px;color:var(--text-muted);">${r.allievi.map(n =>
              filtroAllievo && n.toLowerCase() === filtroAllievo.toLowerCase()
                ? `<strong style="color:var(--accent);">${escHtml(n)}</strong>`
                : escHtml(n)).join(', ')}</td>
            <td style="font-size:12px;color:var(--text-dim);">${escHtml(r.note || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  renderReportPresChart(rows, filtroAllievo);
}

// Grafico a linee: una linea per corso. Aggrega per mese;
// se il periodo copre al massimo 2 mesi passa alla granularità giornaliera.
function renderReportPresChart(rows, filtroAllievo) {
  const canvas = $('chartRepPres');
  if (!canvas) return;

  const mesi = [...new Set(rows.map(r => r.giorno.slice(0,7)))].sort();
  const perGiorno = mesi.length <= 2;
  const chiavi = perGiorno
    ? [...new Set(rows.map(r => r.giorno))].sort()
    : mesi;
  const keyOf = (r) => perGiorno ? r.giorno : r.giorno.slice(0,7);

  const corsi = [...new Set(rows.map(r => r.corso))].sort((a,b) => a.localeCompare(b,'it'));
  const colors = donutColors();

  const datasets = corsi.map((corso, i) => {
    const col = colors[i % colors.length];
    return {
      label: corso,
      data: chiavi.map(k => rows
        .filter(r => r.corso === corso && keyOf(r) === k)
        .reduce((s, r) => s + (filtroAllievo ? 1 : r.allievi.length), 0)),
      borderColor: col,
      backgroundColor: col,
      tension: 0.35,
      pointRadius: 3,
      borderWidth: 2,
      fill: false,
      spanGaps: true,
    };
  });

  const labels = chiavi.map(k => {
    if (perGiorno) return fmtDate(k);
    const [y, m] = k.split('-');
    const s = new Date(y, m-1, 1).toLocaleDateString('it-IT', { month:'short', year:'2-digit' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  const base = chartOpts();
  base.plugins.legend = { labels: { color:'#888', font:{size:11}, boxWidth:10, padding:12 } };
  base.plugins.tooltip.callbacks = { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} presenze` };
  base.scales.y.ticks.callback = v => Number.isInteger(v) ? v : '';
  base.scales.y.beginAtZero = true;

  if (chartRepPres) chartRepPres.destroy();
  chartRepPres = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: base });
}

function reportPresPeriodoLabel() {
  const da = $('repDa').value, a = $('repA').value;
  const corso = $('repCorso').value || 'tutti i corsi';
  const allievo = $('repAllievo').value.trim();
  return [
    corso,
    da || a ? `dal ${da ? fmtDate(da) : 'inizio'} al ${a ? fmtDate(a) : 'oggi'}` : 'tutto il periodo',
    allievo ? `allievo: ${allievo}` : ''
  ].filter(Boolean).join(' · ');
}

function exportReportPresCsv() {
  const rows = getReportPresFiltered();
  if (!rows.length) return appAlert('Nessuna presenza da esportare.');
  downloadCsv('report_presenze.csv', [
    'Data;Corso;Presenti;Allievi;Note',
    ...rows.map(r => [
      fmtDate(r.giorno),
      `"${(r.corso||'').replace(/"/g,'""')}"`,
      r.allievi.length,
      `"${r.allievi.join(', ').replace(/"/g,'""')}"`,
      `"${(r.note||'').replace(/"/g,'""')}"`
    ].join(';'))
  ]);
}

function exportReportPresPdf() {
  const rows = getReportPresFiltered();
  if (!rows.length) return appAlert('Nessuna presenza da esportare.');
  openPrintTable(
    'Report presenze',
    `${reportPresPeriodoLabel()} · ${rows.length} lezioni · generato il ${fmtDate(new Date().toISOString().slice(0,10))}`,
    ['Data','Corso','Presenti','Allievi','Note'],
    rows.map(r => [fmtDate(r.giorno), r.corso, r.allievi.length, r.allievi.join(', '), r.note || '—'])
  );
}

// ── REPORT ISCRIZIONI ─────────────────────────────────────
async function renderReportIscrizioni() {
  if (!iscrizioniData.length) await loadIscrizioni();
  if (!corsiData.length)      await loadCorsi();
  if (!allieviData.length)    await loadAllievi();
  if (!presenzeData.length)   await loadPresenze();

  const selCorso = $('repIscCorso');
  const curCorso = selCorso.value;
  const corsi = [...new Set(iscrizioniData.flatMap(r => r.corsi || []))].sort((a,b)=>a.localeCompare(b,'it'));
  selCorso.innerHTML = '<option value="">Tutti</option>' + corsi.map(c=>`<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  selCorso.value = curCorso;

  const selAb = $('repIscAbbonamento');
  const curAb = selAb.value;
  const nomiAb = [...new Set(iscrizioniData.map(r => resolveAbbonamentoNome(r)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
  selAb.innerHTML = '<option value="">Tutti</option>' + nomiAb.map(n=>`<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  selAb.value = curAb;

  const selAS = $('repIscAS');
  const curAS = selAS.value;
  const anni = [...new Set(iscrizioniData.map(r => r.as).filter(Boolean))].sort().reverse();
  selAS.innerHTML = '<option value="">Tutte</option>' + anni.map(a=>`<option value="${a}">${a}</option>`).join('');
  selAS.value = curAS;

  const nomi = new Set(allieviData.map(a => a.nomeCompleto));
  iscrizioniData.forEach(r => { if (r.allievo) nomi.add(r.allievo); });
  $('repIscAllieviList').innerHTML = [...nomi].sort((a,b)=>a.localeCompare(b,'it'))
    .map(n => `<option value="${escHtml(n)}">`).join('');

  renderReportIscView();
}

function getReportIscFiltered() {
  const corso       = $('repIscCorso').value;
  const abbonamento = $('repIscAbbonamento').value;
  const as          = $('repIscAS').value;
  const da          = $('repIscDa').value;
  const a           = $('repIscA').value;
  const allievo     = $('repIscAllievo').value.trim().toLowerCase();
  const pagato      = $('repIscPagato').value;

  return iscrizioniData.filter(r => {
    if (corso && !(r.corsi || []).includes(corso)) return false;
    if (abbonamento && resolveAbbonamentoNome(r) !== abbonamento) return false;
    if (as && r.as !== as) return false;
    if (da && r.data < da) return false;
    if (a  && r.data > a)  return false;
    if (allievo && r.allievo.toLowerCase() !== allievo) return false;
    if (pagato === 'si' && !isPagato(r.pagato)) return false;
    if (pagato === 'no' &&  isPagato(r.pagato)) return false;
    return true;
  }).sort((x,y) => y.data.localeCompare(x.data));
}

// Scadenza da mostrare nel report: per gli abbonamenti "a scadenza" è quella
// già salvata sull'iscrizione; per i pacchetti (x4/x8/x12) si calcola da data
// di acquisto + giorni di validità configurati sull'abbonamento (se previsti);
// la prova non scade mai.
function calcolaScadenzaReportIscrizione(isc) {
  if (isc.tipo === 'Prova') return '';
  if (SCAD_TIPI_SET.has(isc.tipo)) return isc.scadenza || '';
  const scadKeys = { x4: 'x4Scad', x8: 'x8Scad', x12: 'x12Scad' };
  const scadKey = scadKeys[isc.tipo];
  if (!scadKey) return '';
  const ab = abbonamentiData.find(a => a.nome === resolveAbbonamentoNome(isc));
  const giorni = ab ? parseNum(ab[scadKey]) : 0;
  if (!giorni) return '';
  const d = ymdToDate(isc.data);
  if (!d) return '';
  d.setDate(d.getDate() + giorni);
  return dateToYmd(d);
}

// Righe con i dati calcolati (scadenza, lezioni fatte/rimanenti) usate sia
// dalla tabella a schermo che dagli export.
function reportIscRighe(filtered) {
  return filtered.map(isc => {
    const totLezioni = lezioniDaTipo(isc.tipo);
    const conLezioni = totLezioni > 0;
    const fatte = conLezioni ? presenzeConsumatePerIscrizione(isc) : null;
    const rimanenti = conLezioni ? Math.max(0, totLezioni - fatte) : null;
    return { ...isc, scadenzaCalc: calcolaScadenzaReportIscrizione(isc), conLezioni, fatte, rimanenti };
  });
}

const REPORT_ISC_THEAD = `<colgroup>
  <col style="width:15%"><col style="width:13%"><col style="width:12%"><col style="width:8%">
  <col style="width:9%"><col style="width:9%"><col style="width:7%"><col style="width:9%">
  <col style="width:9%"><col style="width:9%">
</colgroup><thead><tr>
  <th>Allievo</th><th>Corsi</th><th>Abbonamento</th><th>Tipo</th>
  <th>Iscrizione</th><th>Scadenza</th><th>Pagato</th><th>Data pag.</th>
  <th style="text-align:center">Fatte</th><th style="text-align:center">Rimanenti</th>
</tr></thead>`;

function reportIscRowHtml(r) {
  const dash = '<span style="color:var(--text-dim)">—</span>';
  const isProva = r.tipo === 'Prova';
  const pag = isPagato(r.pagato);
  const tc = TIPO_ISC_COLORS[r.tipo] || { bg:'rgba(255,255,255,0.05)', border:'#555', text:'#888' };
  const tStyle = `background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;`;
  const pagatoCell = isProva ? dash : `<span class="badge ${pag?'badge-green':'badge-red'}">${pag?'Sì':'No'}</span>`;
  // la prova non ha "lezioni fatte/rimanenti" (è una sola lezione): nella
  // colonna Fatte va solo se è già stata effettuata o no, Rimanenti resta vuota
  const effettuata = r.conLezioni && r.fatte > 0;
  const lezioniCells = isProva
    ? `<td style="text-align:center;"><span class="badge ${effettuata?'badge-green':'badge-red'}">${effettuata?'Sì':'No'}</span></td>
      <td style="text-align:center;">${dash}</td>`
    : `<td style="text-align:center;">${r.conLezioni ? r.fatte : dash}</td>
      <td style="text-align:center;font-weight:600;${r.conLezioni && r.rimanenti===0 ? 'color:#e05555' : ''}">${r.conLezioni ? r.rimanenti : dash}</td>`;
  return `<tr>
      <td style="font-weight:500;cursor:pointer;" onclick="apriRiepilogoAllievo('${escHtml(r.allievo).replace(/'/g,"&#39;")}')" title="Apri riepilogo">
        <span style="color:var(--accent);text-decoration:underline;text-underline-offset:3px;">${escHtml(r.allievo)}</span>
      </td>
      <td>${corsiDisplayHtml(r.corsi)}</td>
      <td style="color:var(--text-muted)">${escHtml(resolveAbbonamentoNome(r)) || dash}</td>
      <td><span style="${tStyle}">${escHtml(r.tipo)}</span></td>
      <td style="white-space:nowrap;">${fmtDate(r.data)}</td>
      <td style="white-space:nowrap;color:var(--text-muted);">${r.scadenzaCalc ? fmtDate(r.scadenzaCalc) : dash}</td>
      <td>${pagatoCell}</td>
      <td style="color:var(--text-muted)">${(!isProva && isPagato(r.pagato) && r.dataPag) ? fmtDate(r.dataPag) : dash}</td>
      ${lezioniCells}
    </tr>`;
}

function renderReportIscView() {
  const el = $('repIscContent');
  if (!el) return;
  const filtered = getReportIscFiltered();

  if (!filtered.length) {
    el.innerHTML = '<div class="table-empty">Nessuna iscrizione per i filtri selezionati.</div>';
    return;
  }

  const righe = reportIscRighe(filtered);
  const pagabili = righe.filter(r => r.tipo !== 'Prova');
  const totPagato = pagabili.filter(r => isPagato(r.pagato)).length;
  const totDaPagare = pagabili.length - totPagato;
  const importoTot = pagabili.reduce((s,r) => s + (r.costo||0), 0);
  const importoPag = pagabili.filter(r => isPagato(r.pagato)).reduce((s,r) => s + (r.costo||0), 0);

  const kpiHtml = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-label">Iscrizioni</div><div class="kpi-value">${righe.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pagate</div><div class="kpi-value kpi-green">${totPagato}</div></div>
      <div class="kpi-card"><div class="kpi-label">Da pagare</div><div class="kpi-value${totDaPagare>0?' kpi-red':''}">${totDaPagare}</div></div>
      <div class="kpi-card"><div class="kpi-label">Totale</div><div class="kpi-value">${fmt(importoTot)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Incassato</div><div class="kpi-value kpi-green">${fmt(importoPag)}</div></div>
    </div>`;

  el.innerHTML = kpiHtml + `<div id="repIscTableWrap"></div>`;
  renderReportIscTables(righe);
}

function renderReportIscTables(righe) {
  const raggruppa = $('repIscRaggruppa').value;
  const wrap = $('repIscTableWrap');
  if (!wrap) return;

  if (!raggruppa) {
    wrap.innerHTML = `<div class="table-wrap">
      <table class="data-table" id="repIscTable" data-mobile-cols="repIscTable">${REPORT_ISC_THEAD}
        <tbody>${righe.map(reportIscRowHtml).join('')}</tbody>
      </table>
    </div>`;
    return;
  }

  const tesseratoMap = {};
  allieviData.forEach(a => { tesseratoMap[a.nomeCompleto] = isTesserato(a.tesseramento); });
  const gruppi = {};
  righe.forEach(r => {
    if (raggruppa === 'corso') {
      const corsi = (r.corsi && r.corsi.length) ? r.corsi : ['__none__'];
      corsi.forEach(c => (gruppi[c] ||= []).push(r));
      return;
    }
    const key = raggruppa === 'abbonamento' ? (resolveAbbonamentoNome(r) || '__none__')
      : raggruppa === 'tipo' ? (r.tipo || '__none__')
      : raggruppa === 'tesseramento' ? (tesseratoMap[r.allievo] ? 'Tesserati' : 'Non tesserati')
      : (isPagato(r.pagato) ? 'Pagate' : 'Da pagare');
    (gruppi[key] ||= []).push(r);
  });
  const chiavi = Object.keys(gruppi).sort((a, b) => {
    if (raggruppa === 'pagato') return a === 'Pagate' ? -1 : b === 'Pagate' ? 1 : 0;
    if (raggruppa === 'tesseramento') return a === 'Tesserati' ? -1 : b === 'Tesserati' ? 1 : 0;
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return a.localeCompare(b, 'it', { numeric: true });
  });
  const etichettaNone = raggruppa === 'corso' ? 'Nessun corso' : 'Senza tipo';

  wrap.innerHTML = chiavi.map(k => `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">${k === '__none__' ? etichettaNone : escHtml(k)} <span style="color:var(--text-dim);font-weight:400;">(${gruppi[k].length})</span></div>
      <div class="table-wrap" style="margin-top:0;">
        <table class="data-table" data-mobile-cols="repIscTable">${REPORT_ISC_THEAD}
          <tbody>${gruppi[k].map(reportIscRowHtml).join('')}</tbody>
        </table>
      </div>
    </div>`).join('');
}

function reportIscPeriodoLabel() {
  const da = $('repIscDa').value, a = $('repIscA').value;
  const corso = $('repIscCorso').value || 'tutti i corsi';
  const abbonamento = $('repIscAbbonamento').value;
  const allievo = $('repIscAllievo').value.trim();
  return [
    corso,
    abbonamento ? `abbonamento: ${abbonamento}` : '',
    da || a ? `dal ${da ? fmtDate(da) : 'inizio'} al ${a ? fmtDate(a) : 'oggi'}` : 'tutto il periodo',
    allievo ? `allievo: ${allievo}` : ''
  ].filter(Boolean).join(' · ');
}

// Colonne "fatte"/"rimanenti" per gli export (CSV/PDF, senza colspan): la
// prova non ha un conteggio lezioni, solo se è già stata effettuata o no.
function reportIscLezioniTesto(r, vuoto) {
  if (r.tipo === 'Prova') {
    const effettuata = r.conLezioni && r.fatte > 0;
    return [effettuata ? 'Sì' : 'No', vuoto];
  }
  return [r.conLezioni ? r.fatte : vuoto, r.conLezioni ? r.rimanenti : vuoto];
}

function exportReportIscCsv() {
  const righe = reportIscRighe(getReportIscFiltered());
  if (!righe.length) return appAlert('Nessuna iscrizione da esportare.');
  downloadCsv('report_iscrizioni.csv', [
    'Allievo;Corsi;Abbonamento;Tipo;Data iscrizione;Data scadenza;Pagato;Data pagamento;Lezioni fatte;Lezioni rimanenti',
    ...righe.map(r => {
      const [fatteTxt, rimTxt] = reportIscLezioniTesto(r, '');
      return [
        `"${r.allievo.replace(/"/g,'""')}"`,
        `"${corsiDisplayText(r.corsi,'Nessun corso').replace(/"/g,'""')}"`,
        `"${(resolveAbbonamentoNome(r)||'').replace(/"/g,'""')}"`,
        r.tipo,
        fmtDate(r.data),
        r.scadenzaCalc ? fmtDate(r.scadenzaCalc) : '',
        r.tipo==='Prova' ? '' : (isPagato(r.pagato)?'Sì':'No'),
        (r.tipo!=='Prova' && isPagato(r.pagato) && r.dataPag) ? fmtDate(r.dataPag) : '',
        fatteTxt, rimTxt,
      ].join(';');
    })
  ]);
}

function exportReportIscPdf() {
  const righe = reportIscRighe(getReportIscFiltered());
  if (!righe.length) return appAlert('Nessuna iscrizione da esportare.');
  openPrintTable(
    'Report iscrizioni',
    `${reportIscPeriodoLabel()} · ${righe.length} iscrizioni · generato il ${fmtDate(new Date().toISOString().slice(0,10))}`,
    ['Allievo','Corsi','Abbonamento','Tipo','Iscrizione','Scadenza','Pagato','Data pag.','Fatte','Rimanenti'],
    righe.map(r => {
      const [fatteTxt, rimTxt] = reportIscLezioniTesto(r, '—');
      return [
        r.allievo, corsiDisplayText(r.corsi,'Nessun corso'), resolveAbbonamentoNome(r) || '—', r.tipo,
        fmtDate(r.data), r.scadenzaCalc ? fmtDate(r.scadenzaCalc) : '—',
        r.tipo==='Prova' ? '—' : (isPagato(r.pagato)?'Sì':'No'),
        (r.tipo!=='Prova' && isPagato(r.pagato) && r.dataPag) ? fmtDate(r.dataPag) : '—',
        fatteTxt, rimTxt,
      ];
    })
  );
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

// Scarica righe già formattate come file CSV (BOM per Excel)
function downloadCsv(filename, lines) {
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Apre una finestra di stampa (→ PDF) con una tabella semplice
function openPrintTable(titolo, sottotitolo, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) { appAlert('Popup bloccato dal browser: consenti i popup per scaricare il PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${escHtml(titolo)}</title><style>
    body { font-family: 'DM Sans', system-ui, sans-serif; color: #111; padding: 28px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p  { font-size: 12px; color: #555; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 9px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-weight: 600; }
    tr { page-break-inside: avoid; }
  </style></head><body>
    <h1>${escHtml(titolo)}</h1>
    <p>${escHtml(sottotitolo)}</p>
    <table>
      <thead><tr>${headers.map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
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

  // Gruppo per membro del personale: campo strutturato se presente (voci inserite
  // dopo l'introduzione della tendina Personale), altrimenti nome estratto dalla
  // descrizione come prima ("Lucà Rossella - compenso Gennaio" → "Lucà Rossella"),
  // per restare compatibili con le voci storiche.
  const groupMap = {};
  rows.forEach(r => {
    const key = r.personale || (r.descrizione.includes(' - ') ? r.descrizione.split(' - ')[0].trim() : r.descrizione.trim());
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(r);
  });

  const groupKeys = Object.keys(groupMap).sort();
  const copyIcon = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 10V3a1 1 0 0 1 1-1h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const csvIcon  = `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  const tables = groupKeys.map((key, idx) => {
    const title   = key;
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
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="Logo_6.png" alt="Logo" class="nota-print-logo" style="width:42px;height:42px;object-fit:contain;display:none;">
          <div>
            <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;color:var(--text)">Nota mensile</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${MESI_NOMI[curMese]} ${curAnno}</div>
          </div>
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
            <tr class="pivot-total">
              <td colspan="2" style="text-align:right;border-right:1px solid var(--border2)">TOT</td>
              <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${totCassaEnt?fmt(totCassaEnt):'—'}</td>
              <td style="text-align:right;color:var(--red);border-right:1px solid var(--border2)">${totCassaUsc?fmt(totCassaUsc):'—'}</td>
              <td style="text-align:right;color:var(--green);border-right:1px solid var(--border)">${totBancaEnt?fmt(totBancaEnt):'—'}</td>
              <td style="text-align:right;color:var(--red)">${totBancaUsc?fmt(totBancaUsc):'—'}</td>
            </tr>
          </tbody>
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
  initDialog();
  initMobileTables();
  initSortableTables();
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
    if (window.innerWidth <= 1024) {
      const open = sb.classList.toggle('open');
      $('sidebarOverlay')?.classList.toggle('show', open);
    } else {
      sb.classList.toggle('hidden');
      main.classList.toggle('full');
    }
  });
  $('sidebarOverlay')?.addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    $('sidebarOverlay').classList.remove('show');
  });

  $('btnLogout').addEventListener('click', async () => {
    sessionStorage.removeItem('danza_auth');
    await signOut(auth);
    window.location.replace('login.html');
  });

  document.querySelectorAll('.nav-item[data-section], .bnav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => showSection(item.dataset.section));
  });

  // Modal spesa
  $('modalClose').addEventListener('click', closeModal);
  $('modalCancel').addEventListener('click', closeModal);
  $('modalSave').addEventListener('click', saveEdit);
  $('mCategoria').addEventListener('input', () => updateMPersonaleGroup($('mPersonale').value));

  // Modal allievo
  $('btnNuovoAllievo').addEventListener('click', openNewAllievo);
  $('modalAllieviClose').addEventListener('click', closeAllieviModal);
  $('modalAllieviCancel').addEventListener('click', closeAllieviModal);
  $('modalAllieviSave').addEventListener('click', saveAllievo);
  $('aTesseramento').addEventListener('change', () => updateTesseramentoScadGroup(true));

  document.querySelectorAll('#aTipoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#aTipoGrid .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('aTipo').value = chip.dataset.tipo;
    });
  });

  // Azioni rapide dashboard
  $('btnDashPresenza').addEventListener('click', async () => {
    if (!corsiData.length)       await loadCorsi();
    if (!allieviData.length)     await loadAllievi();
    if (!iscrizioniData.length)  await loadIscrizioni();
    if (!presenzeData.length)    await loadPresenze();
    populateAllieviDatalist();
    openNuovaPresenza();
  });
  $('btnDashAllievo').addEventListener('click', openNewAllievo);

  // Sotto-schede Corsi / Abbonamenti
  document.querySelectorAll('#corsiSubTabSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => setCorsiSubTab(btn.dataset.subtab));
  });

  // Modal corso
  document.querySelectorAll('#corsiRaggruppaSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#corsiRaggruppaSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('corsiRaggruppa').value = btn.dataset.raggruppa;
      renderCorsiTables();
    });
  });
  $('btnNuovoCorso').addEventListener('click', openNewCorso);
  $('modalCorsoClose').addEventListener('click', closeCorsoModal);
  $('modalCorsoCancel').addEventListener('click', closeCorsoModal);
  $('modalCorsoSave').addEventListener('click', saveCorso);
  // #cAbbonamentiGrid è popolata dinamicamente all'apertura della modale
  // (populateCorsoAbbonamentiGrid), coi suoi listener già agganciati lì.

  // Modal abbonamento
  document.querySelectorAll('#abbonamentiRaggruppaSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#abbonamentiRaggruppaSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('abbonamentiRaggruppa').value = btn.dataset.raggruppa;
      renderAbbonamentiTables();
    });
  });
  $('btnNuovoAbbonamento').addEventListener('click', async () => {
    if (!corsiData.length) await loadCorsi();
    openNewAbbonamento();
  });
  $('modalAbbonamentoClose').addEventListener('click', closeAbbonamentoModal);
  $('modalAbbonamentoCancel').addEventListener('click', closeAbbonamentoModal);
  $('modalAbbonamentoSave').addEventListener('click', saveAbbonamento);
  document.querySelectorAll('#abTipoErogazioneGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => setAbbonamentoTipoErogazione(chip.dataset.erogazione));
  });
  document.querySelectorAll('#abScadTipoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => setAbbonamentoScadTipo(chip.dataset.scadtipo));
  });

  // Modal personale
  $('btnNuovoPersonale').addEventListener('click', openNewPersonale);
  $('modalPersonaleClose').addEventListener('click', closePersonaleModal);
  $('modalPersonaleCancel').addEventListener('click', closePersonaleModal);
  $('modalPersonaleSave').addEventListener('click', savePersonale);

  // Presenze
  $('btnNuovaPresenza').addEventListener('click', async () => {
    if (!corsiData.length)       await loadCorsi();
    if (!allieviData.length)     await loadAllievi();
    if (!iscrizioniData.length)  await loadIscrizioni();
    if (!presenzeData.length)    await loadPresenze();
    populateAllieviDatalist();
    openNuovaPresenza();
  });
  $('presDayClose').addEventListener('click', closePresDayChooser);

  $('modalPresClose').addEventListener('click', closePresModal);
  $('modalPresCancel').addEventListener('click', closePresModal);
  $('modalPresSave').addEventListener('click', savePresenza);
  $('modalPresDelete').addEventListener('click', async () => {
    const id = editPresIdx;
    if (!id) return;
    closePresModal();
    await deletePresenza(id);
  });
  $('btnPresAddExtra').addEventListener('click', addPresExtra);
  $('pExtraProvaChip').addEventListener('click', () => $('pExtraProvaChip').classList.toggle('active'));
  $('pExtraAllievo').addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); addPresExtra(); } });

  document.querySelectorAll('#presViewSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#presViewSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      presView = btn.dataset.view;
      renderPresView();
    });
  });

  // Raggruppamento allievi (nessuno / tipo / tesseramento)
  document.querySelectorAll('#allieviRaggruppaSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#allieviRaggruppaSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('allieviRaggruppa').value = btn.dataset.raggruppa;
      applyAllieviFilters();
    });
  });

  // Raggruppamento iscrizioni (nessuno / tipo / tesseramento)
  document.querySelectorAll('#iscrizioniRaggruppaSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#iscrizioniRaggruppaSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('iscrizioniRaggruppa').value = btn.dataset.raggruppa;
      applyIscrizioniFilters();
    });
  });

  $('presFiltroCorso').addEventListener('change', renderPresView);
  $('presFiltroMese').addEventListener('change', () => {
    const [y,m] = ($('presFiltroMese').value||'').split('-');
    if (y && m) { presCalYear = parseInt(y); presCalMonth = parseInt(m)-1; }
    renderPresView();
  });
  $('presFiltroDa').addEventListener('change', renderPresView);
  $('presFiltroA').addEventListener('change', renderPresView);
  $('btnEsportaCalendario').addEventListener('click', async () => {
    if (!presenzeData.length) await loadPresenze();
    exportCalendarioPresenzeCsv();
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
  $('filterTesseramento').addEventListener('change', applyAllieviFilters);
  $('btnClearAllieviFiltri').addEventListener('click', () => {
    ['searchAllievi','filterTipoAllievo','filterTesseramento'].forEach(id => { $(id).value = ''; });
    applyAllieviFilters();
  });

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
  $('iTesseraAllievo').addEventListener('change', () => updateIscTesseramentoGroup(true));

  document.querySelectorAll('#iTipoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#iTipoGrid .cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('iTipo').value = chip.dataset.tipo;
      autoAggiornaCosto();
    });
  });

  document.querySelectorAll('#iPagatoGrid .cat-chip').forEach(chip => {
    chip.addEventListener('click', () => setPagatoChip(chip.dataset.pagato));
  });

  $('iAbbonamento').addEventListener('change', () => updateIscrizioneAbbonamentoMode());
  $('iData').addEventListener('change', () => updateIscrizioneAbbonamentoMode());
  // chiude il pannello "Corsi" cliccando fuori (come una select nativa)
  document.addEventListener('click', (e) => {
    if (!$('iCorsiGroup')?.contains(e.target)) toggleIscCorsiPanel(true);
  });
  $('compensiAnno').addEventListener('change', renderCompensi);
  $('notaAnno').addEventListener('change', renderNotaMensile);
  $('notaMese').addEventListener('change', renderNotaMensile);

  // Report presenze
  ['repCorso','repDa','repA'].forEach(id => $(id).addEventListener('change', renderReportPresView));
  $('repAllievo').addEventListener('input', renderReportPresView);
  $('btnRepClear').addEventListener('click', () => {
    ['repCorso','repDa','repA','repAllievo'].forEach(id => { $(id).value = ''; });
    renderReportPresView();
  });
  $('btnRepCsv').addEventListener('click', exportReportPresCsv);
  $('btnRepPdf').addEventListener('click', exportReportPresPdf);

  // Report iscrizioni
  ['repIscCorso','repIscAbbonamento','repIscAS','repIscDa','repIscA','repIscPagato'].forEach(id => {
    $(id).addEventListener('change', renderReportIscView);
  });
  $('repIscAllievo').addEventListener('input', renderReportIscView);
  $('btnRepIscClear').addEventListener('click', () => {
    ['repIscCorso','repIscAbbonamento','repIscAS','repIscDa','repIscA','repIscAllievo','repIscPagato'].forEach(id => { $(id).value = ''; });
    renderReportIscView();
  });
  $('btnRepIscCsv').addEventListener('click', exportReportIscCsv);
  $('btnRepIscPdf').addEventListener('click', exportReportIscPdf);
  document.querySelectorAll('#repIscRaggruppaSwitch .pres-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#repIscRaggruppaSwitch .pres-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('repIscRaggruppa').value = btn.dataset.raggruppa;
      renderReportIscTables(reportIscRighe(getReportIscFiltered()));
    });
  });

  initElencoFilters();
  initInserimento();
  initCsvImport();
  initCalImport();
  initRiepilogoAllievo();

  showSection('dashboard');

  // Caricamento parallelo di tutte le collezioni
  try {
    await Promise.all([loadSpese(), loadAllievi(), loadCorsi(), loadIscrizioni(), loadPresenze()]);
  } catch (e) {
    if (e.code === 'permission-denied') {
      await appAlert('Account non autorizzato.');
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
  openEditCorso, deleteCorso,
  openEditAbbonamento, deleteAbbonamento,
  openEditPersonale, deletePersonale,
  openEditIscrizione, deleteIscrizione,
  openEditPresenza, deletePresenza, openPresForDay,
  openPresDayChooser, closePresDayChooser,
  apriRiepilogoAllievo, apriNuovaIscrizionePerAllievo,
  toggleSelectAll, onPresCheck, removePresExtra, togglePresAccordion,
  toggleIscCorsiPanel,
});

document.addEventListener('DOMContentLoaded', init);
