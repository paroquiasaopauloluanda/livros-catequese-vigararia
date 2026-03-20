/**
 * api.js — Integração com Google Sheets
 * Lê dados via endpoint gviz/tq (leitura pública)
 * Escrita via localStorage (CRUD local persistente)
 */
const API = (() => {
  const CACHE = {};
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  // ─── Verifica se o Spreadsheet ID está configurado ───────────────────────
  function _isConfigured() {
    return CONFIG.SPREADSHEET_ID &&
           CONFIG.SPREADSHEET_ID !== '1eMk0WvkFbsj3knT3WnnGJNK1uyT1FyA-Y98Km7RPF3A' &&
           CONFIG.SPREADSHEET_ID.length > 10;
  }

  // ─── Parser do formato gviz/tq ───────────────────────────────────────────
  // O gviz/tq envolve a resposta em: google.visualization.Query.setResponse({...})
  //
  // PROBLEMA COMUM: quando o Google Sheets não reconhece a primeira linha como
  // cabeçalhos, as colunas ficam com label "A", "B", "C"... em vez dos nomes reais.
  // SOLUÇÃO: se os labels forem letras simples (A-Z), significa que o gviz não leu
  // os cabeçalhos — nesse caso usamos a PRIMEIRA LINHA dos dados como cabeçalhos.
  function _parseGvizResponse(raw) {
    // Remove o wrapper JSONP de forma robusta
    const json = raw
      .replace(/^\s*\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*/, '')
      .replace(/^[^(]*\(/, '')
      .replace(/\);\s*$/, '')
      .trim();

    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      console.error('[API] Falha ao fazer parse do gviz JSON:', e, '\nRaw (primeiros 300):', raw.slice(0, 300));
      return [];
    }

    if (!data.table) { console.warn('[API] Resposta sem tabela:', data); return []; }
    if (!data.table.rows || data.table.rows.length === 0) { return []; }

    // ── Detecta se os labels são apenas letras de coluna (A, B, C...)
    // Isso indica que o gviz não reconheceu os cabeçalhos da sheet
    const rawCols = data.table.cols.map(c => (c.label && c.label.trim()) ? c.label.trim() : (c.id || ''));
    const looksLikeLetters = rawCols.every(l => /^[A-Z]{1,3}$/.test(l));

    let cols;
    let rows = data.table.rows.filter(row => row && row.c && row.c.some(cell => cell && cell.v !== null && cell.v !== ''));

    if (looksLikeLetters && rows.length > 0) {
      // A primeira linha de dados contém os cabeçalhos reais
      const headerRow = rows[0];
      cols = headerRow.c.map(cell => (cell && cell.v) ? String(cell.v).trim() : '');
      rows = rows.slice(1); // resto são os dados
      console.log('[API] Cabeçalhos lidos da primeira linha de dados:', cols);
    } else {
      cols = rawCols;
      console.log('[API] Cabeçalhos lidos dos metadados do gviz:', cols);
    }

    const result = rows.map(row => {
      const obj = {};
      cols.forEach((col, i) => {
        if (!col) return; // ignora colunas sem nome
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

    console.log(`[API] ${result.length} linhas parseadas. Exemplo:`, result[0] || '(vazio)');
    return result;
  }

  // ─── Fetch de uma sheet ───────────────────────────────────────────────────
  async function fetchSheet(sheetName, forceRefresh = false) 
    console.log("CONFIG.SPREADSHEET_ID",CONFIG.SPREADSHEET_ID);{
    // Se não está configurado, usa dados de demo directamente
    if (!_isConfigured()) {
      console.info(`[API] Spreadsheet ID não configurado — a usar dados de demonstração para "${sheetName}"`);
      return _getDemoData(sheetName);
    }

    const cacheKey = `sheet_${sheetName}`;
    const now = Date.now();

    // Cache em memória
    if (!forceRefresh && CACHE[cacheKey] && (now - CACHE[cacheKey].ts) < CACHE_TTL) {
      return CACHE[cacheKey].data;
    }

    // Cache em localStorage
    if (!forceRefresh) {
      const lsCached = localStorage.getItem(`cvs_cache_${sheetName}`);
      if (lsCached) {
        try {
          const { ts, data } = JSON.parse(lsCached);
          if ((now - ts) < CACHE_TTL) {
            CACHE[cacheKey] = { ts, data };
            return data;
          }
        } catch (e) { /* cache corrompido, ignora */ }
      }
    }

    // Tenta o endpoint gviz/tq
    const url = `${CONFIG.SHEETS_BASE}${encodeURIComponent(sheetName)}`;
    console.log(`[API] A buscar sheet "${sheetName}" em:`, url);

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      const data = _parseGvizResponse(text);

      // Guarda em cache
      CACHE[cacheKey] = { ts: now, data };
      localStorage.setItem(`cvs_cache_${sheetName}`, JSON.stringify({ ts: now, data }));

      return data;

    } catch (err) {
      console.warn(`[API] Falha ao buscar ${sheetName}, a usar cache offline:`, err);

      // Fallback: localStorage offline
      const lsCached = localStorage.getItem(`cvs_cache_${sheetName}`);
      if (lsCached) {
        const { data } = JSON.parse(lsCached);
        Toast.show('A usar dados em cache (modo offline)', 'warning');
        return data;
      }

      // Fallback final: dados de demonstração
      return _getDemoData(sheetName);
    }
  }

  // ─── Escrita via localStorage (simula escrita no Sheets) ─────────────────
  // NOTA: Para escrita real, substituir por fetch() para um Google Apps Script
  const LOCAL_RECORDS_KEY = 'cvs_local_records';
  const LOCAL_PARISHES_KEY = 'cvs_local_parishes';
  const LOCAL_USERS_KEY    = 'cvs_local_users';
  const LOCAL_BOOKS_KEY    = 'cvs_local_books';

  function _getLocalData(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  }

  function _saveLocalData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    // Invalida cache de memória
    const sheetMap = {
      [LOCAL_RECORDS_KEY]:  CONFIG.SHEETS.RECORDS,
      [LOCAL_PARISHES_KEY]: CONFIG.SHEETS.PARISHES,
      [LOCAL_USERS_KEY]:    CONFIG.SHEETS.USERS,
      [LOCAL_BOOKS_KEY]:    CONFIG.SHEETS.BOOKS,
    };
    const sheet = sheetMap[key];
    if (sheet) delete CACHE[`sheet_${sheet}`];
  }

  function _generateId(prefix) {
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }

  // ─── CRUD Registos ────────────────────────────────────────────────────────
  async function getRecords(parish_id = null) {
    let records = await fetchSheet(CONFIG.SHEETS.RECORDS);
    const local  = _getLocalData(LOCAL_RECORDS_KEY);
    const merged = [...records, ...local];

    return parish_id
      ? merged.filter(r => r.parish_id === parish_id)
      : merged;
  }

  async function createRecord(data) {
    const user    = Auth.getCurrentUser();
    const records = _getLocalData(LOCAL_RECORDS_KEY);

    const newRecord = {
      record_id:  _generateId('R'),
      parish_id:  data.parish_id || user.parish_id,
      stage_id:   data.stage_id,
      age_id:     data.age_id,
      book_name:  data.book_name,
      author:     data.author || '',
      publisher:  data.publisher || '',
      year:       data.year || '',
      notes:      data.notes || '',
      status:     CONFIG.STATUS.SUBMITTED,
      created_by: user.username,
      created_at: new Date().toLocaleDateString('pt-AO'),
      updated_at: new Date().toLocaleDateString('pt-AO'),
    };

    records.push(newRecord);
    _saveLocalData(LOCAL_RECORDS_KEY, records);
    return { success: true, record: newRecord };
  }

  async function updateRecord(record_id, data) {
    const user    = Auth.getCurrentUser();
    let   records = _getLocalData(LOCAL_RECORDS_KEY);
    const idx     = records.findIndex(r => r.record_id === record_id);

    if (idx !== -1) {
      records[idx] = { ...records[idx], ...data, updated_at: new Date().toLocaleDateString('pt-AO'), updated_by: user.username };
      _saveLocalData(LOCAL_RECORDS_KEY, records);
      return { success: true };
    }

    // Se não está no local, é da sheet remota — precisa de Apps Script para editar
    Toast.show('Registo remoto — edição requer configuração do Apps Script', 'warning');
    return { success: false, error: 'Registo remoto não editável neste modo' };
  }

  async function deleteRecord(record_id) {
    let records = _getLocalData(LOCAL_RECORDS_KEY);
    const before = records.length;
    records = records.filter(r => r.record_id !== record_id);

    if (records.length < before) {
      _saveLocalData(LOCAL_RECORDS_KEY, records);
      return { success: true };
    }

    Toast.show('Registo remoto — eliminação requer configuração do Apps Script', 'warning');
    return { success: false };
  }

  // ─── CRUD Paróquias ───────────────────────────────────────────────────────
  async function getParishes() {
    const remote = await fetchSheet(CONFIG.SHEETS.PARISHES);
    const local  = _getLocalData(LOCAL_PARISHES_KEY);
    return [...remote, ...local];
  }

  async function createParish(data) {
    const parishes = _getLocalData(LOCAL_PARISHES_KEY);
    const newParish = {
      parish_id:         _generateId('P'),
      parish_name:       data.parish_name,
      city:              data.city || '',
      coordinator_name:  data.coordinator_name || '',
      coordinator_phone: data.coordinator_phone || '',
      coordinator_email: data.coordinator_email || '',
      status:            'active',
    };
    parishes.push(newParish);
    _saveLocalData(LOCAL_PARISHES_KEY, parishes);
    return { success: true, parish: newParish };
  }

  async function updateParish(parish_id, data) {
    let parishes = _getLocalData(LOCAL_PARISHES_KEY);
    const idx = parishes.findIndex(p => p.parish_id === parish_id);
    if (idx !== -1) {
      parishes[idx] = { ...parishes[idx], ...data };
      _saveLocalData(LOCAL_PARISHES_KEY, parishes);
      return { success: true };
    }
    return { success: false, error: 'Paróquia remota não editável neste modo' };
  }

  async function deleteParish(parish_id) {
    let parishes = _getLocalData(LOCAL_PARISHES_KEY);
    parishes = parishes.filter(p => p.parish_id !== parish_id);
    _saveLocalData(LOCAL_PARISHES_KEY, parishes);
    return { success: true };
  }

  // ─── CRUD Utilizadores ────────────────────────────────────────────────────
  async function getUsers() {
    const remote = await fetchSheet(CONFIG.SHEETS.USERS);
    const local  = _getLocalData(LOCAL_USERS_KEY);
    return [...remote, ...local].map(u => ({ ...u, password: '••••••' }));
  }

  async function createUser(data) {
    const users = _getLocalData(LOCAL_USERS_KEY);
    const newUser = {
      user_id:      _generateId('U'),
      username:     data.username,
      password:     data.password,
      role:         data.role,
      parish_id:    data.parish_id || 'ALL',
      display_name: data.display_name || data.username,
      status:       'active',
    };
    users.push(newUser);
    _saveLocalData(LOCAL_USERS_KEY, users);
    return { success: true };
  }

  async function updateUser(user_id, data) {
    let users = _getLocalData(LOCAL_USERS_KEY);
    const idx = users.findIndex(u => u.user_id === user_id);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...data };
      _saveLocalData(LOCAL_USERS_KEY, users);
      return { success: true };
    }
    return { success: false };
  }

  async function deleteUser(user_id) {
    let users = _getLocalData(LOCAL_USERS_KEY);
    users = users.filter(u => u.user_id !== user_id);
    _saveLocalData(LOCAL_USERS_KEY, users);
    return { success: true };
  }

  // ─── CRUD Livros ──────────────────────────────────────────────────────────
  async function getBooks() {
    const remote = await fetchSheet(CONFIG.SHEETS.BOOKS);
    const local  = _getLocalData(LOCAL_BOOKS_KEY);
    return [...remote, ...local];
  }

  async function createBook(data) {
    const books = _getLocalData(LOCAL_BOOKS_KEY);
    const newBook = {
      book_id:           _generateId('B'),
      book_name:         data.book_name,
      author:            data.author || '',
      publisher:         data.publisher || '',
      recommended_stage: data.recommended_stage || '',
      recommended_age:   data.recommended_age || '',
      year:              data.year || '',
    };
    books.push(newBook);
    _saveLocalData(LOCAL_BOOKS_KEY, books);
    return { success: true };
  }

  async function updateBook(book_id, data) {
    let books = _getLocalData(LOCAL_BOOKS_KEY);
    const idx = books.findIndex(b => b.book_id === book_id);
    if (idx !== -1) {
      books[idx] = { ...books[idx], ...data };
      _saveLocalData(LOCAL_BOOKS_KEY, books);
      return { success: true };
    }
    return { success: false };
  }

  async function deleteBook(book_id) {
    let books = _getLocalData(LOCAL_BOOKS_KEY);
    books = books.filter(b => b.book_id !== book_id);
    _saveLocalData(LOCAL_BOOKS_KEY, books);
    return { success: true };
  }

  // ─── Dados de demonstração ────────────────────────────────────────────────
  function _getDemoData(sheetName) {
    const demo = {
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
        { user_id:'U004', username:'stantonio', password:'123456', role:'parish', parish_id:'P003', display_name:'Coord. Santo António', status:'active' },
      ],
      [CONFIG.SHEETS.STAGES]: [
        { stage_id:'S001', stage_name:'Pré-Catecumenato', category:'Catecumenato', order:1 },
        { stage_id:'S002', stage_name:'1º Catecumenato', category:'Catecumenato', order:2 },
        { stage_id:'S003', stage_name:'2º Catecumenato', category:'Catecumenato', order:3 },
        { stage_id:'S004', stage_name:'3º Catecumenato', category:'Catecumenato', order:4 },
        { stage_id:'S005', stage_name:'1º Crisma', category:'Crisma', order:5 },
        { stage_id:'S006', stage_name:'2º Crisma', category:'Crisma', order:6 },
        { stage_id:'S007', stage_name:'Intensivo', category:'Especial', order:7 },
      ],
      [CONFIG.SHEETS.AGE_GROUPS]: [
        { age_id:'A001', age_group:'Crianças', description:'7–12 anos' },
        { age_id:'A002', age_group:'Adolescentes', description:'13–17 anos' },
        { age_id:'A003', age_group:'Jovens', description:'18–25 anos' },
        { age_id:'A004', age_group:'Adultos', description:'26+ anos' },
      ],
      [CONFIG.SHEETS.BOOKS]: [
        { book_id:'B001', book_name:'Caminho da Fé', author:'CNBB', publisher:'Paulus', recommended_stage:'Pré-Catecumenato', recommended_age:'Crianças', year:'2018' },
        { book_id:'B002', book_name:'Seguidores de Cristo', author:'CNBB', publisher:'Paulus', recommended_stage:'1º Catecumenato', recommended_age:'Jovens', year:'2019' },
        { book_id:'B003', book_name:'Viver a Fé', author:'Diocese de Angola', publisher:'Local', recommended_stage:'2º Catecumenato', recommended_age:'Adolescentes', year:'2020' },
        { book_id:'B004', book_name:'Unidos em Cristo', author:'CEA', publisher:'CEA Press', recommended_stage:'1º Crisma', recommended_age:'Adolescentes', year:'2021' },
      ],
      [CONFIG.SHEETS.RECORDS]: [
        { record_id:'R001', parish_id:'P001', stage_id:'S001', age_id:'A001', book_name:'Caminho da Fé', author:'CNBB', publisher:'Paulus', year:'2018', notes:'Usado há 3 anos', status:'submitted', created_at:'2026-01-10' },
        { record_id:'R002', parish_id:'P001', stage_id:'S002', age_id:'A002', book_name:'Seguidores de Cristo', author:'CNBB', publisher:'Paulus', year:'2019', notes:'', status:'submitted', created_at:'2026-01-10' },
        { record_id:'R003', parish_id:'P002', stage_id:'S001', age_id:'A001', book_name:'Caminho da Fé', author:'CNBB', publisher:'Paulus', year:'2018', notes:'Mesma editora', status:'submitted', created_at:'2026-01-15' },
        { record_id:'R004', parish_id:'P002', stage_id:'S003', age_id:'A002', book_name:'Viver a Fé', author:'Diocese', publisher:'Local', year:'2020', notes:'Livro diocesano', status:'submitted', created_at:'2026-01-15' },
        { record_id:'R005', parish_id:'P003', stage_id:'S001', age_id:'A001', book_name:'Iniciação Cristã', author:'CEA', publisher:'CEA Press', year:'2017', notes:'Livro antigo', status:'submitted', created_at:'2026-02-05' },
        { record_id:'R006', parish_id:'P003', stage_id:'S005', age_id:'A002', book_name:'Unidos em Cristo', author:'CEA', publisher:'CEA Press', year:'2021', notes:'', status:'confirmed', created_at:'2026-02-05' },
        { record_id:'R007', parish_id:'P004', stage_id:'S001', age_id:'A001', book_name:'Caminho da Fé', author:'CNBB', publisher:'Paulus', year:'2018', notes:'', status:'submitted', created_at:'2026-02-20' },
        { record_id:'R008', parish_id:'P004', stage_id:'S006', age_id:'A002', book_name:'Unidos em Cristo', author:'CEA', publisher:'CEA Press', year:'2021', notes:'Aprovado pelo padre', status:'confirmed', created_at:'2026-02-20' },
      ],
    };
    return demo[sheetName] || [];
  }

  // ─── Utilitários ──────────────────────────────────────────────────────────
  function clearCache() {
    Object.keys(CACHE).forEach(k => delete CACHE[k]);
    Object.keys(localStorage)
      .filter(k => k.startsWith('cvs_cache_'))
      .forEach(k => localStorage.removeItem(k));
  }

  return {
    fetchSheet, clearCache,
    getRecords, createRecord, updateRecord, deleteRecord,
    getParishes, createParish, updateParish, deleteParish,
    getUsers, createUser, updateUser, deleteUser,
    getBooks, createBook, updateBook, deleteBook,
  };
})();
