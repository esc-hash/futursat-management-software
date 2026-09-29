import { supabase }  from '../supabaseClient.js';
import { logAction }  from './auditLog.js';

const STATI = ['In corso','Sospeso','Archiviato','Bloccato','Disattivato','Furto','Revocato'];
const PIATTAFORME = ['Piattaforma 1','Piattaforma 2','Piattaforma 3','POSIZIO','SNAPROUTE'];

// ── API ─────────────────────────────────────────────────────
export async function searchByTarga(targa) {
  const { data } = await supabase
    .from('veicoli').select('*')
    .ilike('targa', targa.trim())
    .maybeSingle();
  return data;
}

export async function searchByTelaio(telaio) {
  const { data } = await supabase
    .from('veicoli').select('*')
    .ilike('numero_telaio', telaio.trim())
    .maybeSingle();
  return data;
}

export async function searchTargaAC(q) {
  const { data } = await supabase
    .from('veicoli')
    .select('id,targa,ragione_sociale,stato')
    .ilike('targa', `%${q}%`)
    .order('targa').limit(10);
  return data ?? [];
}

export async function searchTelaioAC(q) {
  const { data } = await supabase
    .from('veicoli')
    .select('id,numero_telaio,targa,ragione_sociale')
    .ilike('numero_telaio', `%${q}%`)
    .not('numero_telaio', 'is', null)
    .order('numero_telaio').limit(10);
  return data ?? [];
}

function _hl(text, q) {
  if (!text || !q) return text || '';
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return String(text).replace(re, '<span style="color:#ef4444;font-weight:800">$1</span>');
}

export async function saveVeicolo(data) {
  const { id, created_at, ...rest } = data;
  let result;
  if (!id) {
    const { data: d, error } = await supabase.from('veicoli').insert(rest).select().maybeSingle();
    if (error) throw error;
    await logAction({ azione:'CREATE', modulo:'veicoli', record_id:d?.id, record_label:rest.targa, valori_nuovi:rest });
    result = d;
  } else {
    const prev = await searchByTarga(rest.targa);
    const { data: d, error } = await supabase.from('veicoli').update(rest).eq('id', id).select().maybeSingle();
    if (error) throw error;
    await logAction({ azione:'UPDATE', modulo:'veicoli', record_id:id, record_label:rest.targa, valori_precedenti:prev, valori_nuovi:rest });
    result = d;
  }
  return result;
}

// ── Modulo pagina ───────────────────────────────────────────
export default {
  id: 'veicoli',
  title: 'Ricerca Targa',
  icon: '🚛',

  async render(container) {
    container.innerHTML = `
      <div class="page-wrap search-page">
        <div class="page-header" style="text-align:center">
          <h1 class="page-title">🚛 Ricerca Veicolo</h1>
          <p class="page-sub">Cerca per targa o numero di telaio.</p>
        </div>

        <!-- Tab switcher -->
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
          <button class="vsearch-tab active" id="tabTarga"  onclick="window._vSwitchTab('targa')">🔢 Targa</button>
          <button class="vsearch-tab"        id="tabTelaio" onclick="window._vSwitchTab('telaio')">🔩 Telaio</button>
        </div>

        <!-- Targa -->
        <div id="panelTarga" style="max-width:380px;margin:0 auto 24px">
          <div class="plate-input-wrap" id="targaACWrap">
            <div class="plate-input-box">
              <input id="targaInput" placeholder="ES. AA123BB" maxlength="10"
                oninput="window._targaAC()" onkeydown="if(event.key==='Enter')window._targaSearch()">
            </div>
            <div class="ac-dropdown" id="targaAC"></div>
          </div>
          <button class="btn-search-round" onclick="window._targaSearch()">🔍</button>
          <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:6px">Premi Invio o clicca 🔍</div>
        </div>

        <!-- Telaio -->
        <div id="panelTelaio" style="display:none;max-width:420px;margin:0 auto 24px">
          <div class="plate-input-wrap" id="telaioACWrap">
            <div class="plate-input-box" style="border-radius:12px">
              <input id="telaioInput" placeholder="Es. ZFA19900003219141" maxlength="40"
                style="text-transform:uppercase;letter-spacing:1px"
                oninput="window._telaioAC()" onkeydown="if(event.key==='Enter')window._telaioSearch()">
            </div>
            <div class="ac-dropdown" id="telaioAC"></div>
          </div>
          <button class="btn-search-round" onclick="window._telaioSearch()">🔍</button>
          <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:6px">Premi Invio o clicca 🔍</div>
        </div>

        <div id="targaResult" style="max-width:760px;margin:0 auto"></div>
      </div>`;

    let _acTimer = null;

    // ── Tab switch ──────────────────────────────────────
    window._vSwitchTab = (tab) => {
      document.getElementById('tabTarga') .classList.toggle('active', tab === 'targa');
      document.getElementById('tabTelaio').classList.toggle('active', tab === 'telaio');
      document.getElementById('panelTarga') .style.display = tab === 'targa'  ? '' : 'none';
      document.getElementById('panelTelaio').style.display = tab === 'telaio' ? '' : 'none';
      document.getElementById('targaResult').innerHTML = '';
      document.getElementById('targaAC').innerHTML  = '';
      document.getElementById('telaioAC').innerHTML = '';
    };

    // ── Autocomplete Targa ──────────────────────────────
    window._targaAC = () => {
      clearTimeout(_acTimer);
      const q = document.getElementById('targaInput')?.value?.trim().toUpperCase();
      if (!q || q.length < 2) { document.getElementById('targaAC').innerHTML = ''; return; }
      _acTimer = setTimeout(async () => {
        const list = await searchTargaAC(q);
        const dd = document.getElementById('targaAC');
        if (!list.length) { dd.innerHTML = ''; return; }
        dd.innerHTML = list.map(v => `
          <div class="ac-item" onclick="window._targaSearch('${v.targa}')">
            <b>${_hl(v.targa, q)}</b>
            <span style="color:var(--text2);font-size:12px"> — ${v.ragione_sociale || '—'}</span>
          </div>`).join('');
      }, 220);
    };

    window._targaSearch = async (targa) => {
      const val = (targa || document.getElementById('targaInput')?.value || '').trim().toUpperCase();
      if (!val) return;
      if (document.getElementById('targaInput')) document.getElementById('targaInput').value = val;
      document.getElementById('targaAC').innerHTML = '';
      _doShowVeicolo(() => searchByTarga(val), `targa <b>${val}</b>`);
    };

    // ── Autocomplete Telaio ─────────────────────────────
    window._telaioAC = () => {
      clearTimeout(_acTimer);
      const q = document.getElementById('telaioInput')?.value?.trim().toUpperCase();
      if (!q || q.length < 3) { document.getElementById('telaioAC').innerHTML = ''; return; }
      _acTimer = setTimeout(async () => {
        const list = await searchTelaioAC(q);
        const dd = document.getElementById('telaioAC');
        if (!list.length) { dd.innerHTML = ''; return; }
        dd.innerHTML = list.map(v => `
          <div class="ac-item" onclick="window._telaioSearch('${v.numero_telaio}')">
            <b>${_hl(v.numero_telaio, q)}</b>
            <span style="color:var(--text2);font-size:12px"> — ${v.targa || '—'} · ${v.ragione_sociale || '—'}</span>
          </div>`).join('');
      }, 220);
    };

    window._telaioSearch = async (telaio) => {
      const val = (telaio || document.getElementById('telaioInput')?.value || '').trim().toUpperCase();
      if (!val) return;
      if (document.getElementById('telaioInput')) document.getElementById('telaioInput').value = val;
      document.getElementById('telaioAC').innerHTML = '';
      _doShowVeicolo(() => searchByTelaio(val), `telaio <b>${val}</b>`);
    };

    async function _doShowVeicolo(fetchFn, label) {
      const res = document.getElementById('targaResult');
      res.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Ricerca in corso…</div>';
      try {
        const v = await fetchFn();
        if (!v) { res.innerHTML = `<div class="empty-state">Nessun veicolo trovato con ${label}</div>`; return; }

        // Carica proprietario + tutti i suoi veicoli in parallelo
        const ragSoc = v.ragione_sociale;
        const [clienteRes, altriVeicoliRes] = await Promise.all([
          v.cliente_id
            ? supabase.from('clienti').select('*').eq('id', v.cliente_id).maybeSingle()
            : supabase.from('clienti').select('*').ilike('ragione_sociale', ragSoc || '').maybeSingle(),
          ragSoc
            ? supabase.from('veicoli')
                .select('id,targa,tipo_mezzo,marca,modello,stato,piattaforma,canone,data_attivazione,data_sospensione,numero_contratto')
                .ilike('ragione_sociale', ragSoc)
                .order('targa')
            : Promise.resolve({ data: [] }),
        ]);

        const cliente     = clienteRes?.data ?? null;
        const tuttiVeicoli = altriVeicoliRes?.data ?? [];

        await logAction({ azione:'READ', modulo:'veicoli', record_id:v.id, record_label:v.targa });
        res.innerHTML = _renderVehicleDetail(v, cliente, tuttiVeicoli);
      } catch(e) {
        res.innerHTML = `<div style="color:var(--red);padding:20px">${e.message}</div>`;
      }
    }
  },
};

function _renderVehicleDetail(v, cliente, tuttiVeicoli = []) {
  const stMap = { 'In corso':'s-incorso','Sospeso':'s-sospeso','Archiviato':'s-archiviato',
    'Bloccato':'s-bloccato','Disattivato':'s-disattivato','Furto':'s-furto','Revocato':'s-revocato' };

  const attivi    = tuttiVeicoli.filter(x => x.stato === 'In corso').length;
  const canTotale = tuttiVeicoli.filter(x => x.stato === 'In corso').reduce((s,x) => s+(x.canone||0), 0);
  const altriVeicoli = tuttiVeicoli.filter(x => x.id !== v.id);

  return `
    <div class="detail-card">

      <!-- ── Header ──────────────────────────────────────────── -->
      <div class="detail-card-header">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div class="plate-badge">${v.targa}</div>
          ${v.stato     ? `<span class="stato-chip ${stMap[v.stato]||''}">${v.stato}</span>` : ''}
          ${v.piattaforma ? `<span class="plat-badge">${v.piattaforma}</span>` : ''}
          ${v.tipo_mezzo  ? `<span style="font-size:12px;color:var(--text2);background:rgba(255,255,255,.06);padding:4px 10px;border-radius:6px;border:1px solid var(--border)">${v.tipo_mezzo}</span>` : ''}
        </div>
        <button class="btn-primary" onclick="window._veicoloEdit(${v.id})">✏️ Modifica</button>
      </div>

      <!-- ── KPI ─────────────────────────────────────────────── -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-val">${[v.marca,v.modello].filter(Boolean).join(' ') || '—'}</div>
          <div class="kpi-label">Veicolo</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-val">${v.colore || '—'}</div>
          <div class="kpi-label">Colore</div>
        </div>
        <div class="kpi-box kpi-blue">
          <div class="kpi-val">€ ${v.canone != null ? Number(v.canone).toFixed(2) : '—'}</div>
          <div class="kpi-label">Canone mensile</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-val">${tuttiVeicoli.length}</div>
          <div class="kpi-label">Targhe proprietario</div>
        </div>
        <div class="kpi-box kpi-green">
          <div class="kpi-val">${attivi}</div>
          <div class="kpi-label">Attive</div>
        </div>
        ${canTotale > 0 ? `<div class="kpi-box kpi-blue">
          <div class="kpi-val">€ ${canTotale.toFixed(2)}</div>
          <div class="kpi-label">Canone totale proprietario</div>
        </div>` : ''}
      </div>

      <!-- ── Griglia info ────────────────────────────────────── -->
      <div class="info-grid-2col">

        <!-- PROPRIETARIO DEL MEZZO -->
        <div>
          <div class="section-label">👤 PROPRIETARIO DEL MEZZO</div>
          ${_row('Ragione Sociale', cliente?.ragione_sociale || v.ragione_sociale)}
          ${_row('Partita IVA',     cliente?.partita_iva)}
          ${_row('Indirizzo',       cliente?.indirizzo)}
          ${_row('Città',           cliente?.citta)}
          ${_row('Provincia',       cliente?.provincia)}
          ${_row('Telefono',        cliente?.telefono || v.telefono_ufficio)}
          ${_row('Cellulare',       v.cellulare)}
          ${_row('Email',           cliente?.email || v.email)}
          ${!cliente ? `<div class="info-row"><span class="info-label" style="color:var(--text3);font-style:italic">Nessun cliente collegato in anagrafica</span></div>` : ''}
        </div>

        <!-- DATI VEICOLO -->
        <div>
          <div class="section-label">🚛 DATI VEICOLO</div>
          ${_row('Tipo Mezzo',   v.tipo_mezzo)}
          ${_row('Marca',        v.marca)}
          ${_row('Modello',      v.modello)}
          ${_row('Colore',       v.colore)}
          ${_row('N° Telaio',    v.numero_telaio)}
          ${_row('Targa',        v.targa)}
        </div>

        <!-- CONTRATTO GPS -->
        <div>
          <div class="section-label">📄 CONTRATTO GPS</div>
          ${_row('N° Contratto',  v.numero_contratto)}
          ${_row('Articolo',      v.articolo)}
          ${_row('Canone',        v.canone != null ? '€ '+Number(v.canone).toFixed(2) : null)}
          ${_row('Attivazione',   _fmtDate(v.data_attivazione))}
          ${_row('Sospensione',   _fmtDate(v.data_sospensione))}
          ${_row('Termine',       _fmtDate(v.data_termine))}
          ${_row('Stato',         v.stato)}
          ${_row('Piattaforma',   v.piattaforma)}
          ${_row('Note',          v.note)}
        </div>

        <!-- DISPOSITIVO GPS -->
        <div>
          <div class="section-label">📡 DISPOSITIVO GPS</div>
          ${_row('Seriale GPS',      v.seriale_periferica)}
          ${_row('Modello periferica', v.modello_periferica)}
          ${_row('Produttore',       v.produttore_periferica)}
          ${_row('Installatore',     v.installatore)}
          ${_row('Data installaz.',  _fmtDate(v.data_installazione))}
          ${_row('SIM Voce',         v.sim_voce)}
          ${_row('SIM Dati',         v.sim_dati)}
        </div>

      </div>

      <!-- ── Tutti i veicoli del proprietario ────────────────── -->
      ${tuttiVeicoli.length > 0 ? `
      <div style="margin-top:24px">
        <div class="section-label" style="margin-bottom:12px">
          🚗 TUTTI I VEICOLI DI "${(cliente?.ragione_sociale || v.ragione_sociale || '').toUpperCase()}"
          <span style="font-size:11px;font-weight:400;color:var(--text3);margin-left:8px">${tuttiVeicoli.length} targ${tuttiVeicoli.length===1?'a':'he'} · ${attivi} attiv${attivi===1?'a':'e'}</span>
        </div>
        <div class="vlist-grid">
          ${tuttiVeicoli.map(x => `
            <div class="vlist-card ${x.id === v.id ? 'vlist-card-current' : ''}" onclick="${x.id !== v.id ? `window._targaSearch('${x.targa}')` : ''}">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <div class="plate-badge" style="font-size:13px;padding:4px 10px">${x.targa}</div>
                <span class="stato-chip ${stMap[x.stato]||''}" style="font-size:11px">${x.stato||'—'}</span>
                ${x.id === v.id ? '<span style="font-size:10px;color:var(--accent);font-weight:700">← QUESTO</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:6px">
                ${[x.marca,x.modello].filter(Boolean).join(' ') || '—'}
                ${x.piattaforma ? ` · ${x.piattaforma}` : ''}
                ${x.canone != null ? ` · <b style="color:var(--accent)">€${Number(x.canone).toFixed(0)}</b>` : ''}
              </div>
              ${x.numero_contratto ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">Contr. ${x.numero_contratto}</div>` : ''}
              ${x.data_attivazione ? `<div style="font-size:11px;color:var(--text3)">Att. ${_fmtDate(x.data_attivazione)}</div>` : ''}
            </div>`).join('')}
        </div>
      </div>` : ''}

    </div>`;
}

function _fmtDate(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('it-IT'); } catch { return d; }
}

window._veicoloEdit = async (id) => {
  const { data: v } = await supabase.from('veicoli').select('*').eq('id',id).maybeSingle();
  if (!v) return;
  window.showModal('Modifica Veicolo — ' + v.targa, _veicoloForm(v), `
    <button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button class="btn-primary" onclick="window._veicoloSave(${id})">Salva</button>`);
};

window._veicoloSave = async (id) => {
  const fields = ['targa','ragione_sociale','numero_contratto','tipo_mezzo','marca','modello','colore',
    'canone','stato','piattaforma','data_attivazione','data_sospensione','seriale_periferica',
    'modello_periferica','produttore_periferica','installatore','email','cellulare','telefono_ufficio','numero_telaio'];
  const data = { id };
  fields.forEach(f => { const el = document.getElementById('vf_'+f); if(el) data[f] = el.value || null; });
  try {
    await saveVeicolo(data);
    window.closeModal();
    window._targaSearch(data.targa);
  } catch(e) { alert('Errore: ' + e.message); }
};

function _veicoloForm(v={}) {
  const fi = (id, label, val, type='text') => `<div class="form-field">
    <label class="form-label">${label}</label>
    <input class="form-input" id="vf_${id}" type="${type}" value="${(v[id]||val||'').toString().replace(/"/g,'&quot;')}">
  </div>`;
  const sel = (id, label, opts) => `<div class="form-field">
    <label class="form-label">${label}</label>
    <select class="form-select" id="vf_${id}">
      <option value="">—</option>
      ${opts.map(o => `<option value="${o}" ${v[id]===o?'selected':''}>${o}</option>`).join('')}
    </select></div>`;
  return `<div class="form-grid">
    ${fi('targa','Targa')} ${fi('ragione_sociale','Ragione Sociale')}
    ${fi('numero_contratto','N° Contratto')} ${fi('tipo_mezzo','Tipo Mezzo')}
    ${fi('marca','Marca')} ${fi('modello','Modello')}
    ${fi('colore','Colore')} ${fi('canone','Canone','','number')}
    ${sel('stato','Stato', STATI)}
    ${sel('piattaforma','Piattaforma', PIATTAFORME)}
    ${fi('data_attivazione','Data Attivazione','','date')}
    ${fi('data_sospensione','Data Sospensione','','date')}
    ${fi('seriale_periferica','Seriale GPS')} ${fi('modello_periferica','Modello Periferica')}
    ${fi('produttore_periferica','Produttore')} ${fi('installatore','Installatore')}
    ${fi('email','Email')} ${fi('cellulare','Cellulare')}
    ${fi('telefono_ufficio','Tel. Ufficio')} ${fi('numero_telaio','N° Telaio')}
  </div>`;
}

function _row(label, val) {
  if (!val && val !== 0) return '';
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-val">${val}</span></div>`;
}
