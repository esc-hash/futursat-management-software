import { supabase } from '../supabaseClient.js';

// ── Costanti ruoli ──────────────────────────────────────────
export const ROLES = {
  ADMIN:           'admin',
  AMMINISTRAZIONE: 'amministrazione',
  DIPENDENTE:      'dipendente',
  AGENTE:          'agente',
};

export const MACRO = {
  ADMIN_AMM:  ['admin', 'amministrazione'],
  OPERATIVA:  ['dipendente', 'agente'],
  ALL:        ['admin', 'amministrazione', 'dipendente', 'agente'],
};

// ── Cache in-memoria (resettata al logout) ──────────────────
let _user    = null;
let _profile = null;

export function clearCache() {
  _user    = null;
  _profile = null;
}

// ── Lettura sessione ────────────────────────────────────────
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentUser() {
  if (_user) return _user;
  const s = await getSession();
  if (!s) return null;
  _user = s.user;
  return _user;
}

export async function getCurrentProfile() {
  if (_profile) return _profile;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  _profile = data;
  return _profile;
}

// ── Controlli RBAC ─────────────────────────────────────────
export async function isApproved() {
  const p = await getCurrentProfile();
  return p?.stato_account === 'approved';
}

export async function hasRole(...roles) {
  const p = await getCurrentProfile();
  if (!p || p.stato_account !== 'approved') return false;
  return roles.flat().includes(p.role);
}

// ── Redirect guards ────────────────────────────────────────
export async function requireAuth() {
  const s = await getSession();
  if (!s) { window.location.href = '/login.html'; return false; }
  return true;
}

export async function requireApproved() {
  const p = await getCurrentProfile();
  if (!p || p.stato_account !== 'approved') {
    window.location.href = '/login.html?status=' + (p?.stato_account || 'none');
    return false;
  }
  return true;
}

// ── Login ───────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(_mapAuthError(error.message));

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stato_account, role, full_name')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile)
    throw new Error('Profilo non trovato. Contatta l\'amministratore.');
  if (profile.stato_account === 'pending')
    throw new Error('Il tuo account è in attesa di approvazione.');
  if (profile.stato_account === 'rejected')
    throw new Error('La tua richiesta di accesso è stata rifiutata.');
  if (profile.stato_account === 'suspended')
    throw new Error('Il tuo account è stato sospeso.');

  _user    = data.user;
  _profile = profile;
  return { user: data.user, profile };
}

// ── Richiesta registrazione ─────────────────────────────────
export async function requestRegistration({ full_name, email, password, role, note_richiesta }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + '/login.html' },
  });
  if (error) throw new Error(_mapAuthError(error.message));

  const { error: pe } = await supabase.from('user_profiles').insert({
    id:             data.user.id,
    full_name,
    email,
    role:           role || 'agente',
    stato_account:  'pending',
    note_richiesta: note_richiesta || '',
  });
  if (pe) throw new Error('Errore creazione profilo: ' + pe.message);

  return data.user;
}

// ── Logout ──────────────────────────────────────────────────
export async function logout() {
  clearCache();
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

// ── Helpers ─────────────────────────────────────────────────
function _mapAuthError(msg) {
  if (msg.includes('Invalid login'))       return 'Email o password errati.';
  if (msg.includes('Email not confirmed')) return 'Devi confermare la tua email prima di accedere.';
  if (msg.includes('already registered'))  return 'Questa email è già registrata.';
  return msg;
}

export function roleLabel(role) {
  return { admin:'Admin', amministrazione:'Amministrazione', dipendente:'Dipendente', agente:'Agente' }[role] || role;
}

export function roleBadgeClass(role) {
  return { admin:'badge-admin', amministrazione:'badge-amm', dipendente:'badge-dip', agente:'badge-age' }[role] || '';
}
