/**
 * api.js — Integração com Google Sheets
 * Leitura: gviz/tq endpoint público
 * Escrita: Google Apps Script Web App
 * Fallback: localStorage quando Apps Script não está configurado
 */
const API = (() => {
  const CACHE = {};
  const CACHE_TTL = 5 * 60 * 1000;

  function _sheetConfigured() {
    return CONFIG.SPREADSHEET_ID &&
           CONFIG.SPREADSHEET_ID !== 'COLE_O_ID_DA_TUA_PLANILHA_AQUI' &&
           CONFIG.SPREADSHEET_ID.length > 10;
  }

  function _scriptConfigured() {
    return CONFIG.APPS_SCRIPT_URL &&
           CONFIG.APPS_SCRIPT_URL !== 'COLE_O_URL_DO_APPS_SCRIPT_AQUI' &&
           CONFIG.APPS_SCRIPT_URL.startsWith('https://');
  }

  // ─── Parser gviz/tq ───────────────────────────────────────────────────────
  function _parseGviz(raw) {
    const json = raw
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
      .replace(/^[^(]*\(/, '')
      .replace(/\);\s*$/, '')
      .trim();

    let data;
    try { data = JSON.parse(json); }
    catch (e) { console.error('[API] Parse error:', e); return []; }

    if (!data.table || !data.table.rows || !data.table.rows.length) return [];

    const rawCols = data.table.cols.map(c => (c.label && c.label.trim()) ? c.label.trim() : (c.id || ''));
    const looksLikeLetters = rawCols.every(l => /^[A-Z]{1,3}$/.test(l));

    let cols;
    let rows = data.table.rows.filter(r => r && r.c && r.c.some(c => c && c.v !== null && c.v !== ''));

    if (looksLikeLetters && rows.length > 0) {
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

  // ─── Fetch sheet (leitura) ────────────────────────────────────────────────
  async function fetchSheet(sheetName, forceRefresh = false) {
    if (!_sheetConfigured()) return _demo(sheetName);

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
        if (lsc) { Toast.show('Modo offline — a usar cache local', 'warning'); return JSON.parse(lsc).data; }
      } catch(e) {}
      return _demo(sheetName);
    }
  }

  // ─── Apps Script (escrita) ────────────────────────────────────────────────
  // CORS fix: Apps Script redireciona POSTs, o browser bloqueia.
  // Usamos GET com payload na URL + mode:no-cors (sem preflight, sem redirecionamento bloqueado).
  // Não conseguimos ler a resposta (opaque), por isso assumimos sucesso e relemos a sheet.
  async function _post(action, data) {
    if (!_scriptConfigured()) {
      console.warn('[API] Apps Script não configurado — a usar localStorage');
      return null;
    }

    try {
      const payload = encodeURIComponent(JSON.stringify({ action, data }));
      const url = `${CONFIG.APPS_SCRIPT_URL}?payload=${payload}`;

      await fetch(url, { method: 'GET', mode: 'no-cors' });

      // no-cors → resposta opaque, não conseguimos verificar sucesso.
      // Aguarda 1.5s para o Apps Script processar, depois invalida cache.
      await new Promise(r => setTimeout(r, 1500));
      clearCache();
      console.log(`[API] Apps Script: ${action} enviado`);
      return { success: true };

    } catch (err) {
      console.error('[API] Apps Script error:', err.message);
      return null;
    }
  }

  // ─── localStorage fallback ────────────────────────────────────────────────
  const KEYS = {
    RECORDS:  'cvs_local_records',
    PARISHES: 'cvs_local_parishes',
    USERS:    'cvs_local_users',
    BOOKS:    'cvs_local_books',
  };

  function _local(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  }
  function _saveLocal(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    const sheetMap = {
      [KEYS.RECORDS]:  CONFIG.SHEETS.RECORDS,
      [KEYS.PARISHES]: CONFIG.SHEETS.PARISHES,
      [KEYS.USERS]:    CONFIG.SHEETS.USERS,
      [KEYS.BOOKS]:    CONFIG.SHEETS.BOOKS,
    };
    if (sheetMap[key]) delete CACHE[`sheet_${sheetMap[key]}`];
  }
  function _genId(prefix) { return `${prefix}${Date.now().toString(36).toUpperCase()}`; }

  // ─── CRUD Registos ────────────────────────────────────────────────────────
  async function getRecords(parish_id = null) {
    const remote = await fetchSheet(CONFIG.SHEETS.RECORDS);
    const local  = _local(KEYS.RECORDS);
    const merged = [...remote, ...local];
    return parish_id ? merged.filter(r => r.parish_id === parish_id) : merged;
  }

  async function createRecord(data) {
    const user = Auth.getCurrentUser();
    const record = {
      record_id:  _genId('R'),
      parish_id:  data.parish_id || user.parish_id,
      stage_id:   data.stage_id,
      age_id:     data.age_id,
      book_name:  data.book_name,
      author:     data.author     || '',
      publisher:  data.publisher  || '',
      year:       data.year       || '',
      notes:      data.notes      || '',
      status:     'submitted',
      created_by: user.username,
      created_at: new Date().toLocaleDateString('pt-AO'),
      updated_at: new Date().toLocaleDateString('pt-AO'),
    };

    const remote = await _post('createRecord', record);
    if (remote) return { success: true, record };

    // Fallback localStorage
    const records = _local(KEYS.RECORDS);
    records.push(record);
    _saveLocal(KEYS.RECORDS, records);
    return { success: true, record, local: true };
  }

  async function updateRecord(record_id, data) {
    const user = Auth.getCurrentUser();

    // Tenta Apps Script primeiro
    const remote = await _post('updateRecord', { record_id, ...data });
    if (remote && remote.success) return { success: true };

    // Fallback localStorage
    const records = _local(KEYS.RECORDS);
    const idx = records.findIndex(r => r.record_id === record_id);
    if (idx !== -1) {
      records[idx] = { ...records[idx], ...data, updated_at: new Date().toLocaleDateString('pt-AO'), updated_by: user.username };
      _saveLocal(KEYS.RECORDS, records);
      return { success: true, local: true };
    }
    return { success: false, error: 'Registo não encontrado localmente. Configura o Apps Script para editar registos da planilha.' };
  }

  async function deleteRecord(record_id) {
    const remote = await _post('deleteRecord', { record_id });
    if (remote && remote.success) return { success: true };

    const records = _local(KEYS.RECORDS);
    const filtered = records.filter(r => r.record_id !== record_id);
    if (filtered.length < records.length) {
      _saveLocal(KEYS.RECORDS, filtered);
      return { success: true, local: true };
    }
    return { success: false, error: 'Registo não encontrado localmente.' };
  }

  // ─── CRUD Paróquias ───────────────────────────────────────────────────────
  async function getParishes() {
    const remote = await fetchSheet(CONFIG.SHEETS.PARISHES);
    const local  = _local(KEYS.PARISHES);
    return [...remote, ...local];
  }

  async function createParish(data) {
    const parish = {
      parish_id:         _genId('P'),
      parish_name:       data.parish_name,
      city:              data.city              || '',
      coordinator_name:  data.coordinator_name  || '',
      coordinator_phone: data.coordinator_phone || '',
      coordinator_email: data.coordinator_email || '',
      status:            'active',
    };
    const remote = await _post('createParish', parish);
    if (remote && remote.success) return { success: true, parish };

    const parishes = _local(KEYS.PARISHES);
    parishes.push(parish);
    _saveLocal(KEYS.PARISHES, parishes);
    return { success: true, parish, local: true };
  }

  async function updateParish(parish_id, data) {
    const remote = await _post('updateParish', { parish_id, ...data });
    if (remote && remote.success) return { success: true };

    const parishes = _local(KEYS.PARISHES);
    const idx = parishes.findIndex(p => p.parish_id === parish_id);
    if (idx !== -1) {
      parishes[idx] = { ...parishes[idx], ...data };
      _saveLocal(KEYS.PARISHES, parishes);
      return { success: true, local: true };
    }
    return { success: false, error: 'Paróquia não encontrada localmente.' };
  }

  async function deleteParish(parish_id) {
    const remote = await _post('deleteParish', { parish_id });
    if (remote && remote.success) return { success: true };

    const parishes = _local(KEYS.PARISHES).filter(p => p.parish_id !== parish_id);
    _saveLocal(KEYS.PARISHES, parishes);
    return { success: true, local: true };
  }

  // ─── CRUD Utilizadores ────────────────────────────────────────────────────
  async function getUsers() {
    const remote = await fetchSheet(CONFIG.SHEETS.USERS);
    const local  = _local(KEYS.USERS);
    return [...remote, ...local].map(u => ({ ...u, password: '••••••' }));
  }

  // Versão interna com password (para login)
  async function _getUsersRaw() {
    const remote = await fetchSheet(CONFIG.SHEETS.USERS);
    const local  = _local(KEYS.USERS);
    return [...remote, ...local];
  }

  async function createUser(data) {
    const user = {
      user_id:      _genId('U'),
      username:     data.username,
      password:     data.password,
      role:         data.role,
      parish_id:    data.parish_id    || 'ALL',
      display_name: data.display_name || data.username,
      status:       'active',
    };
    const remote = await _post('createUser', user);
    if (remote && remote.success) return { success: true };
    if (remote && !remote.success) return remote; // erro do Apps Script (ex: username duplicado)

    // Fallback localStorage
    const users = _local(KEYS.USERS);
    if (users.find(u => u.username === data.username)) return { success: false, error: 'Utilizador já existe' };
    users.push(user);
    _saveLocal(KEYS.USERS, users);
    return { success: true, local: true };
  }

  async function updateUser(user_id, data) {
    const remote = await _post('updateUser', { user_id, ...data });
    if (remote && remote.success) return { success: true };

    const users = _local(KEYS.USERS);
    const idx = users.findIndex(u => u.user_id === user_id);
    if (idx !== -1) {
      if (!data.password) delete data.password;
      users[idx] = { ...users[idx], ...data };
      _saveLocal(KEYS.USERS, users);
      return { success: true, local: true };
    }
    return { success: false, error: 'Utilizador não encontrado localmente.' };
  }

  async function deleteUser(user_id) {
    const remote = await _post('deleteUser', { user_id });
    if (remote && remote.success) return { success: true };

    const users = _local(KEYS.USERS).filter(u => u.user_id !== user_id);
    _saveLocal(KEYS.USERS, users);
    return { success: true, local: true };
  }

  // ─── CRUD Livros ──────────────────────────────────────────────────────────
  async function getBooks() {
    const remote = await fetchSheet(CONFIG.SHEETS.BOOKS);
    const local  = _local(KEYS.BOOKS);
    return [...remote, ...local];
  }

  async function createBook(data) {
    const book = {
      book_id:           _genId('B'),
      book_name:         data.book_name,
      author:            data.author            || '',
      publisher:         data.publisher         || '',
      recommended_stage: data.recommended_stage || '',
      recommended_age:   data.recommended_age   || '',
      year:              data.year              || '',
    };
    const remote = await _post('createBook', book);
    if (remote && remote.success) return { success: true };

    const books = _local(KEYS.BOOKS);
    books.push(book);
    _saveLocal(KEYS.BOOKS, books);
    return { success: true, local: true };
  }

  async function updateBook(book_id, data) {
    const remote = await _post('updateBook', { book_id, ...data });
    if (remote && remote.success) return { success: true };

    const books = _local(KEYS.BOOKS);
    const idx = books.findIndex(b => b.book_id === book_id);
    if (idx !== -1) {
      books[idx] = { ...books[idx], ...data };
      _saveLocal(KEYS.BOOKS, books);
      return { success: true, local: true };
    }
    return { success: false };
  }

  async function deleteBook(book_id) {
    const remote = await _post('deleteBook', { book_id });
    if (remote && remote.success) return { success: true };

    const books = _local(KEYS.BOOKS).filter(b => b.book_id !== book_id);
    _saveLocal(KEYS.BOOKS, books);
    return { success: true, local: true };
  }

  // ─── Dados de demonstração ────────────────────────────────────────────────
  function _demo(sheetName) {
    const d = {
      [CONFIG.SHEETS.PARISHES]: [
        { parish_id:'P001', parish_name:'Paróquia São José', city:'Luanda', coordinator_name:'João Manuel', coordinator_phone:'923000001', coordinator_email:'sjose@vigararia.ao', status:'active' },
        { parish_id:'P002', parish_name:'Paróquia Santa Ana', city:'Viana', coordinator_name:'Maria Lopes', coordinator_phone:'924000002', coordinator_email:'santana@vigararia.ao', status:'active' },
        { parish_id:'P003', parish_name:'Paróquia Santo António', city:'Cacuaco', coordinator_name:'António Silva', coordinator_phone:'925000003', coordinator_email:'stantonio@vigararia.ao', status:'active' },
        { parish_id:'P004', parish_name:'Paróquia Nossa Senhora', city:'Luanda', coordinator_name:'Fátima Costa', coordinator_phone:'926000004', coordinator_email:'nsenhora@vigararia.ao', status:'active' },
      ],
      [CONFIG.SHEETS.USERS]: [
        { user_id:'U001', username:'admin', password:'admin123', role:'admin', parish_id:'ALL', display_name:'Administrador', status:'active' },
        { user_id:'U002', username:'sjose', password:'123456', role:'parish', parish_id:'P001', display_name:'Coord. São José', status:'active' },
        { user_id:'U003', username:'santana', password:'123456', role:'parish', parish_id:'P002', display_name:'Coord. Santa Ana', status:'active' },
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
        { age_id:'A001', age_group:'Crianças',     description:'7–12 anos' },
        { age_id:'A002', age_group:'Adolescentes', description:'13–17 anos' },
        { age_id:'A003', age_group:'Jovens',       description:'18–25 anos' },
        { age_id:'A004', age_group:'Adultos',      description:'26+ anos' },
      ],
      [CONFIG.SHEETS.BOOKS]: [
        { book_id:'B001', book_name:'Caminho da Fé',      author:'CNBB',             publisher:'Paulus',    recommended_stage:'Pré-Catecumenato', recommended_age:'Crianças',     year:'2018' },
        { book_id:'B002', book_name:'Seguidores de Cristo', author:'CNBB',           publisher:'Paulus',    recommended_stage:'1º Catecumenato',  recommended_age:'Jovens',        year:'2019' },
        { book_id:'B003', book_name:'Viver a Fé',         author:'Diocese de Angola', publisher:'Local',   recommended_stage:'2º Catecumenato',  recommended_age:'Adolescentes',  year:'2020' },
        { book_id:'B004', book_name:'Unidos em Cristo',   author:'CEA',              publisher:'CEA Press', recommended_stage:'1º Crisma',        recommended_age:'Adolescentes',  year:'2021' },
      ],
      [CONFIG.SHEETS.RECORDS]: [],
    };
    return d[sheetName] || [];
  }

  function clearCache() {
    Object.keys(CACHE).forEach(k => delete CACHE[k]);
    Object.keys(localStorage).filter(k => k.startsWith('cvs_cache_')).forEach(k => localStorage.removeItem(k));
  }

  // Exporta _getUsersRaw para o auth.js usar
  return {
    fetchSheet, clearCache, _getUsersRaw,
    getRecords, createRecord, updateRecord, deleteRecord,
    getParishes, createParish, updateParish, deleteParish,
    getUsers, createUser, updateUser, deleteUser,
    getBooks, createBook, updateBook, deleteBook,
  };
})();
