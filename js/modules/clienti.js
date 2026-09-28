import { supabase }  from '../supabaseClient.js';
import { logAction }  from './auditLog.js';
import { hasRole }    from './auth.js';

// ── API ─────────────────────────────────────────────────────
export async function searchClienti(q, limit = 60) {
  const enc = encodeURIComponent(q);
  const { data, error } = await supabase
    .from('clienti')
    .select('id,ragione_sociale,citta,provincia,partita_iva,telefono')
    .ilike('ragione_sociale', `*${q}*`)
    .order('ragione_sociale')
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function loadCliente(id) {
  const { data, error } = await supabase
    .from('clienti')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadVeicoliByCliente(clienteId) {
  const { data } = await supabase
    .from('veicoli')
    .select('id,targa,numero_contratto,tipo_mezzo,marca,modello,stato,piattaforma,canone,data_attivazione,data_sospensione')
    .eq('cliente_id', clienteId)
    .order('targa');
  return data ?? [];
}

export async function saveCliente(data) {
  const isNew = !data.id;
  let result;
  if (isNew) {
    const { data: d, error } = await supabase.from('clienti').insert(data).select().maybeSingle();
    if (error) throw error;
    result = d;
  } else {
    const { id, created_at, ...rest } = data;
    const prev = await loadCliente(id);
    const { data: d, error } = await supabase.from('clienti').update(rest).eq('id', id).select().maybeSingle();
    if (error) throw error;
    result = d;
    await logAction({ azione:'UPDATE', modulo:'clienti', record_id: id, record_label: data.ragione_sociale, valori_precedenti: prev, valori_nuovi: rest });
  }
  if (isNew) await logAction({ azione:'CREATE', modulo:'clienti', record_id: result?.id, record_label: data.ragione_sociale, valori_nuovi: data });
  return result;
}

// ── Modulo pagina ───────────────────────────────────────────
export default {
  id: 'clienti',
  title: 'Clienti',
  icon: '🏢',

  async render(container) {
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">🏢 Gestione Clienti</h1>
          <p class="page-sub">Cerca un cliente per ragione sociale.</p>
        </div>

        <div class="search-bar-wrap">
          <div class="name-search-box">
            <input id="clienteSearchInput" class="search-input" placeholder="Ragione sociale…" autocomplete="off"
              oninput="window._clienteSearch()" onkeydown="if(event.key==='Enter') window._clienteSearch()">
            <button class="btn-search" onclick="window._clienteSearch()">Cerca</button>
          </div>
        </div>

        <div id="clienteResults" style="margin-top:16px"></div>
        <div id="clienteDetail" style="display:none;margin-top:24px"></div>
      </div>`;

    let _searchTimer = null;
    window._clienteSearch = async () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(async () => {
        const q = document.getElementById('clienteSearchInput')?.value?.trim();
        if (!q || q.length < 2) return;
        const res = document.getElementById('clienteResults');
        res.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:10px">Ricerca…</div>';
        try {
          const list = await searchClienti(q);
          if (!list.length) { res.innerHTML = '<div class="empty-state">Nessun cliente trovato</div>'; return; }
          res.innerHTML = list.map(c => `
            <div class="cliente-item" onclick="window._clienteOpen(${c.id})">
              <div class="cliente-item-name">${c.ragione_sociale}</div>
              <div class="cliente-item-sub">${[c.citta, c.provincia].filter(Boolean).join(', ')} · P.IVA: ${c.partita_iva || '—'}</div>
            </div>`).join('');
        } catch(e) {
          res.innerHTML = `<div style="color:var(--red);padding:10px">${e.message}</div>`;
        }
      }, 300);
    };

    window._clienteOpen = async (id) => {
      const detail = document.getElementById('clienteDetail');
      detail.style.display = 'block';
      detail.innerHTML = '<div style="color:var(--text3);padding:20px">Caricamento…</div>';
      const [c, veicoli] = await Promise.all([loadCliente(id), loadVeicoliByCliente(id)]);
      if (!c) { detail.innerHTML = '<div style="color:var(--red)">Errore caricamento cliente</div>'; return; }
      await logAction({ azione:'READ', modulo:'clienti', record_id: id, record_label: c.ragione_sociale });
      detail.innerHTML = _renderClienteDetail(c, veicoli);
    };
  },
};

function _renderClienteDetail(c, veicoli) {
  const attivi   = veicoli.filter(v => v.stato === 'In corso').length;
  const fatEst   = veicoli.filter(v => v.stato === 'In corso').reduce((s, v) => s + (v.canone || 0), 0);
  return `
    <div class="detail-card">
      <div class="detail-card-header">
        <div>
          <div class="detail-title">${c.ragione_sociale}</div>
          <div class="detail-sub">${[c.citta, c.provincia].filter(Boolean).join(', ')} · Cod. ${c.id}</div>
        </div>
        <button class="btn-primary" onclick="window._clienteEdit(${c.id})">✏️ Modifica</button>
      </div>

      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-val">${veicoli.length}</div><div class="kpi-label">Veicoli totali</div></div>
        <div class="kpi-box kpi-green"><div class="kpi-val">${attivi}</div><div class="kpi-label">Attivi</div></div>
        <div class="kpi-box kpi-blue"><div class="kpi-val">€${fatEst.toFixed(0)}</div><div class="kpi-label">Canone est. mensile</div></div>
      </div>

      <div class="tabs" id="clienteTabs">
        <button class="tab active" onclick="_ctab('anagrafica')">Anagrafica</button>
        <button class="tab" onclick="_ctab('veicoli')">Veicoli (${veicoli.length})</button>
        <button class="tab" onclick="_ctab('documenti')">Documenti</button>
      </div>

      <div id="ctab-anagrafica" class="tab-content">
        <div class="info-grid">
          ${_row('Ragione sociale', c.ragione_sociale)}
          ${_row('P.IVA', c.partita_iva)} ${_row('Cod. Fiscale', c.cod_fiscale)}
          ${_row('Indirizzo', c.indirizzo)} ${_row('CAP', c.cap)}
          ${_row('Città', c.citta)} ${_row('Provincia', c.provincia)}
          ${_row('Telefono', c.telefono)} ${_row('Fax', c.fax)}
          ${_row('Email', c.email)} ${_row('Pagamento', c.descriz_pagamento)}
          ${_row('Canale', c.canale)} ${_row('Filiale', c.filiale)}
          ${_row('Classe', c.classe)} ${_row('Gruppo', c.gruppo)}
          ${_row('Note', c.note)}
        </div>
      </div>

      <div id="ctab-veicoli" class="tab-content" style="display:none">
        ${veicoli.length ? `<table class="data-table">
          <thead><tr><th>Targa</th><th>Mezzo</th><th>Stato</th><th>Piattaforma</th><th>Canone</th><th>Attivazione</th></tr></thead>
          <tbody>${veicoli.map(v => `<tr style="cursor:pointer" onclick="navigate('veicoli');setTimeout(()=>window._targaSearch('${v.targa}'),400)">
            <td><b>${v.targa}</b></td>
            <td style="font-size:12px">${[v.marca,v.modello].filter(Boolean).join(' ') || v.tipo_mezzo || '—'}</td>
            <td>${_statoBadge(v.stato)}</td>
            <td style="font-size:12px;color:var(--text2)">${v.piattaforma || '—'}</td>
            <td style="font-size:12px">€${v.canone||0}</td>
            <td style="font-size:12px;color:var(--text2)">${v.data_attivazione || '—'}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state">Nessun veicolo associato</div>'}
      </div>

      <div id="ctab-documenti" class="tab-content" style="display:none">
        <div id="docClienteWrap">Caricamento documenti…</div>
      </div>
    </div>`;
}

window._ctab = (name) => {
  document.querySelectorAll('[id^="ctab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tabs .tab').forEach(el => el.classList.remove('active'));
  const t = document.getElementById('ctab-' + name);
  if (t) t.style.display = 'block';
  event?.target?.classList.add('active');
  if (name === 'documenti') {
    import('./documenti.js').then(m => m.renderDocsList(document.getElementById('docClienteWrap'), window._currentClienteId));
  }
};

window._clienteEdit = async (id) => {
  const c = await loadCliente(id);
  window._currentClienteId = id;
  window.showModal('Modifica Cliente', _clienteForm(c), `
    <button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button class="btn-primary" onclick="window._clienteSave(${id})">Salva</button>`);
};

window._clienteSave = async (id) => {
  const fields = ['ragione_sociale','partita_iva','cod_fiscale','indirizzo','cap','citta',
    'provincia','telefono','fax','email','note','canale','filiale','descriz_pagamento'];
  const data = { id };
  fields.forEach(f => { const el = document.getElementById('cf_'+f); if(el) data[f] = el.value || null; });
  try {
    await saveCliente(data);
    window.closeModal();
    window._clienteOpen(id);
  } catch(e) { alert('Errore: ' + e.message); }
};

function _clienteForm(c={}) {
  const fi = (id, label, val='') => `<div class="form-field">
    <label class="form-label">${label}</label>
    <input class="form-input" id="cf_${id}" value="${(c[id]||val).toString().replace(/"/g,'&quot;')}">
  </div>`;
  return `<div class="form-grid">
    ${fi('ragione_sociale','Ragione Sociale')} ${fi('partita_iva','P.IVA')}
    ${fi('cod_fiscale','Cod. Fiscale')} ${fi('indirizzo','Indirizzo')}
    ${fi('cap','CAP')} ${fi('citta','Città')}
    ${fi('provincia','Provincia')} ${fi('telefono','Telefono')}
    ${fi('fax','Fax')} ${fi('email','Email')}
    ${fi('canale','Canale')} ${fi('filiale','Filiale')}
    ${fi('descriz_pagamento','Condiz. Pagamento')}
    <div class="form-field form-full"><label class="form-label">Note</label>
      <textarea class="form-input" id="cf_note" rows="3">${c.note||''}</textarea></div>
  </div>`;
}

function _row(label, val) {
  if (!val && val !== 0) return '';
  return `<div class="info-row"><span class="info-label">${label}</span><span class="info-val">${val}</span></div>`;
}

function _statoBadge(stato) {
  const map = { 'In corso':'s-incorso','Sospeso':'s-sospeso','Archiviato':'s-archiviato',
    'Bloccato':'s-bloccato','Disattivato':'s-disattivato','Furto':'s-furto','Revocato':'s-revocato' };
  return `<span class="stato-chip ${map[stato]||''}">${stato||'—'}</span>`;
}
