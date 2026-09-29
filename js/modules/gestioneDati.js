import { supabase }  from '../supabaseClient.js';
import { logAction }  from './auditLog.js';
import { hasRole }    from './auth.js';

const STATI      = ['In corso','Sospeso','Archiviato','Bloccato','Disattivato','Furto','Revocato'];
const PIATTAFORME= ['Piattaforma 1','Piattaforma 2','Piattaforma 3','POSIZIO','SNAPROUTE'];
const PAGE_SIZE  = 50;

// ── Stato locale ────────────────────────────────────────────
let _tab      = 'veicoli';
let _search   = '';
let _filters  = { stati:[], piattaforme:[], da:'', a:'' };
let _page     = 0;
let _total    = 0;
let _data     = [];

// ── Query Supabase ───────────────────────────────────────────
async function fetchVeicoli() {
  let q = supabase.from('veicoli')
    .select(`id, targa, ragione_sociale, numero_contratto, tipo_mezzo, marca, modello,
             stato, piattaforma, canone, data_attivazione, data_sospensione,
             clienti(ragione_sociale)`, { count: 'exact' });

  if (_search)           q = q.or(`targa.ilike.%${_search}%,ragione_sociale.ilike.%${_search}%,numero_contratto.ilike.%${_search}%`);
  if (_filters.stati.length)       q = q.in('stato', _filters.stati);
  if (_filters.piattaforme.length) q = q.in('piattaforma', _filters.piattaforme);
  if (_filters.da)       q = q.gte('data_attivazione', _filters.da);
  if (_filters.a)        q = q.lte('data_attivazione', _filters.a);

  q = q.order('targa').range(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw error;
  _total = count ?? 0;
  return data ?? [];
}

async function fetchClienti() {
  let q = supabase.from('clienti')
    .select('id, ragione_sociale, citta, provincia, partita_iva, telefono, email, indirizzo', { count: 'exact' });

  if (_search) q = q.or(`ragione_sociale.ilike.%${_search}%,partita_iva.ilike.%${_search}%,citta.ilike.%${_search}%,email.ilike.%${_search}%`);

  q = q.order('ragione_sociale').range(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error) throw error;
  _total = count ?? 0;
  return data ?? [];
}

// ── Fetch per export (tutti i record, senza paginazione) ────
async function fetchAllVeicoli() {
  let q = supabase.from('veicoli')
    .select('targa, ragione_sociale, numero_contratto, tipo_mezzo, marca, modello, stato, piattaforma, canone, data_attivazione, data_sospensione');
  if (_search)                     q = q.or(`targa.ilike.%${_search}%,ragione_sociale.ilike.%${_search}%,numero_contratto.ilike.%${_search}%`);
  if (_filters.stati.length)       q = q.in('stato', _filters.stati);
  if (_filters.piattaforme.length) q = q.in('piattaforma', _filters.piattaforme);
  if (_filters.da)                 q = q.gte('data_attivazione', _filters.da);
  if (_filters.a)                  q = q.lte('data_attivazione', _filters.a);
  const { data } = await q.order('targa').limit(10000);
  return data ?? [];
}

async function fetchAllClienti() {
  let q = supabase.from('clienti')
    .select('ragione_sociale, citta, provincia, partita_iva, telefono, email, indirizzo');
  if (_search) q = q.or(`ragione_sociale.ilike.%${_search}%,partita_iva.ilike.%${_search}%,citta.ilike.%${_search}%`);
  const { data } = await q.order('ragione_sociale').limit(10000);
  return data ?? [];
}

// ── Render principale ────────────────────────────────────────
export default {
  id: 'gestioneDati',
  title: 'Gestione Dati',
  icon: '📊',

  async render(container) {
    _tab = 'veicoli'; _search = ''; _filters = { stati:[], piattaforme:[], da:'', a:'' }; _page = 0;
    container.innerHTML = _html();
    _bindEvents(container);
    await _load(container);
  },
};

function _html() {
  return `
  <div class="page-wrap" id="gdWrap">
    <div class="page-header">
      <h1 class="page-title">📊 Gestione Dati</h1>
      <p class="page-sub">Ricerca, filtra, esporta e importa dati da Excel</p>
    </div>

    <!-- Tab switcher -->
    <div class="gd-tabs">
      <button class="gd-tab active" id="tabVeicoli" onclick="window._gdTab('veicoli')">🚛 Veicoli</button>
      <button class="gd-tab"        id="tabClienti"  onclick="window._gdTab('clienti')">🏢 Clienti</button>
    </div>

    <!-- Toolbar -->
    <div class="gd-toolbar">
      <div class="gd-search-wrap">
        <span class="gd-search-icon">🔍</span>
        <input class="gd-search" id="gdSearch" placeholder="Cerca…" oninput="window._gdSearch(this.value)">
        <button class="gd-clear-btn" id="gdClearBtn" onclick="window._gdClearSearch()" style="display:none">✕</button>
      </div>
      <button class="gd-btn-filter" onclick="window._gdToggleFilters()" id="gdFilterBtn">⚙ Filtri</button>
      <div style="flex:1"></div>
      <button class="gd-btn-export" onclick="window._gdExport()">⬇ Excel</button>
      <label class="gd-btn-import" title="Importa da Excel">
        ⬆ Importa
        <input type="file" id="gdImportFile" accept=".xlsx,.xls,.csv" onchange="window._gdImport(this)" style="display:none">
      </label>
    </div>

    <!-- Pannello filtri -->
    <div class="gd-filters" id="gdFilters" style="display:none">
      <div class="gd-filter-row" id="gdFilterVeicoli">
        <div class="gd-filter-group">
          <div class="gd-filter-label">Stato</div>
          <div class="gd-chips" id="filterStati">
            ${STATI.map(s=>`<button class="gd-chip" onclick="window._gdToggleFilter('stati','${s}',this)">${s}</button>`).join('')}
          </div>
        </div>
        <div class="gd-filter-group">
          <div class="gd-filter-label">Piattaforma</div>
          <div class="gd-chips" id="filterPiattaforme">
            ${PIATTAFORME.map(p=>`<button class="gd-chip" onclick="window._gdToggleFilter('piattaforme','${p}',this)">${p}</button>`).join('')}
          </div>
        </div>
        <div class="gd-filter-group">
          <div class="gd-filter-label">Attivazione dal</div>
          <input type="date" class="gd-date-input" id="filterDa" onchange="window._gdDate('da',this.value)">
        </div>
        <div class="gd-filter-group">
          <div class="gd-filter-label">Attivazione al</div>
          <input type="date" class="gd-date-input" id="filterA" onchange="window._gdDate('a',this.value)">
        </div>
        <button class="gd-chip-reset" onclick="window._gdResetFilters()">✕ Reset filtri</button>
      </div>
    </div>

    <!-- Contatore -->
    <div class="gd-count" id="gdCount"></div>

    <!-- Tabella -->
    <div class="gd-table-wrap">
      <table class="gd-table" id="gdTable">
        <thead id="gdThead"></thead>
        <tbody id="gdTbody"><tr><td colspan="99" style="text-align:center;padding:40px;color:var(--text3)">Caricamento…</td></tr></tbody>
      </table>
    </div>

    <!-- Paginazione -->
    <div class="gd-pagination" id="gdPagination"></div>

    <!-- Import status -->
    <div class="gd-import-msg" id="gdImportMsg" style="display:none"></div>
  </div>`;
}

// ── Binding eventi ───────────────────────────────────────────
function _bindEvents(container) {
  let searchTimer;

  window._gdTab = async (tab) => {
    _tab = tab; _page = 0;
    document.getElementById('tabVeicoli')?.classList.toggle('active', tab === 'veicoli');
    document.getElementById('tabClienti')?.classList.toggle('active', tab === 'clienti');
    const vf = document.getElementById('gdFilterVeicoli');
    if (vf) vf.style.display = tab === 'veicoli' ? '' : 'none';
    await _load(container);
  };

  window._gdSearch = (val) => {
    _search = val.trim();
    document.getElementById('gdClearBtn').style.display = _search ? 'flex' : 'none';
    _page = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => _load(container), 350);
  };

  window._gdClearSearch = () => {
    document.getElementById('gdSearch').value = '';
    _search = ''; _page = 0;
    document.getElementById('gdClearBtn').style.display = 'none';
    _load(container);
  };

  window._gdToggleFilters = () => {
    const el = document.getElementById('gdFilters');
    const btn = document.getElementById('gdFilterBtn');
    const open = el.style.display === 'none';
    el.style.display = open ? 'flex' : 'none';
    btn.classList.toggle('active', open);
  };

  window._gdToggleFilter = (key, val, btn) => {
    const arr = _filters[key];
    const idx = arr.indexOf(val);
    if (idx === -1) { arr.push(val); btn.classList.add('active'); }
    else { arr.splice(idx, 1); btn.classList.remove('active'); }
    _page = 0;
    _load(container);
  };

  window._gdDate = (key, val) => {
    _filters[key] = val; _page = 0;
    _load(container);
  };

  window._gdResetFilters = () => {
    _filters = { stati:[], piattaforme:[], da:'', a:'' };
    document.querySelectorAll('.gd-chip').forEach(c => c.classList.remove('active'));
    if (document.getElementById('filterDa')) document.getElementById('filterDa').value = '';
    if (document.getElementById('filterA'))  document.getElementById('filterA').value  = '';
    _page = 0;
    _load(container);
  };

  window._gdPage = async (p) => { _page = p; await _load(container); };

  window._gdExport = async () => {
    const btn = document.querySelector('.gd-btn-export');
    if (btn) { btn.textContent = '⏳ Export…'; btn.disabled = true; }
    try {
      const rows = _tab === 'veicoli' ? await fetchAllVeicoli() : await fetchAllClienti();
      await _exportExcel(rows, _tab);
      await logAction({ azione:'READ', modulo:'gestioneDati', record_label:`Export ${_tab} (${rows.length} righe)` });
    } catch(e) { alert('Errore export: ' + e.message); }
    finally { if (btn) { btn.textContent = '⬇ Excel'; btn.disabled = false; } }
  };

  window._gdImport = async (input) => {
    const file = input.files[0];
    if (!file) return;
    const canImport = await hasRole('admin', 'amministrazione');
    if (!canImport) { _showImportMsg('error','⛔ Solo Admin e Amministrazione possono importare dati.'); input.value = ''; return; }
    _showImportMsg('info','⏳ Lettura file in corso…');
    try {
      await _importExcel(file);
    } catch(e) {
      _showImportMsg('error', '❌ ' + e.message);
    }
    input.value = '';
  };
}

// ── Load dati + render tabella ───────────────────────────────
async function _load(container) {
  const tbody = document.getElementById('gdTbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="99" style="text-align:center;padding:40px;color:var(--text3)">Caricamento…</td></tr>`;

  try {
    _data = _tab === 'veicoli' ? await fetchVeicoli() : await fetchClienti();
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="99" style="text-align:center;padding:40px;color:#f87171">Errore: ${e.message}</td></tr>`;
    return;
  }

  _renderTable();
  _renderPagination();
  _renderCount();
}

function _renderTable() {
  const thead = document.getElementById('gdThead');
  const tbody = document.getElementById('gdTbody');
  if (!thead || !tbody) return;

  if (_tab === 'veicoli') {
    thead.innerHTML = `<tr>
      <th>Targa</th><th>Ragione Sociale</th><th>N° Contratto</th>
      <th>Tipo</th><th>Marca</th><th>Modello</th>
      <th>Stato</th><th>Piattaforma</th><th>Canone €</th>
      <th>Attivazione</th><th>Sospensione</th>
    </tr>`;
    tbody.innerHTML = _data.length ? _data.map(v => `<tr>
      <td><b style="color:var(--accent)">${v.targa||'—'}</b></td>
      <td>${v.ragione_sociale||v.clienti?.ragione_sociale||'—'}</td>
      <td>${v.numero_contratto||'—'}</td>
      <td>${v.tipo_mezzo||'—'}</td>
      <td>${v.marca||'—'}</td>
      <td>${v.modello||'—'}</td>
      <td><span class="stato-chip s-${(v.stato||'').toLowerCase().replace(/ /g,'-')}">${v.stato||'—'}</span></td>
      <td>${v.piattaforma||'—'}</td>
      <td>${v.canone != null ? Number(v.canone).toFixed(2) : '—'}</td>
      <td>${_fmt(v.data_attivazione)}</td>
      <td>${_fmt(v.data_sospensione)}</td>
    </tr>`).join('') : `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3)">Nessun risultato</td></tr>`;

  } else {
    thead.innerHTML = `<tr>
      <th>Ragione Sociale</th><th>P. IVA</th><th>Città</th>
      <th>Provincia</th><th>Telefono</th><th>Email</th><th>Indirizzo</th>
    </tr>`;
    tbody.innerHTML = _data.length ? _data.map(c => `<tr>
      <td><b>${c.ragione_sociale||'—'}</b></td>
      <td>${c.partita_iva||'—'}</td>
      <td>${c.citta||'—'}</td>
      <td>${c.provincia||'—'}</td>
      <td>${c.telefono||'—'}</td>
      <td>${c.email||'—'}</td>
      <td>${c.indirizzo||'—'}</td>
    </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Nessun risultato</td></tr>`;
  }
}

function _renderPagination() {
  const el = document.getElementById('gdPagination');
  if (!el) return;
  const pages = Math.ceil(_total / PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ''; return; }
  const items = [];
  if (_page > 0) items.push(`<button class="gd-page-btn" onclick="window._gdPage(${_page-1})">‹ Prec</button>`);
  for (let i = Math.max(0,_page-2); i <= Math.min(pages-1, _page+2); i++) {
    items.push(`<button class="gd-page-btn${i===_page?' active':''}" onclick="window._gdPage(${i})">${i+1}</button>`);
  }
  if (_page < pages-1) items.push(`<button class="gd-page-btn" onclick="window._gdPage(${_page+1})">Succ ›</button>`);
  el.innerHTML = items.join('');
}

function _renderCount() {
  const el = document.getElementById('gdCount');
  if (!el) return;
  const from = _total === 0 ? 0 : _page * PAGE_SIZE + 1;
  const to   = Math.min((_page+1)*PAGE_SIZE, _total);
  el.textContent = _total > 0 ? `${from}–${to} di ${_total} record` : 'Nessun risultato';
}

// ── Export Excel (SheetJS) ───────────────────────────────────
async function _exportExcel(rows, name) {
  const XLSX = await _loadXLSX();
  const ws   = XLSX.utils.json_to_sheet(rows);
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name === 'veicoli' ? 'Veicoli' : 'Clienti');
  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `futursat_${name}_${date}.xlsx`);
}

// ── Import Excel ─────────────────────────────────────────────
async function _importExcel(file) {
  const XLSX = await _loadXLSX();
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type:'array', cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (!rows.length) throw new Error('Il file è vuoto o il formato non è riconosciuto.');

  const cols = Object.keys(rows[0]).map(k => k.toLowerCase().trim());

  // Rileva tipo (veicoli o clienti) dal contenuto delle colonne
  const isVeicoli = cols.includes('targa') || cols.includes('numero_contratto');
  const isClienti = !isVeicoli && (cols.includes('ragione_sociale') || cols.includes('partita_iva'));

  if (!isVeicoli && !isClienti) {
    throw new Error('Formato non riconosciuto. Il file deve avere colonne "targa" (veicoli) o "ragione_sociale" (clienti).');
  }

  _showImportMsg('info', `⏳ Importazione ${rows.length} righe di ${isVeicoli ? 'veicoli' : 'clienti'}…`);

  let ok = 0, err = 0, errs = [];

  if (isVeicoli) {
    for (const row of rows) {
      const norm = _normKeys(row);
      if (!norm.targa) { err++; continue; }
      const rec = {
        targa:             String(norm.targa||'').toUpperCase().trim(),
        ragione_sociale:   norm.ragione_sociale||null,
        numero_contratto:  norm.numero_contratto||null,
        tipo_mezzo:        norm.tipo_mezzo||null,
        marca:             norm.marca||null,
        modello:           norm.modello||null,
        stato:             norm.stato||'In corso',
        piattaforma:       norm.piattaforma||null,
        canone:            norm.canone != null ? parseFloat(String(norm.canone).replace(',','.')) : null,
        data_attivazione:  _parseDate(norm.data_attivazione),
        data_sospensione:  _parseDate(norm.data_sospensione),
        note:              norm.note||null,
      };
      const { error } = await supabase.from('veicoli').upsert(rec, { onConflict:'targa' });
      if (error) { err++; errs.push(rec.targa + ': ' + error.message); } else ok++;
    }
  } else {
    for (const row of rows) {
      const norm = _normKeys(row);
      if (!norm.ragione_sociale) { err++; continue; }
      const rec = {
        ragione_sociale: String(norm.ragione_sociale).trim(),
        partita_iva:     norm.partita_iva||null,
        citta:           norm.citta||null,
        provincia:       norm.provincia||null,
        telefono:        norm.telefono||null,
        email:           norm.email||null,
        indirizzo:       norm.indirizzo||null,
      };
      const { error } = await supabase.from('clienti').upsert(rec, { onConflict:'ragione_sociale' });
      if (error) { err++; errs.push(rec.ragione_sociale + ': ' + error.message); } else ok++;
    }
  }

  await logAction({ azione:'CREATE', modulo:'gestioneDati',
    record_label:`Import ${isVeicoli?'veicoli':'clienti'}: ${ok} ok, ${err} errori` });

  if (errs.length) {
    _showImportMsg('warning', `✅ ${ok} righe importate · ⚠️ ${err} errori:\n${errs.slice(0,5).join('\n')}`);
  } else {
    _showImportMsg('success', `✅ ${ok} righe importate con successo!`);
  }

  setTimeout(() => _load(document.getElementById('gdWrap')?.closest('[id="page-content"]') || document.getElementById('page-content')), 1000);
}

// ── SheetJS loader (lazy) ────────────────────────────────────
let _xlsxCache = null;
async function _loadXLSX() {
  if (_xlsxCache) return _xlsxCache;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload  = () => { _xlsxCache = window.XLSX; resolve(window.XLSX); };
    s.onerror = () => reject(new Error('Impossibile caricare la libreria Excel'));
    document.head.appendChild(s);
  });
}

// ── Utility ──────────────────────────────────────────────────
function _fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT');
}

function _normKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase().trim().replace(/ /g,'_')] = v;
  return out;
}

function _parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  const s = String(v).trim();
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return s;
}

function _showImportMsg(type, text) {
  const el = document.getElementById('gdImportMsg');
  if (!el) return;
  el.className = `gd-import-msg ${type}`;
  el.style.display = 'block';
  el.innerHTML = text.replace(/\n/g,'<br>');
}
