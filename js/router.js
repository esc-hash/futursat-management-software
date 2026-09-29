import { getCurrentProfile } from './modules/auth.js';

const _registry = {};
let   _current  = null;

export function register(module) {
  _registry[module.id] = module;
}

export async function navigate(id, push = true) {
  id = id || 'home';
  const mod = _registry[id];
  if (!mod) return navigate('home', push);

  // RBAC gate
  if (mod.requiredRoles) {
    const p = await getCurrentProfile();
    if (!p || !mod.requiredRoles.includes(p.role)) {
      _showDenied();
      return;
    }
  }

  // Cleanup prev
  if (_current && _registry[_current]?.onLeave) _registry[_current].onLeave();

  // Update nav highlight
  document.querySelectorAll('[data-route]').forEach(el =>
    el.classList.toggle('active', el.dataset.route === id)
  );

  // Render
  const c = document.getElementById('page-content');
  if (!c) return;
  c.innerHTML = '<div class="page-loading">Caricamento…</div>';
  await mod.render(c);
  if (mod.onEnter) await mod.onEnter(c);
  window.lucide?.createIcons();

  // Title
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = mod.title || 'Futursat';

  _current = id;
  if (push) history.pushState({ route: id }, '', '#' + id);
}

export function initRouter() {
  window.addEventListener('popstate', e => navigate(e.state?.route || location.hash.slice(1), false));
  navigate(location.hash.slice(1) || 'home', false);
}

function _showDenied() {
  const c = document.getElementById('page-content');
  if (c) c.innerHTML = `<div style="padding:80px;text-align:center">
    <div style="margin-bottom:16px;color:var(--danger)"><i data-lucide="shield-off" style="width:48px;height:48px;stroke-width:1.5px"></i></div>
    <h2 style="color:var(--text-main)">Accesso negato</h2>
    <p style="color:var(--text-muted);margin-top:8px">Non hai i permessi per questa sezione.</p>
  </div>`;
  window.lucide?.createIcons();
}
