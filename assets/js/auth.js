/**
 * auth.js — Autenticação via Supabase Auth
 * Login por username + password (sem email visível para o utilizador)
 * Internamente usa email fictício: username@vigararia.internal
 */
const Auth = (() => {
  const SESSION_KEY = 'cvs_sb_session';
  let _session = null;
  let _profile  = null;

  // ─── Persistência ─────────────────────────────────────────────────────────
  function _saveSession(session, profile) {
    _session = session;
    _profile  = profile;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ session, profile }));
  }

  function _clearSession() {
    _session = null;
    _profile  = null;
    localStorage.removeItem(SESSION_KEY);
  }

  function _loadSession() {
    if (_session && _profile) return true;
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return false;
      const { session, profile } = JSON.parse(stored);
      if (!session?.expires_at) return false;
      if (Date.now() / 1000 > session.expires_at) { _clearSession(); return false; }
      _session = session;
      _profile  = profile;
      return true;
    } catch { return false; }
  }

  // ─── Chamada à API Supabase Auth ──────────────────────────────────────────
  async function _authRequest(endpoint, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
      body:    JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error_description || data.msg || data.message || `Erro ${resp.status}`);
    return data;
  }

  // ─── Busca perfil do utilizador ───────────────────────────────────────────
  async function _fetchProfile(userId, accessToken) {
    const resp = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=*,parish:parishes(id,parish_name)`,
      { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!resp.ok) throw new Error('Não foi possível carregar o perfil.');
    const rows = await resp.json();
    if (!rows.length) throw new Error('Perfil não encontrado. Contacta o administrador.');
    return rows[0];
  }

  // ─── Login por username ───────────────────────────────────────────────────
  async function login(username, password) {
    try {
      // Converte username para email interno — o utilizador nunca sabe
      const email = CONFIG.usernameToEmail(username);

      const data = await _authRequest('token?grant_type=password', { email, password });
      const profile = await _fetchProfile(data.user.id, data.access_token);

      if (profile.status !== 'active') {
        return { success: false, error: 'Conta inactiva. Contacta o administrador.' };
      }

      _saveSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at || (Math.floor(Date.now()/1000) + (data.expires_in || 3600)),
        user_id:       data.user.id,
      }, profile);

      return { success: true, user: profile };

    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      const isInvalid = err.message.toLowerCase().includes('invalid') || err.message.includes('400');
      return {
        success: false,
        error: isInvalid ? 'Utilizador ou senha incorrectos.' : err.message,
      };
    }
  }

  // ─── Logout ───────────────────────────────────────────────────────────────
  async function logout() {
    try {
      if (_session?.access_token) {
        await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST',
          headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${_session.access_token}` },
        });
      }
    } catch(e) {}
    _clearSession();
    window.location.href = 'index.html';
  }

  // ─── Refresh automático ───────────────────────────────────────────────────
  async function _refresh() {
    if (!_session?.refresh_token) return false;
    const secsLeft = _session.expires_at - Math.floor(Date.now()/1000);
    if (secsLeft > 300) return true;
    try {
      const data = await _authRequest('token?grant_type=refresh_token', { refresh_token: _session.refresh_token });
      const profile = await _fetchProfile(data.user.id, data.access_token);
      _saveSession({
        ..._session,
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    Math.floor(Date.now()/1000) + (data.expires_in || 3600),
      }, profile);
      return true;
    } catch(e) { _clearSession(); return false; }
  }

  setInterval(_refresh, 4 * 60 * 1000);

  // ─── API pública ──────────────────────────────────────────────────────────
  function getAccessToken() { _loadSession(); return _session?.access_token || CONFIG.SUPABASE_ANON_KEY; }
  function getCurrentUser()  { _loadSession(); return _profile || null; }
  function isAuthenticated() { return _loadSession(); }
  function isAdmin()         { const u = getCurrentUser(); return u?.role === CONFIG.ROLES.ADMIN; }
  function canAccessParish(parish_id) {
    const u = getCurrentUser();
    return u && (u.role === CONFIG.ROLES.ADMIN || u.parish_id === parish_id);
  }
  function requireAuth(role = null) {
    if (!isAuthenticated()) { window.location.href = 'index.html'; return false; }
    const u = getCurrentUser();
    if (role && u.role !== role && u.role !== CONFIG.ROLES.ADMIN) { window.location.href = 'index.html'; return false; }
    return true;
  }

  return { login, logout, getAccessToken, getCurrentUser, isAuthenticated, isAdmin, canAccessParish, requireAuth };
})();
