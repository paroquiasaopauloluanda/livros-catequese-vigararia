/**
 * api.js — Integração com Google Sheets
 * Leitura: gviz/tq endpoint público
 * Escrita: localStorage imediato + Apps Script em background (fire-and-forget)
 */
const API = (() => {
  const CACHE = {};
  const CACHE_TTL = 5 * 60 * 1000;

  function _sheetOk() {
    return CONFIG.SPREADSHEET_ID &&
           CONFIG.SPREADSHEET_ID !== 'COLE_O_ID_DA_TUA_PLANILHA_AQUI' &&
           CONFIG.SPREADSHEET_ID.length > 10;
  }

  function _scriptOk() {
    return CONFIG.APPS_SCRIPT_URL &&
           CONFIG.APPS_SCRIPT_URL !== 'COLE_O_URL_DO_APPS_SCRIPT_AQUI' &&
           CONFIG.APPS_SCRIPT_URL.startsWith('https://');
  }

  // ─── Parser gviz/tq ────────────────────────────────────────────────────────
  function _parseGviz(raw) {
    const json = raw
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
      .replace(/^[^(]*\(/, '')
      .replace(/\);\s*$/, '')
      .trim();
    let data;
    try { data = JSON.parse(json); } catch (e) { return []; }
    if (!data.table || !data.table.rows || !data.table.rows.length) return [];

    const rawCols = data.table.cols.map(c => (c.label && c.label.trim()) ? c.label.trim() : (c.id || ''));
    const isLetters = rawCols.every(l => /^[A-Z]{1,3}$/.test(l));
    let cols, rows = data.table.rows.filter(r => r && r.c && r.c.some(c => c && c.v !== null && c.v !== ''));

    if (isLetters && rows.length > 0) {
      cols = rows[0].c.map(cell => (cell && cell.v) ? String(cell.v).trim() : '');
      rows = rows.slice(1);
    } else {
      cols = rawCols;
    }

    return rows.map(row => {
      const obj = {};
      cols.forEach((col, i) => {
        if (!col) return;
        const cell = row.c && row.c[i];
        let val = '';
        if (cell && cell.v !== null && cell.v !== undefined) {
          val = (cell.f !== null && cell.f !== undefined) ? cell.f : cell.v;
          if (typeof val === 'number') val = String(val);
          if (typeof val === 'boolean') val = val ? 'true' : 'false';
        }
        obj[col] = val;
      });
      return obj;
    });
  }

  // ─── Fetch sheet (leitura remota) ──────────────────────────────────────────
  async function fetchSheet(sheetName, forceRefresh = false) {
    if (!_sheetOk()) return _demo(sheetName);

    const key = `sheet_${sheetName}`;
    const now = Date.now();

    if (!forceRefresh && CACHE[key] && (now - CACHE[key].ts) < CACHE_TTL) return CACHE[key].data;

    if (!forceRefresh) {
      try {
        const lsc = localStorage.getItem(`cvs_cache_${sheetName}`);
        if (lsc) {
          const { ts, data } = JSON.parse(lsc);
          if ((now - ts) < CACHE_TTL) { CACHE[key] = { ts, data }; return data; }
        }
      } catch(e) {}
    }

    const url = `${CONFIG.SHEETS_BASE}${encodeURIComponent(sheetName)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = _parseGviz(await resp.text());
      CACHE[key] = { ts: now, data };
      try { localStorage.setItem(`cvs_cache_${sheetName}`, JSON.stringify({ ts: now, data })); } catch(e) {}
      return data;
    } catch (err) {
      console.warn(`[API] Falha ao buscar ${sheetName}:`, err.message);
      try {
        const lsc = localStorage.getItem(`cvs_cache_${sheetName}`);
        if (lsc) return JSON.parse(lsc).data;
      } catch(e) {}
      return _demo(sheetName);
    }
  }

  // ─── Apps Script: fire-and-forget via GET no-cors ──────────────────────────
  // Não esperamos resposta (no-cors = opaque). O Apps Script executa em background.
  // Os dados já foram guardados localmente antes desta chamada.
  function _fireScript(action, data) {
    if (!_scriptOk()) return;
    try {
      const payload = encodeURIComponent(JSON.stringify({ action, data }));
      fetch(`${CONFIG.APPS_SCRIPT_URL}?payload=${payload}`, { method: 'GET', mode: 'no-cors' })
        .then(() => console.log(`[API] Apps Script: ${action} enviado`))
        .catch(e => console.warn(`[API] Apps Script falhou (${action}):`, e.message));
    } catch(e) {}
  }

  // ─── localStorage: fonte de verdade local ─────────────────────────────────
  const KEYS = {
    RECORDS:  'cvs_local_records',
    PARISHES: 'cvs_local_parishes',
    USERS:    'cvs_local_users',
    BOOKS:    'cvs_local_books',
  };

  function _local(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }

  function _save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    // Invalida cache de memória desta sheet
    const map = {
      [KEYS.RECORDS]:  CONFIG.SHEETS.RECORDS,
      [KEYS.PARISHES]: CONFIG.SHEETS.PARISHES,
      [KEYS.USERS]:    CONFIG.SHEETS.USERS,
      [KEYS.BOOKS]:    CONFIG.SHEETS.BOOKS,
    };
    if (map[key]) delete CACHE[`sheet_${map[key]}`];
  }

  function _genId(prefix) { return `${prefix}${Date.now().toString(36).toUpperCase()}`; }
  function _today() { return new Date().toISOString().slice(0, 10); }

  // ─── PADRÃO DE ESCRITA ────────────────────────────────────────────────────
  // 1. Cria/actualiza/elimina no localStorage imediatamente → UI reflecte na hora
  // 2. Envia para Apps Script em background → planilha actualizada assincronamente
  // Resultado: UI sempre responsiva, planilha sincroniza em segundos

  // ─── Registos ─────────────────────────────────────────────────────────────
  async function getRecords(parish_id = null) {
    const remote = await fetchSheet(CONFIG.SHEETS.RECORDS);
    const local  = _local(KEYS.RECORDS);

    // Merge: remove do remote os que já estão no local (local tem prioridade)
    const localIds = new Set(local.map(r => r.record_id));
    const merged = [...remote.filter(r => !localIds.has(r.record_id)), ...local];

    // Filtra eliminados
    const deleted = _getDeleted('records');
    const result = merged.filter(r => !deleted.has(r.record_id));

    return parish_id ? result.filter(r => r.parish_id === parish_id) : result;
  }

  async function createRecord(data) {
    const user = Auth.getCurrentUser();
    const record = {
      record_id:  _genId('R'),
      parish_id:  data.parish_id || user.parish_id,
      stage_id:   data.stage_id   || '',
      age_id:     data.age_id     || '',
      book_name:  data.book_name  || '',
      author:     data.author     || '',
      publisher:  data.publisher  || '',
      year:       data.year       || '',
      notes:      data.notes      || '',
      status:     'submitted',
      created_by: user.username,
      created_at: _today(),
      updated_at: _today(),
    };
    const records = _local(KEYS.RECORDS);
    records.push(record);
    _save(KEYS.RECORDS, records);
    _fireScript('createRecord', record);
    return { success: true, record };
  }

  async function updateRecord(record_id, data) {
    const user = Auth.getCurrentUser();
    // Tenta encontrar no localStorage
    const records = _local(KEYS.RECORDS);
    const idx = records.findIndex(r => r.record_id === record_id);
    if (idx !== -1) {
      records[idx] = { ...records[idx], ...data, updated_at: _today(), updated_by: user.username };
      _save(KEYS.RECORDS, records);
      _fireScript('updateRecord', { record_id, ...data, updated_at: _today() });
      return { success: true };
    }
    // Registo está na sheet remota — adiciona ao local com as alterações
    const remote = await fetchSheet(CONFIG.SHEETS.RECORDS);
    const orig = remote.find(r => r.record_id === record_id);
    if (orig) {
      const updated = { ...orig, ...data, updated_at: _today(), updated_by: user.username };
      records.push(updated);
      _save(KEYS.RECORDS, records);
      _fireScript('updateRecord', { record_id, ...data, updated_at: _today() });
      return { success: true };
    }
    return { success: false, error: 'Registo não encontrado' };
  }

  async function deleteRecord(record_id) {
    // Remove do localStorage
    const records = _local(KEYS.RECORDS);
    const filtered = records.filter(r => r.record_id !== record_id);
    _save(KEYS.RECORDS, filtered);
    // Marca como eliminado para esconder mesmo que ainda esteja na sheet remota
    _markDeleted('records', record_id);
    _fireScript('deleteRecord', { record_id });
    return { success: true };
  }

  // ─── Paróquias ────────────────────────────────────────────────────────────
  async function getParishes() {
    const remote  = await fetchSheet(CONFIG.SHEETS.PARISHES);
    const local   = _local(KEYS.PARISHES);
    const localIds = new Set(local.map(p => p.parish_id));
    const deleted  = _getDeleted('parishes');
    return [...remote.filter(p => !localIds.has(p.parish_id) && !deleted.has(p.parish_id)), ...local];
  }

  async function createParish(data) {
    const parish = {
      parish_id:         _genId('P'),
      parish_name:       data.parish_name       || '',
      city:              data.city              || '',
      coordinator_name:  data.coordinator_name  || '',
      coordinator_phone: data.coordinator_phone || '',
      coordinator_email: data.coordinator_email || '',
      status:            'active',
    };
    const parishes = _local(KEYS.PARISHES);
    parishes.push(parish);
    _save(KEYS.PARISHES, parishes);
    _fireScript('createParish', parish);
    return { success: true, parish };
  }

  async function updateParish(parish_id, data) {
    const parishes = _local(KEYS.PARISHES);
    const idx = parishes.findIndex(p => p.parish_id === parish_id);
    if (idx !== -1) {
      parishes[idx] = { ...parishes[idx], ...data };
      _save(KEYS.PARISHES, parishes);
      _fireScript('updateParish', { parish_id, ...data });
      return { success: true };
    }
    // Remota: traz para local com alterações
    const remote = await fetchSheet(CONFIG.SHEETS.PARISHES);
    const orig = remote.find(p => p.parish_id === parish_id);
    if (orig) {
      const updated = { ...orig, ...data };
      parishes.push(updated);
      _save(KEYS.PARISHES, parishes);
      _fireScript('updateParish', { parish_id, ...data });
      return { success: true };
    }
    return { success: false, error: 'Paróquia não encontrada' };
  }

  async function deleteParish(parish_id) {
    const parishes = _local(KEYS.PARISHES).filter(p => p.parish_id !== parish_id);
    _save(KEYS.PARISHES, parishes);
    _markDeleted('parishes', parish_id);
    _fireScript('deleteParish', { parish_id });
    return { success: true };
  }

  // ─── Utilizadores ─────────────────────────────────────────────────────────
  async function _getUsersRaw() {
    const remote  = await fetchSheet(CONFIG.SHEETS.USERS);
    const local   = _local(KEYS.USERS);
    const localIds = new Set(local.map(u => u.user_id));
    const deleted  = _getDeleted('users');
    return [...remote.filter(u => !localIds.has(u.user_id) && !deleted.has(u.user_id)), ...local];
  }

  async function getUsers() {
    const all = await _getUsersRaw();
    return all.map(u => ({ ...u, password: '••••••' }));
  }

  async function createUser(data) {
    const all = await _getUsersRaw();
    if (all.find(u => u.username === data.username)) {
      return { success: false, error: 'Este utilizador já existe' };
    }
    const user = {
      user_id:      _genId('U'),
      username:     data.username     || '',
      password:     data.password     || '',
      role:         data.role         || 'parish',
      parish_id:    data.parish_id    || 'ALL',
      display_name: data.display_name || data.username || '',
      status:       'active',
    };
    const users = _local(KEYS.USERS);
    users.push(user);
    _save(KEYS.USERS, users);
    _fireScript('createUser', user);
    return { success: true };
  }

  async function updateUser(user_id, data) {
    const users = _local(KEYS.USERS);
    const idx = users.findIndex(u => u.user_id === user_id);
    if (idx !== -1) {
      if (!data.password) data.password = users[idx].password;
      users[idx] = { ...users[idx], ...data };
      _save(KEYS.USERS, users);
      _fireScript('updateUser', { user_id, ...data });
      return { success: true };
    }
    // Remota
    const remote = await fetchSheet(CONFIG.SHEETS.USERS);
    const orig = remote.find(u => u.user_id === user_id);
    if (orig) {
      if (!data.password) data.password = orig.password;
      const updated = { ...orig, ...data };
      users.push(updated);
      _save(KEYS.USERS, users);
      _fireScript('updateUser', { user_id, ...data });
      return { success: true };
    }
    return { success: false, error: 'Utilizador não encontrado' };
  }

  async function deleteUser(user_id) {
    const users = _local(KEYS.USERS).filter(u => u.user_id !== user_id);
    _save(KEYS.USERS, users);
    _markDeleted('users', user_id);
    _fireScript('deleteUser', { user_id });
    return { success: true };
  }

  // ─── Livros ───────────────────────────────────────────────────────────────
  async function getBooks() {
    const remote  = await fetchSheet(CONFIG.SHEETS.BOOKS);
    const local   = _local(KEYS.BOOKS);
    const localIds = new Set(local.map(b => b.book_id));
    const deleted  = _getDeleted('books');
    return [...remote.filter(b => !localIds.has(b.book_id) && !deleted.has(b.book_id)), ...local];
  }

  async function createBook(data) {
    const book = {
      book_id:           _genId('B'),
      book_name:         data.book_name         || '',
      author:            data.author            || '',
      publisher:         data.publisher         || '',
      recommended_stage: data.recommended_stage || '',
      recommended_age:   data.recommended_age   || '',
      year:              data.year              || '',
    };
    const books = _local(KEYS.BOOKS);
    books.push(book);
    _save(KEYS.BOOKS, books);
    _fireScript('createBook', book);
    return { success: true };
  }

  async function updateBook(book_id, data) {
    const books = _local(KEYS.BOOKS);
    const idx = books.findIndex(b => b.book_id === book_id);
    if (idx !== -1) {
      books[idx] = { ...books[idx], ...data };
      _save(KEYS.BOOKS, books);
      _fireScript('updateBook', { book_id, ...data });
      return { success: true };
    }
    const remote = await fetchSheet(CONFIG.SHEETS.BOOKS);
    const orig = remote.find(b => b.book_id === book_id);
    if (orig) {
      books.push({ ...orig, ...data });
      _save(KEYS.BOOKS, books);
      _fireScript('updateBook', { book_id, ...data });
      return { success: true };
    }
    return { success: false };
  }

  async function deleteBook(book_id) {
    const books = _local(KEYS.BOOKS).filter(b => b.book_id !== book_id);
    _save(KEYS.BOOKS, books);
    _markDeleted('books', book_id);
    _fireScript('deleteBook', { book_id });
    return { success: true };
  }

  // ─── Controlo de eliminados (para esconder registos remotos apagados) ─────
  function _getDeleted(entity) {
    try { return new Set(JSON.parse(localStorage.getItem(`cvs_deleted_${entity}`) || '[]')); }
    catch { return new Set(); }
  }
  function _markDeleted(entity, id) {
    const set = _getDeleted(entity);
    set.add(id);
    localStorage.setItem(`cvs_deleted_${entity}`, JSON.stringify([...set]));
  }

  // ─── Dados de demonstração ────────────────────────────────────────────────
  function _demo(sheetName) {
    const d = {
      [CONFIG.SHEETS.PARISHES]: [
        { parish_id:'P001', parish_name:'Paróquia São José',       city:'Luanda',  coordinator_name:'João Manuel',   coordinator_phone:'923000001', coordinator_email:'sjose@vigararia.ao',    status:'active' },
        { parish_id:'P002', parish_name:'Paróquia Santa Ana',      city:'Viana',   coordinator_name:'Maria Lopes',   coordinator_phone:'924000002', coordinator_email:'santana@vigararia.ao',  status:'active' },
        { parish_id:'P003', parish_name:'Paróquia Santo António',  city:'Cacuaco', coordinator_name:'António Silva', coordinator_phone:'925000003', coordinator_email:'stantonio@vigararia.ao', status:'active' },
      ],
      [CONFIG.SHEETS.USERS]: [
        { user_id:'U001', username:'admin',     password:'admin123', role:'admin',  parish_id:'ALL',  display_name:'Administrador',      status:'active' },
        { user_id:'U002', username:'sjose',     password:'123456',   role:'parish', parish_id:'P001', display_name:'Coord. São José',     status:'active' },
        { user_id:'U003', username:'santana',   password:'123456',   role:'parish', parish_id:'P002', display_name:'Coord. Santa Ana',    status:'active' },
      ],
      [CONFIG.SHEETS.STAGES]: [
        { stage_id:'S001', stage_name:'Pré-Catecumenato', category:'Catecumenato', order:1 },
        { stage_id:'S002', stage_name:'1º Catecumenato',  category:'Catecumenato', order:2 },
        { stage_id:'S003', stage_name:'2º Catecumenato',  category:'Catecumenato', order:3 },
        { stage_id:'S004', stage_name:'3º Catecumenato',  category:'Catecumenato', order:4 },
        { stage_id:'S005', stage_name:'1º Crisma',        category:'Crisma',       order:5 },
        { stage_id:'S006', stage_name:'2º Crisma',        category:'Crisma',       order:6 },
        { stage_id:'S007', stage_name:'Intensivo',        category:'Especial',     order:7 },
      ],
      [CONFIG.SHEETS.AGE_GROUPS]: [
        { age_id:'A001', age_group:'Crianças',     description:'7–12 anos'  },
        { age_id:'A002', age_group:'Adolescentes', description:'13–17 anos' },
        { age_id:'A003', age_group:'Jovens',       description:'18–25 anos' },
        { age_id:'A004', age_group:'Adultos',      description:'26+ anos'   },
      ],
      [CONFIG.SHEETS.BOOKS]:   [],
      [CONFIG.SHEETS.RECORDS]: [],
    };
    return d[sheetName] || [];
  }

  function clearCache() {
    Object.keys(CACHE).forEach(k => delete CACHE[k]);
    Object.keys(localStorage).filter(k => k.startsWith('cvs_cache_')).forEach(k => localStorage.removeItem(k));
  }

  return {
    fetchSheet, clearCache, _getUsersRaw,
    getRecords,  createRecord,  updateRecord,  deleteRecord,
    getParishes, createParish,  updateParish,  deleteParish,
    getUsers,    createUser,    updateUser,    deleteUser,
    getBooks,    createBook,    updateBook,    deleteBook,
  };
})();
