import { supabase }          from '../supabaseClient.js';
import { getCurrentProfile }   from './auth.js';
import { logAction }           from './auditLog.js';

export default {
  id: 'collaboratori',
  title: 'Area Operativa',
  icon: '👥',
  requiredRoles: ['dipendente', 'agente'],

  async render(container) {
    const profile = await getCurrentProfile();
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">👥 Area Operativa</h1>
          <p class="page-sub">Benvenuto, ${profile?.full_name || 'Collaboratore'}. Usa i pannelli qui sotto per le operazioni quotidiane.</p>
        </div>

        <div class="card-grid-3">

          <div class="action-card" onclick="navigate('veicoli')">
            <div class="action-card-icon">🔍</div>
            <div class="action-card-title">Cerca Veicolo</div>
            <div class="action-card-desc">Trova un veicolo per targa e consulta il contratto GPS.</div>
          </div>

          <div class="action-card" onclick="navigate('clienti')">
            <div class="action-card-icon">🏢</div>
            <div class="action-card-title">Cerca Cliente</div>
            <div class="action-card-desc">Consulta l'anagrafica clienti, veicoli e documenti.</div>
          </div>

          <div class="action-card" onclick="navigate('documenti')">
            <div class="action-card-icon">📁</div>
            <div class="action-card-title">Carica Documento</div>
            <div class="action-card-desc">Aggiungi PDF o immagini all'archivio di un cliente.</div>
          </div>

          <div class="action-card" onclick="window._colNewCliente()">
            <div class="action-card-icon">➕</div>
            <div class="action-card-title">Nuovo Cliente</div>
            <div class="action-card-desc">Inserisci un nuovo cliente che non è ancora in anagrafica.</div>
          </div>

        </div>

        <div class="section-label" style="margin-top:32px">LE MIE ATTIVITÀ RECENTI</div>
        <div id="colMyActivity" style="margin-top:12px">
          <div style="color:var(--text3);font-size:13px">Caricamento…</div>
        </div>
      </div>`;

    _loadMyActivity(container);
  },
};

async function _loadMyActivity(container) {
  const profile = await getCurrentProfile();
  if (!profile) return;
  const wrap = container.querySelector('#colMyActivity');
  const { data } = await supabase
    .from('audit_log')
    .select('id,azione,modulo,record_label,created_at')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!data?.length) { wrap.innerHTML = '<div class="empty-state">Nessuna attività registrata</div>'; return; }
  wrap.innerHTML = `<div class="activity-list">${data.map(l => {
    const dt = new Date(l.created_at).toLocaleString('it-IT');
    const az = { CREATE:'🟢', UPDATE:'🟡', DELETE:'🔴', READ:'🔵', LOGIN:'⚪' }[l.azione] || '•';
    return `<div class="activity-item">
      <span class="activity-icon">${az}</span>
      <div class="activity-text">
        <span class="activity-action">${l.azione}</span> su <span class="activity-module">${l.modulo}</span>
        ${l.record_label ? `— <span style="color:var(--text)">${l.record_label}</span>` : ''}
      </div>
      <span class="activity-time">${dt}</span>
    </div>`;
  }).join('')}</div>`;
}

window._colNewCliente = () => {
  window.showModal('Nuovo Cliente', `
    <div class="form-grid">
      <div class="form-field form-full">
        <label class="form-label">Ragione Sociale *</label>
        <input class="form-input" id="nc_ragione_sociale" placeholder="Nome azienda o persona">
      </div>
      <div class="form-field">
        <label class="form-label">P.IVA</label>
        <input class="form-input" id="nc_partita_iva">
      </div>
      <div class="form-field">
        <label class="form-label">Telefono</label>
        <input class="form-input" id="nc_telefono">
      </div>
      <div class="form-field">
        <label class="form-label">Email</label>
        <input class="form-input" id="nc_email">
      </div>
      <div class="form-field">
        <label class="form-label">Città</label>
        <input class="form-input" id="nc_citta">
      </div>
      <div class="form-field">
        <label class="form-label">Provincia</label>
        <input class="form-input" id="nc_provincia" maxlength="2">
      </div>
    </div>`, `
    <button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button class="btn-primary" onclick="window._colSaveCliente()">Salva</button>`);
};

window._colSaveCliente = async () => {
  const rs = document.getElementById('nc_ragione_sociale')?.value?.trim();
  if (!rs) { alert('Ragione sociale obbligatoria'); return; }
  const data = {
    ragione_sociale: rs,
    partita_iva:  document.getElementById('nc_partita_iva')?.value  || null,
    telefono:     document.getElementById('nc_telefono')?.value     || null,
    email:        document.getElementById('nc_email')?.value        || null,
    citta:        document.getElementById('nc_citta')?.value        || null,
    provincia:    document.getElementById('nc_provincia')?.value    || null,
  };
  try {
    const { data: saved, error } = await supabase.from('clienti').insert(data).select().maybeSingle();
    if (error) throw error;
    await logAction({ azione:'CREATE', modulo:'clienti', record_id:saved?.id, record_label:rs, valori_nuovi:data });
    window.closeModal();
    alert(`Cliente "${rs}" creato con successo!`);
  } catch(e) { alert('Errore: ' + e.message); }
};
