import { supabase }  from '../supabaseClient.js';
import { logAction }  from './auditLog.js';
import { getCurrentUser } from './auth.js';

const BUCKET = 'documenti-clienti';

// ── API ─────────────────────────────────────────────────────
export async function listDocumenti(clienteId) {
  const { data, error } = await supabase
    .from('documenti')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSignedUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadDocumento({ file, clienteId, veicoloId = null, descrizione = '' }) {
  const user    = await getCurrentUser();
  const ext     = file.name.split('.').pop().toLowerCase();
  const ts      = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path    = `cliente_${clienteId}/${ts}_${safeName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw new Error('Upload fallito: ' + upErr.message);

  const { data, error: dbErr } = await supabase.from('documenti').insert({
    cliente_id:        clienteId,
    veicolo_id:        veicoloId || null,
    nome_file:         path,
    nome_originale:    file.name,
    tipo_file:         ext,
    dimensione_bytes:  file.size,
    storage_path:      path,
    caricato_da:       user?.id,
    caricato_da_email: user?.email,
    descrizione,
  }).select().maybeSingle();

  if (dbErr) throw new Error('Salvataggio record fallito: ' + dbErr.message);

  await logAction({ azione:'CREATE', modulo:'documenti', record_id:data?.id, record_label: file.name, valori_nuovi:{ cliente_id:clienteId, nome:file.name } });
  return data;
}

export async function deleteDocumento(id, storagePath) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('documenti').delete().eq('id', id);
  if (error) throw error;
  await logAction({ azione:'DELETE', modulo:'documenti', record_id:id, record_label: storagePath });
}

// ── Render lista documenti (usato da clienti.js in tab Documenti) ──
export async function renderDocsList(container, clienteId) {
  if (!clienteId) { container.innerHTML = '<div class="empty-state">ID cliente non disponibile</div>'; return; }
  container.innerHTML = '<div style="color:var(--text3);padding:16px">Caricamento…</div>';
  try {
    const docs = await listDocumenti(clienteId);
    container.innerHTML = `
      <div style="margin-bottom:16px;display:flex;gap:10px;align-items:center">
        <h3 style="font-size:14px;font-weight:700;color:var(--text)">Archivio documenti</h3>
        <button class="btn-primary" style="margin-left:auto" onclick="window._docUploadOpen(${clienteId})">+ Carica</button>
      </div>
      ${docs.length ? `<div class="doc-list">${docs.map(_docRow).join('')}</div>`
        : '<div class="empty-state">Nessun documento caricato</div>'}`;
  } catch(e) {
    container.innerHTML = `<div style="color:var(--red);padding:16px">${e.message}</div>`;
  }
}

function _docRow(d) {
  const date = new Date(d.created_at).toLocaleDateString('it-IT');
  const icon = { pdf:'📄', jpg:'🖼', jpeg:'🖼', png:'🖼' }[d.tipo_file] || '📎';
  const kb   = d.dimensione_bytes ? Math.round(d.dimensione_bytes / 1024) + ' KB' : '';
  return `<div class="doc-item">
    <div class="doc-icon">${icon}</div>
    <div class="doc-info">
      <div class="doc-name">${d.nome_originale}</div>
      <div class="doc-meta">${date} · ${kb} · ${d.caricato_da_email || '—'}</div>
      ${d.descrizione ? `<div class="doc-desc">${d.descrizione}</div>` : ''}
    </div>
    <div class="doc-actions">
      <button class="btn-xs" onclick="window._docOpen(${d.id},'${d.storage_path}')">👁 Apri</button>
      <button class="btn-xs btn-xs-danger" onclick="window._docDelete(${d.id},'${d.storage_path}')">🗑</button>
    </div>
  </div>`;
}

window._docOpen = async (id, path) => {
  try {
    const url = await getSignedUrl(path, 3600);
    window.open(url, '_blank');
  } catch(e) { alert('Impossibile aprire: ' + e.message); }
};

window._docDelete = async (id, path) => {
  if (!confirm('Eliminare questo documento?')) return;
  try {
    await deleteDocumento(id, path);
    document.querySelector(`.doc-item [onclick*="_docDelete(${id}"]`)?.closest('.doc-item')?.remove();
  } catch(e) { alert('Errore: ' + e.message); }
};

window._docUploadOpen = (clienteId) => {
  window.showModal('Carica Documento', `
    <div class="form-grid">
      <div class="form-field form-full">
        <label class="form-label">File (PDF, JPG, PNG — max 10 MB)</label>
        <input type="file" id="docFile" class="form-input" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="form-field form-full">
        <label class="form-label">Descrizione (opzionale)</label>
        <input class="form-input" id="docDesc" placeholder="Es. Contratto firmato…">
      </div>
    </div>`, `
    <button class="btn-ghost" onclick="closeModal()">Annulla</button>
    <button class="btn-primary" onclick="window._docUploadSave(${clienteId})">Carica</button>`);
};

window._docUploadSave = async (clienteId) => {
  const file = document.getElementById('docFile')?.files?.[0];
  const desc = document.getElementById('docDesc')?.value || '';
  if (!file) { alert('Seleziona un file'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('File troppo grande (max 10 MB)'); return; }
  try {
    await uploadDocumento({ file, clienteId, descrizione: desc });
    window.closeModal();
    const wrap = document.getElementById('docClienteWrap');
    if (wrap) renderDocsList(wrap, clienteId);
  } catch(e) { alert('Errore upload: ' + e.message); }
};

// ── Modulo pagina standalone ────────────────────────────────
export default {
  id: 'documenti',
  title: 'Archivio Documenti',
  icon: '📁',

  async render(container) {
    container.innerHTML = `
      <div class="page-wrap">
        <div class="page-header">
          <h1 class="page-title">📁 Archivio Documenti</h1>
          <p class="page-sub">Cerca un cliente per visualizzare e gestire i suoi documenti.</p>
        </div>
        <div class="search-bar-wrap">
          <div class="name-search-box">
            <input id="docClienteSearch" class="search-input" placeholder="Ragione sociale cliente…"
              oninput="window._docClienteSearch()" onkeydown="if(event.key==='Enter')window._docClienteSearch()">
            <button class="btn-search" onclick="window._docClienteSearch()">Cerca</button>
          </div>
        </div>
        <div id="docClienteList" style="margin-top:16px"></div>
        <div id="docMainArea" style="margin-top:24px"></div>
      </div>`;

    window._docClienteSearch = async () => {
      const q = document.getElementById('docClienteSearch')?.value?.trim();
      if (!q || q.length < 2) return;
      const { data } = await supabase.from('clienti')
        .select('id,ragione_sociale,citta').ilike('ragione_sociale', `*${q}*`).limit(30);
      const list = document.getElementById('docClienteList');
      list.innerHTML = (data||[]).map(c => `
        <div class="cliente-item" onclick="window._docSelectCliente(${c.id},'${c.ragione_sociale.replace(/'/g,"\\'")}')">
          <div class="cliente-item-name">${c.ragione_sociale}</div>
          <div class="cliente-item-sub">${c.citta || ''}</div>
        </div>`).join('') || '<div class="empty-state">Nessun risultato</div>';
    };

    window._docSelectCliente = (id, nome) => {
      window._currentClienteId = id;
      document.getElementById('docClienteList').innerHTML = '';
      const area = document.getElementById('docMainArea');
      renderDocsList(area, id);
    };
  },
};
