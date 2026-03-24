/**
 * api.js — Cliente Supabase REST API
 */
const API = (() => {

  function _headers(extra = {}) {
    return { 'Content-Type':'application/json', 'apikey':CONFIG.SUPABASE_ANON_KEY, 'Authorization':`Bearer ${Auth.getAccessToken()}`, ...extra };
  }

  async function _get(table, params = '') {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}${params}`, { headers: _headers({'Accept':'application/json'}) });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.message||`GET ${table}: ${resp.status}`); }
    return resp.json();
  }

  async function _post(table, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
      method:'POST', headers:_headers({'Prefer':'return=representation'}), body:JSON.stringify(body)
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.message||`POST ${table}: ${resp.status}`); }
    return resp.json();
  }

  async function _patch(table, id, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method:'PATCH', headers:_headers({'Prefer':'return=representation'}), body:JSON.stringify(body)
    });
    if (!resp.ok) { const e = await resp.json().catch(()=>({})); throw new Error(e.message||`PATCH ${table}: ${resp.status}`); }
    return resp.json();
  }

  async function _delete(table, id) {
    console.log(`[API] DELETE ${table} id=`, id, typeof id);
    if (!id || String(id).trim() === '') {
      throw new Error('ID inválido ou vazio — não é possível eliminar');
    }
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    const resp = await fetch(url, { method:'DELETE', headers:_headers() });
    if (!resp.ok) {
      const e = await resp.json().catch(()=>({}));
      console.error('[API] DELETE erro:', e);
      throw new Error(e.message || e.hint || `DELETE ${table}: ${resp.status}`);
    }
    return { success: true };
  }

  async function _safe(fn) {
    try { return { success:true, data: await fn() }; }
    catch(err) { console.error('[API]', err.message); Toast.show(err.message,'error'); return { success:false, error:err.message }; }
  }

  // ─── Etapas ────────────────────────────────────────────────────────────────
  async function getStages() { return _get('catechesis_stages','?order=sort_order.asc'); }

  // ─── Faixas etárias ────────────────────────────────────────────────────────
  async function getAgeGroups() { return _get('age_groups','?order=age_group.asc'); }
  async function createAgeGroup(data) { return _safe(()=>_post('age_groups',{ age_group:data.age_group, description:data.description||null })); }
  async function updateAgeGroup(id,data) { return _safe(()=>_patch('age_groups',id,{ age_group:data.age_group, description:data.description||null })); }
  async function deleteAgeGroup(id) { return _safe(()=>_delete('age_groups',id)); }

  // ─── Paróquias ────────────────────────────────────────────────────────────
  async function getParishes() { return _get('parishes','?order=parish_name.asc'); }
  async function createParish(data) { return _safe(()=>_post('parishes',{ parish_name:data.parish_name, city:data.city||null, coordinator_name:data.coordinator_name||null, coordinator_phone:data.coordinator_phone||null, coordinator_email:data.coordinator_email||null, status:data.status||'active' })); }
  async function updateParish(id,data) { return _safe(()=>_patch('parishes',id,{ parish_name:data.parish_name, city:data.city||null, coordinator_name:data.coordinator_name||null, coordinator_phone:data.coordinator_phone||null, coordinator_email:data.coordinator_email||null, status:data.status })); }
  async function deleteParish(id) { return _safe(()=>_delete('parishes',id)); }

  // ─── Livros ───────────────────────────────────────────────────────────────
  async function getBooks() { return _get('books','?order=book_name.asc'); }
  async function createBook(data) { return _safe(()=>_post('books',{ book_name:data.book_name, author:data.author||null, publisher:data.publisher||null, recommended_stage:data.recommended_stage||null, recommended_age:data.recommended_age||null, year:data.year||null })); }
  async function updateBook(id,data) { return _safe(()=>_patch('books',id,{ book_name:data.book_name, author:data.author||null, publisher:data.publisher||null, recommended_stage:data.recommended_stage||null, recommended_age:data.recommended_age||null, year:data.year||null })); }
  async function deleteBook(id) { return _safe(()=>_delete('books',id)); }

  // ─── Registos ─────────────────────────────────────────────────────────────
  async function getRecords(parish_id = null) {
    let p = '?select=*,parish:parishes(id,parish_name),stage:catechesis_stages(id,stage_name),age:age_groups(id,age_group)&order=created_at.desc';
    if (parish_id) p += `&parish_id=eq.${parish_id}`;
    return _get('catechesis_records', p);
  }

  // Verifica duplicados antes de criar
  async function checkDuplicate(parish_id, stage_id, age_id, book_name) {
    const params = `?parish_id=eq.${parish_id}&stage_id=eq.${stage_id}&age_id=eq.${age_id}&book_name=ilike.${encodeURIComponent(book_name)}&select=id`;
    const rows = await _get('catechesis_records', params);
    return rows.length > 0;
  }

  async function createRecord(data) {
    const user = Auth.getCurrentUser();
    // Verificação de duplicado
    const isDup = await checkDuplicate(data.parish_id, data.stage_id, data.age_id, data.book_name);
    if (isDup) {
      Toast.show('Já existe um registo com esta paróquia, etapa, faixa etária e livro.', 'warning');
      return { success:false, error:'Registo duplicado' };
    }
    return _safe(()=>_post('catechesis_records',{
      parish_id:data.parish_id, stage_id:data.stage_id||null, age_id:data.age_id||null,
      book_name:data.book_name, author:data.author||null, publisher:data.publisher||null,
      year:data.year||null, notes:data.notes||null, status:'submitted', created_by:user.id,
    }));
  }

  async function updateRecord(id,data) {
    return _safe(()=>_patch('catechesis_records',id,{
      ...(data.parish_id  !== undefined && { parish_id:data.parish_id }),
      ...(data.stage_id   !== undefined && { stage_id:data.stage_id }),
      ...(data.age_id     !== undefined && { age_id:data.age_id }),
      ...(data.book_name  !== undefined && { book_name:data.book_name }),
      ...(data.author     !== undefined && { author:data.author }),
      ...(data.publisher  !== undefined && { publisher:data.publisher }),
      ...(data.year       !== undefined && { year:data.year }),
      ...(data.notes      !== undefined && { notes:data.notes }),
      ...(data.status     !== undefined && { status:data.status }),
    }));
  }

  async function deleteRecord(id) { return _safe(()=>_delete('catechesis_records',id)); }

  // ─── Utilizadores ─────────────────────────────────────────────────────────
  async function getUsers() { return _get('user_profiles','?select=*,parish:parishes(id,parish_name)&order=username.asc'); }
  async function updateUserProfile(id,data) {
    return _safe(()=>_patch('user_profiles',id,{ display_name:data.display_name||null, role:data.role, parish_id:data.parish_id||null, status:data.status }));
  }
  async function createUser(data) {
    const email = CONFIG.usernameToEmail(data.username);
    const signupResp = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/signup`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey':CONFIG.SUPABASE_ANON_KEY},
      body:JSON.stringify({ email, password:data.password }),
    });
    const signupData = await signupResp.json();
    if (!signupResp.ok) {
      const msg = signupData.msg||signupData.message||signupData.error_description||'Erro ao criar conta';
      Toast.show(msg,'error'); return { success:false, error:msg };
    }
    const userId = signupData.user?.id||signupData.id;
    if (!userId) {
      Toast.show('Desactiva "Confirm email" em Authentication → Providers → Email no Supabase','warning');
      return { success:false, error:'Confirm email activo' };
    }
    await _post('user_profiles',{ id:userId, username:data.username.toLowerCase().trim(), display_name:data.display_name||data.username, role:data.role||'parish', parish_id:data.parish_id||null, status:'active' });
    return { success:true, user_id:userId };
  }

  return {
    getStages,
    getAgeGroups, createAgeGroup, updateAgeGroup, deleteAgeGroup,
    getParishes,  createParish,  updateParish,  deleteParish,
    getBooks,     createBook,    updateBook,    deleteBook,
    getRecords,   createRecord,  updateRecord,  deleteRecord,
    getUsers,     createUser,    updateUserProfile,
  };
})();
