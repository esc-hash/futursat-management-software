import { supabase }          from '../supabaseClient.js';
import { roleLabel, roleBadgeClass } from './auth.js';
import { logAction }           from './auditLog.js';

export default {
  id: 'amministrazione',
  title: 'Amministrazione',
  icon: '⚙️',
  requiredRoles: ['admin', 'amministrazione'],

  async render(container) {
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">⚙️ Amministrazione</h1>
          <p class="page-sub">Gestione utenti, approvazioni, configurazioni di sistema.</p>
        </div>

        <div class="tabs" id="adminTabs">
          <button class="tab active" onclick="window._adminTab('utenti')">👤 Utenti</button>
          <button class="tab" onclick="window._adminTab('richieste')">
            🔔 Richieste
            <span class="tab-badge" id="pendingCount"></span>
          </button>
          <button class="tab" onclick="window._adminTab('statistiche')">📊 Statistiche</button>
        </div>

        <div id="adminContent" style="margin-top:20px">Caricamento…</div>
      </div>`;

    window._adminTab = (tab) => {
      document.querySelectorAll('#adminTabs .tab').forEach(el => el.classList.remove('active'));
      event?.target?.classList.add('active');
      const c = document.getElementById('adminContent');
      if      (tab === 'utenti')     _renderUtenti(c);
      else if (tab === 'richieste')  _renderRichieste(c);
      else if (tab === 'statistiche') _renderStats(c);
    };

    _renderUtenti(container.querySelector('#adminContent'));
    _loadPendingCount();
  },
};

// ── Conteggio pending ──────────────────────────────────────
async function _loadPendingCount() {
  const { count } = await supabase.from('user_profiles')
    .select('*', { count:'exact', head:true }).eq('stato_account','pending');
  const el = document.getElementById('pendingCount');
  if (el && count) { el.textContent = count; el.style.display = 'inline'; }
}

// ── Lista utenti ───────────────────────────────────────────
async function _renderUtenti(container) {
  container.innerHTML = '<div style="color:var(--text3);padding:16px">Caricamento…</div>';
  const { data } = await supabase.from('user_profiles')
    .select('*').neq('stato_account','pending').order('created_at', { ascending:false });
  const rows = (data || []).map(u => `
    <tr>
      <td style="font-size:13px">${u.full_name}</td>
      <td style="font-size:12px;color:var(--text2)">${u.email}</td>
      <td><span class="role-chip ${roleBadgeClass(u.role)}">${roleLabel(u.role)}</span></td>
      <td><span class="stato-chip ${u.stato_account==='approved'?'s-incorso':'s-bloccato'}">${u.stato_account}</span></td>
      <td style="font-size:11px;color:var(--text3)">${new Date(u.created_at).toLocaleDateString('it-IT')}</td>
      <td>
        <button class="btn-xs" onclick="window._adminEditUser('${u.id}')">✏️</button>
        ${u.stato_account==='approved'
          ? `<button class="btn-xs btn-xs-danger" onclick="window._adminSetStato('${u.id}','suspended')">⏸</button>`
          : `<button class="btn-xs" onclick="window._adminSetStato('${u.id}','approved')">▶️</button>`}
      </td>
    </tr>`).join('');
  container.innerHTML = `
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Registrato</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text3)">Nessun utente</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Richieste in attesa ────────────────────────────────────
async function _renderRichieste(container) {
  container.innerHTML = '<div style="color:var(--text3);padding:16px">Caricamento…</div>';
  const { data } = await supabase.from('user_profiles')
    .select('*').eq('stato_account','pending').order('created_at');
  if (!data?.length) { container.innerHTML = '<div class="empty-state">✅ Nessuna richiesta in attesa</div>'; return; }
  container.innerHTML = data.map(u => `
    <div class="request-card">
      <div class="request-info">
        <div class="request-name">${u.full_name}</div>
        <div class="request-email">${u.email}</div>
        <div style="margin-top:6px">
          <span class="role-chip ${roleBadgeClass(u.role)}">${roleLabel(u.role)} richiesto</span>
          <span style="color:var(--text3);font-size:11px;margin-left:8px">${new Date(u.created_at).toLocaleDateString('it-IT')}</span>
        </div>
        ${u.note_richiesta ? `<div class="request-note">"${u.note_richiesta}"</div>` : ''}
      </div>
      <div class="request-actions">
        <select id="role_${u.id}" class="form-select" style="font-size:12px;padding:6px 8px">
          <option value="agente" ${u.role==='agente'?'selected':''}>Agente</option>
          <option value="dipendente" ${u.role==='dipendente'?'selected':''}>Dipendente</option>
          <option value="amministrazione" ${u.role==='amministrazione'?'selected':''}>Amministrazione</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        </select>
        <button class="btn-primary" onclick="window._adminApprove('${u.id}')">✅ Approva</button>
        <button class="btn-ghost" style="color:var(--red);border-color:var(--red)" onclick="window._adminReject('${u.id}')">✗ Rifiuta</button>
      </div>
    </div>`).join('');
}

// ── Statistiche sistema ────────────────────────────────────
async function _renderStats(container) {
  container.innerHTML = '<div style="color:var(--text3);padding:16px">Caricamento…</div>';
  const [{ count: totV }, { count: totC }, { count: totU }, { count: totDoc }] = await Promise.all([
    supabase.from('veicoli').select('*',   { count:'exact', head:true }),
    supabase.from('clienti').select('*',   { count:'exact', head:true }),
    supabase.from('user_profiles').select('*', { count:'exact', head:true }),
    supabase.from('documenti').select('*', { count:'exact', head:true }),
  ]);
  const { count: attivi } = await supabase.from('veicoli').select('*', { count:'exact', head:true }).eq('stato','In corso');
  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi-box"><div class="kpi-val">${totV||0}</div><div class="kpi-label">Veicoli totali</div></div>
      <div class="kpi-box kpi-green"><div class="kpi-val">${attivi||0}</div><div class="kpi-label">Attivi (In corso)</div></div>
      <div class="kpi-box"><div class="kpi-val">${totC||0}</div><div class="kpi-label">Clienti</div></div>
      <div class="kpi-box kpi-blue"><div class="kpi-val">${totU||0}</div><div class="kpi-label">Utenti</div></div>
      <div class="kpi-box"><div class="kpi-val">${totDoc||0}</div><div class="kpi-label">Documenti</div></div>
    </div>`;
}

// ── Azioni ─────────────────────────────────────────────────
window._adminApprove = async (id) => {
  const roleEl = document.getElementById('role_' + id);
  const role   = roleEl?.value || 'agente';
  const { error } = await supabase.from('user_profiles')
    .update({ stato_account:'approved', role }).eq('id', id);
  if (error) { alert('Errore: ' + error.message); return; }
  await logAction({ azione:'UPDATE', modulo:'user_profiles', record_id:id, record_label:'Approvazione utente', valori_nuovi:{ stato_account:'approved', role } });
  _renderRichieste(document.getElementById('adminContent'));
  _loadPendingCount();
};

window._adminReject = async (id) => {
  if (!confirm('Rifiutare questa richiesta?')) return;
  const { error } = await supabase.from('user_profiles').update({ stato_account:'rejected' }).eq('id', id);
  if (error) { alert('Errore: ' + error.message); return; }
  await logAction({ azione:'UPDATE', modulo:'user_profiles', record_id:id, record_label:'Richiesta rifiutata', valori_nuovi:{ stato_account:'rejected' } });
  _renderRichieste(document.getElementById('adminContent'));
  _loadPendingCount();
};

window._adminSetStato = async (id, stato) => {
  const { error } = await supabase.from('user_profiles').update({ stato_account:stato }).eq('id', id);
  if (error) { alert('Errore: ' + error.message); return; }
  _renderUtenti(document.getElementById('adminContent'));
};

window._adminEditUser = async (id) => {
  const { data: u } = await supabase.from('user_profiles').select('*').eq('id',id).maybeSingle();
  if (!u) return;
  window.showModal('Modifica Utente', `
    <div class="form-grid">
      <div class="form-field form-full">
        <label class="form-label">Nome completo</label>
        <input class="form-input" id="eu_name" value="${u.full_name || ''}">
      </div>
      <div class="form-field">
        <label class="form-label">Ruolo</label>
        <select class="form-select" id="eu_role">
          ${['admin','amministrazione','dipendente','agente'].map(r =>
            `<option value="${r}" ${u.role===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Stato</label>
        <select class="form-select" id="eu_stato">
          ${['approved','pending','suspended','rejected'].map(s =>
            `<option value="${s}" ${u.stato_account===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-field form-full">
        <label class="form-label">Note admin</label>
        <textarea class="form-input" id="eu_note" rows="2">${u.note_admin||''}</textarea>
      </div>
    </div>`, `
    <button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button class="btn-primary" onclick="window._adminSaveUser('${id}')">Salva</button>`);
};

window._adminSaveUser = async (id) => {
  const d = {
    full_name:     document.getElementById('eu_name')?.value   || '',
    role:          document.getElementById('eu_role')?.value   || 'agente',
    stato_account: document.getElementById('eu_stato')?.value  || 'approved',
    note_admin:    document.getElementById('eu_note')?.value   || '',
  };
  const { error } = await supabase.from('user_profiles').update(d).eq('id', id);
  if (error) { alert('Errore: ' + error.message); return; }
  await logAction({ azione:'UPDATE', modulo:'user_profiles', record_id:id, record_label:'Modifica utente', valori_nuovi:d });
  window.closeModal();
  _renderUtenti(document.getElementById('adminContent'));
};
