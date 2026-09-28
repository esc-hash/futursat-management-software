import { supabase }                        from './supabaseClient.js';
import { getCurrentProfile, logout, clearCache, MACRO } from './modules/auth.js';
import { register, navigate, initRouter }  from './router.js';
import { subscribeToAuditLog, unsubscribe } from './modules/auditLog.js';

import veicoliMod        from './modules/veicoli.js';
import clientiMod        from './modules/clienti.js';
import documentiMod      from './modules/documenti.js';
import auditMod          from './modules/auditLog.js';
import collaboratoriMod  from './modules/collaboratori.js';
import ammMod            from './modules/amministrazione.js';

// ── Home dashboard ──────────────────────────────────────────
const homeMod = {
  id: 'home',
  title: 'Home',
  icon: '🏠',
  async render(container) {
    const profile = await getCurrentProfile();
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">👋 Benvenuto, ${profile?.full_name || 'Utente'}</h1>
          <p class="page-sub">Gestionale Futursat · Servizi GPS per veicoli</p>
        </div>
        <div id="homeStats" class="kpi-row"><div style="color:var(--text3)">Caricamento…</div></div>
        <div class="card-grid-3" style="margin-top:28px" id="homeActions"></div>
      </div>`;
    _loadHomeStats();
    _renderHomeActions(profile);
  },
};

async function _loadHomeStats() {
  const { count: totV } = await supabase.from('veicoli').select('*', { count:'exact', head:true });
  const { count: attV } = await supabase.from('veicoli').select('*', { count:'exact', head:true }).eq('stato','In corso');
  const { count: totC } = await supabase.from('clienti').select('*', { count:'exact', head:true });
  const el = document.getElementById('homeStats');
  if (!el) return;
  el.innerHTML = `
    <div class="kpi-box"><div class="kpi-val">${totV||0}</div><div class="kpi-label">Veicoli totali</div></div>
    <div class="kpi-box kpi-green"><div class="kpi-val">${attV||0}</div><div class="kpi-label">Attivi</div></div>
    <div class="kpi-box"><div class="kpi-val">${totC||0}</div><div class="kpi-label">Clienti</div></div>`;
}

function _renderHomeActions(profile) {
  const all = [
    { icon:'🚛', title:'Cerca Targa',    desc:'Ricerca rapida per targa',      route:'veicoli' },
    { icon:'🏢', title:'Clienti',        desc:'Anagrafica e veicoli cliente',   route:'clienti' },
    { icon:'📁', title:'Documenti',      desc:'Archivio PDF e immagini',        route:'documenti' },
    { icon:'📋', title:'Registro',       desc:'Cronologia attività',            route:'audit',         roles: MACRO.ADMIN_AMM },
    { icon:'⚙️', title:'Amministrazione',desc:'Utenti e configurazioni',        route:'amministrazione', roles: MACRO.ADMIN_AMM },
    { icon:'👥', title:'Area Operativa', desc:'Dashboard collaboratori',        route:'collaboratori',  roles: MACRO.OPERATIVA },
  ];
  const el = document.getElementById('homeActions');
  if (!el) return;
  el.innerHTML = all
    .filter(a => !a.roles || a.roles.includes(profile?.role))
    .map(a => `<div class="action-card" onclick="navigate('${a.route}')">
      <div class="action-card-icon">${a.icon}</div>
      <div class="action-card-title">${a.title}</div>
      <div class="action-card-desc">${a.desc}</div>
    </div>`).join('');
}

// ── Navigazione sidebar ─────────────────────────────────────
async function buildNav(profile) {
  const role  = profile?.role;
  const isAmm = MACRO.ADMIN_AMM.includes(role);
  const isOp  = MACRO.OPERATIVA.includes(role);

  const items = [
    { route:'home',              icon:'🏠', label:'Home' },
    { route:'veicoli',           icon:'🚛', label:'Ricerca Targa' },
    { route:'clienti',           icon:'🏢', label:'Clienti' },
    { route:'documenti',         icon:'📁', label:'Documenti' },
    ...(isOp  ? [{ route:'collaboratori',  icon:'👥', label:'Area Operativa' }] : []),
    ...(isAmm ? [
      { sep: true, label:'AMMINISTRAZIONE' },
      { route:'audit',           icon:'📋', label:'Registro Attività' },
      { route:'amministrazione', icon:'⚙️', label:'Amministrazione' },
    ] : []),
  ];

  const nav = document.getElementById('nav-items');
  if (!nav) return;
  nav.innerHTML = items.map(i => i.sep
    ? `<div class="nav-group-label">${i.label}</div>`
    : `<button class="nav-link" data-route="${i.route}" onclick="navigate('${i.route}')">
        <span class="nav-icon">${i.icon}</span>${i.label}
       </button>`
  ).join('');

  // User info
  const abbr = profile?.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';
  document.getElementById('userAvatar').textContent  = abbr;
  document.getElementById('userName').textContent   = profile?.full_name || '—';
  document.getElementById('userEmail').textContent  = profile?.email     || '—';
}

// ── Notifiche realtime ──────────────────────────────────────
let _notifChannel = null;
let _notifications = [];

function initNotifications(profile) {
  if (!MACRO.ADMIN_AMM.includes(profile?.role)) return;
  _notifChannel = subscribeToAuditLog(entry => {
    _notifications.unshift(entry);
    _updateNotifBadge();
    _renderNotifList();
  });
}

function _updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const unread = _notifications.length;
  badge.textContent = unread > 9 ? '9+' : unread;
  badge.style.display = unread ? 'inline-flex' : 'none';
}

function _renderNotifList() {
  const list = document.getElementById('notifList');
  if (!list) return;
  if (!_notifications.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Nessuna notifica</div>';
    return;
  }
  list.innerHTML = _notifications.slice(0, 30).map(n => {
    const az = { CREATE:'🟢', UPDATE:'🟡', DELETE:'🔴', LOGIN:'🔵' }[n.azione] || '•';
    const dt = new Date(n.created_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    return `<div class="notif-item">
      <span>${az}</span>
      <div style="flex:1;font-size:12px">
        <b>${n.user_email}</b> — ${n.azione} ${n.modulo}
        ${n.record_label ? `<span style="color:var(--text2)"> · ${n.record_label}</span>` : ''}
      </div>
      <span style="font-size:11px;color:var(--text3)">${dt}</span>
    </div>`;
  }).join('');
}

// ── Modal globale ───────────────────────────────────────────
window.showModal = (title, body, footer = '') => {
  document.getElementById('modalHead').innerHTML  = `<h3 style="font-size:16px;font-weight:700">${title}</h3>`;
  document.getElementById('modalBody').innerHTML  = body;
  document.getElementById('modalFooter').innerHTML = footer;
  document.getElementById('modalOverlay').style.display = 'flex';
};
window.closeModal = () => { document.getElementById('modalOverlay').style.display = 'none'; };

window.toggleUserDropdown = () => document.getElementById('userDropdown')?.classList.toggle('open');
window.toggleNotifPanel = () => {
  const panel   = document.getElementById('notifPanel');
  const overlay = document.getElementById('notifOverlay');
  const open    = panel.style.display === 'none' || !panel.style.display;
  panel.style.display   = open ? 'flex' : 'none';
  overlay.style.display = open ? 'block': 'none';
  if (open) _renderNotifList();
};
window.closeNotifPanel = () => {
  document.getElementById('notifPanel').style.display   = 'none';
  document.getElementById('notifOverlay').style.display = 'none';
};
window.markAllRead = () => { _notifications = []; _updateNotifBadge(); _renderNotifList(); };
window.toggleSidebar = () => document.getElementById('sidebar')?.classList.toggle('open');
window.navigate = (id) => navigate(id);
window.logout   = logout;

// ── Bootstrap ───────────────────────────────────────────────
async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = '/login.html'; return; }

  const profile = await getCurrentProfile();
  if (!profile || profile.stato_account !== 'approved') {
    window.location.href = '/login.html?status=' + (profile?.stato_account || 'none');
    return;
  }

  // Register modules
  [homeMod, veicoliMod, clientiMod, documentiMod, auditMod, collaboratoriMod, ammMod]
    .forEach(m => register(m));

  await buildNav(profile);
  initNotifications(profile);
  initRouter();

  // Listen for auth changes
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      unsubscribe(_notifChannel);
      clearCache();
      window.location.href = '/login.html';
    }
  });
}

boot();
