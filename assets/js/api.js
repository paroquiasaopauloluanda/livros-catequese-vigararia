/**
 * api.js — Cliente Supabase
 * Todas as operações de leitura e escrita via REST API do Supabase
 * Documentação: https://supabase.com/docs/reference/javascript
 */
const API = (() => {

  // ─── Cliente HTTP base ────────────────────────────────────────────────────
  function _headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${Auth.getAccessToken()}`,
      ...extra,
    };
  }

  async function _get(table, params = '') {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}${params}`;
    const resp = await fetch(url, { headers: _headers({ 'Accept': 'application/json' }) });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `GET ${table} falhou: ${resp.status}`);
    }
    return resp.json();
  }

  async function _post(table, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
      method:  'POST',
      headers: _headers({ 'Prefer': 'return=representation' }),
      body:    JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `POST ${table} falhou: ${resp.status}`);
    }
    return resp.json();
  }

  async function _patch(table, id, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:  'PATCH',
      headers: _headers({ 'Prefer': 'return=representation' }),
      body:    JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `PATCH ${table} falhou: ${resp.status}`);
    }
    return resp.json();
  }

  async function _delete(table, id) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:  'DELETE',
      headers: _headers(),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `DELETE ${table} falhou: ${resp.status}`);
    }
    return { success: true };
  }

  // ─── Wrapper com tratamento de erro uniforme ──────────────────────────────
  async function _safe(fn) {
    try {
      const result = await fn();
      return { success: true, data: result };
    } catch (err) {
      console.error('[API]', err.message);
      Toast.show(err.message, 'error');
      return { success: false, error: err.message };
    }
  }

  // ─── Etapas e Faixas etárias (referência, sem CRUD) ──────────────────────
  async function getStages() {
    return _get('catechesis_stages', '?order=sort_order.asc');
  }

  async function getAgeGroups() {
    return _get('age_groups', '?order=age_group.asc');
  }

  // ─── Paróquias ────────────────────────────────────────────────────────────
  async function getParishes() {
    return _get('parishes', '?order=parish_name.asc');
  }

  async function createParish(data) {
    return _safe(() => _post('parishes', {
      parish_name:       data.parish_name,
      city:              data.city              || null,
      coordinator_name:  data.coordinator_name  || null,
      coordinator_phone: data.coordinator_phone || null,
      coordinator_email: data.coordinator_email || null,
      status:            data.status            || 'active',
    }));
  }

  async function updateParish(id, data) {
    return _safe(() => _patch('parishes', id, {
      parish_name:       data.parish_name,
      city:              data.city              || null,
      coordinator_name:  data.coordinator_name  || null,
      coordinator_phone: data.coordinator_phone || null,
      coordinator_email: data.coordinator_email || null,
      status:            data.status,
    }));
  }

  async function deleteParish(id) {
    return _safe(() => _delete('parishes', id));
  }

  // ─── Livros ───────────────────────────────────────────────────────────────
  async function getBooks() {
    return _get('books', '?order=book_name.asc');
  }

  async function createBook(data) {
    return _safe(() => _post('books', {
      book_name:         data.book_name,
      author:            data.author            || null,
      publisher:         data.publisher         || null,
      recommended_stage: data.recommended_stage || null,
      recommended_age:   data.recommended_age   || null,
      year:              data.year              || null,
    }));
  }

  async function updateBook(id, data) {
    return _safe(() => _patch('books', id, {
      book_name:         data.book_name,
      author:            data.author            || null,
      publisher:         data.publisher         || null,
      recommended_stage: data.recommended_stage || null,
      recommended_age:   data.recommended_age   || null,
      year:              data.year              || null,
    }));
  }

  async function deleteBook(id) {
    return _safe(() => _delete('books', id));
  }

  // ─── Registos ─────────────────────────────────────────────────────────────
  async function getRecords(parish_id = null) {
    // Faz join com parishes e stages para ter os nomes directamente
    let params = '?select=*,parish:parishes(id,parish_name),stage:catechesis_stages(id,stage_name),age:age_groups(id,age_group)&order=created_at.desc';
    if (parish_id) params += `&parish_id=eq.${parish_id}`;
    return _get('catechesis_records', params);
  }

  async function createRecord(data) {
    const user = Auth.getCurrentUser();
    return _safe(() => _post('catechesis_records', {
      parish_id:  data.parish_id,
      stage_id:   data.stage_id   || null,
      age_id:     data.age_id     || null,
      book_name:  data.book_name,
      author:     data.author     || null,
      publisher:  data.publisher  || null,
      year:       data.year       || null,
      notes:      data.notes      || null,
      status:     'submitted',
      created_by: user.id,
    }));
  }

  async function updateRecord(id, data) {
    return _safe(() => _patch('catechesis_records', id, {
      ...(data.parish_id  && { parish_id: data.parish_id }),
      ...(data.stage_id   && { stage_id:  data.stage_id  }),
      ...(data.age_id     && { age_id:    data.age_id    }),
      ...(data.book_name  && { book_name: data.book_name }),
      author:    data.author    ?? null,
      publisher: data.publisher ?? null,
      year:      data.year      ?? null,
      notes:     data.notes     ?? null,
      ...(data.status     && { status: data.status }),
    }));
  }

  async function deleteRecord(id) {
    return _safe(() => _delete('catechesis_records', id));
  }

  // ─── Utilizadores (perfis) ────────────────────────────────────────────────
  async function getUsers() {
    return _get('user_profiles', '?select=*,parish:parishes(id,parish_name)&order=username.asc');
  }

  async function updateUserProfile(id, data) {
    return _safe(() => _patch('user_profiles', id, {
      display_name: data.display_name || null,
      role:         data.role,
      parish_id:    data.parish_id    || null,
      status:       data.status,
    }));
  }

  // Criar utilizador requer a service_role key (segurança).
  // Em vez disso, o admin faz "invite" pelo Supabase Dashboard,
  // e o perfil é criado aqui depois.
  async function createUserProfile(userId, data) {
    return _safe(() => _post('user_profiles', {
      id:           userId,
      username:     data.username,
      display_name: data.display_name || data.username,
      role:         data.role,
      parish_id:    data.parish_id    || null,
      status:       'active',
    }));
  }

  return {
    getStages, getAgeGroups,
    getParishes, createParish, updateParish, deleteParish,
    getBooks,   createBook,   updateBook,   deleteBook,
    getRecords, createRecord, updateRecord, deleteRecord,
    getUsers,   updateUserProfile, createUserProfile,
  };
})();
