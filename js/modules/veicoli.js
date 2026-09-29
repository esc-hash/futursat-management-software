import { supabase }  from '../supabaseClient.js';
import { logAction }  from './auditLog.js';

const STATI = ['In corso','Sospeso','Archiviato','Bloccato','Disattivato','Furto','Revocato'];
const PIATTAFORME = ['Piattaforma 1','Piattaforma 2','Piattaforma 3','POSIZIO','SNAPROUTE'];

// ── API ─────────────────────────────────────────────────────
export async function searchByTarga(targa) {
  const { data } = await supabase
    .from('veicoli')
    .select('*')
    .ilike('targa', targa.trim())
    .maybeSingle();
  return data;
}

export async function searchTargaAC(q) {
  const { data } = await supabase
    .from('veicoli')
    .select('id,targa,ragione_sociale,stato')
    .ilike('targa', `%${q}%`)
    .order('targa')
    .limit(10);
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
          <h1 class="page-title">🚛 Ricerca per Targa</h1>
          <p class="page-sub">Inserisci la targa per trovare il veicolo e il contratto GPS.</p>
        </div>

        <div style="max-width:380px;margin:0 auto 24px">
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

        <div id="targaResult" style="max-width:760px;margin:0 auto"></div>
      </div>`;

    let _acTimer = null;

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
      const res = document.getElementById('targaResult');
      res.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Ricerca in corso…</div>';
      try {
        const v = await searchByTarga(val);
        if (!v) { res.innerHTML = `<div class="empty-state">Nessun veicolo trovato con targa <b>${val}</b></div>`; return; }
        await logAction({ azione:'READ', modulo:'veicoli', record_id:v.id, record_label:v.targa });
        res.innerHTML = _renderVehicleDetail(v);
      } catch(e) {
        res.innerHTML = `<div style="color:var(--red);padding:20px">${e.message}</div>`;
      }
    };
  },
};

function _renderVehicleDetail(v) {
  const stMap = { 'In corso':'s-incorso','Sospeso':'s-sospeso','Archiviato':'s-archiviato',
    'Bloccato':'s-bloccato','Disattivato':'s-disattivato','Furto':'s-furto','Revocato':'s-revocato' };
  return `
    <div class="detail-card">
      <div class="detail-card-header">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="plate-badge">${v.targa}</div>
          ${v.stato ? `<span class="stato-chip ${stMap[v.stato]||''}">${v.stato}</span>` : ''}
          ${v.piattaforma ? `<span class="plat-badge">${v.piattaforma}</span>` : ''}
        </div>
        <button class="btn-primary" onclick="window._veicoloEdit(${v.id})">✏️ Modifica</button>
      </div>

      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-val">${[v.marca,v.modello].filter(Boolean).join(' ') || '—'}</div><div class="kpi-label">Veicolo</div></div>
        <div class="kpi-box"><div class="kpi-val">${v.colore || '—'}</div><div class="kpi-label">Colore</div></div>
        <div class="kpi-box kpi-blue"><div class="kpi-val">€${v.canone||0}</div><div class="kpi-label">Canone</div></div>
      </div>

      <div class="info-grid-2col">
        <div>
          <div class="section-label">CONTRATTO</div>
          ${_row('N° Contratto', v.numero_contratto)}
          ${_row('Articolo', v.articolo)}
          ${_row('Canone', v.canone ? '€'+v.canone : null)}
          ${_row('Attivazione', v.data_attivazione)}
          ${_row('Scadenza', v.data_sospensione || v.data_termine)}
          ${_row('Stato', v.stato)}
          ${_row('Piattaforma', v.piattaforma)}
        </div>
        <div>
          <div class="section-label">DISPOSITIVO GPS</div>
          ${_row('Seriale', v.seriale_periferica)}
          ${_row('Modello', v.modello_periferica)}
          ${_row('Produttore', v.produttore_periferica)}
          ${_row('Installatore', v.installatore)}
          ${_row('Data Installaz.', v.data_installazione)}
          ${_row('SIM Voce', v.sim_voce)}
          ${_row('SIM Dati', v.sim_dati)}
        </div>
        <div>
          <div class="section-label">CLIENTE</div>
          ${_row('Ragione Sociale', v.ragione_sociale)}
          ${_row('Email', v.email)}
          ${_row('Cellulare', v.cellulare)}
          ${_row('Tel. Ufficio', v.telefono_ufficio)}
        </div>
        <div>
          <div class="section-label">VEICOLO</div>
          ${_row('Tipo Mezzo', v.tipo_mezzo)}
          ${_row('Marca', v.marca)}
          ${_row('Modello', v.modello)}
          ${_row('Colore', v.colore)}
          ${_row('N° Telaio', v.numero_telaio)}
        </div>
      </div>
    </div>`;
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
