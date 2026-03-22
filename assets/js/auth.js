/**
 * auth.js — Autenticação via Supabase Auth
 * Usa email + password com JWT tokens
 */
const Auth = (() => {
  const SESSION_KEY = 'cvs_sb_session';
  let _session = null;
  let _profile  = null;

  // ─── Persistência de sessão ───────────────────────────────────────────────
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
    if (_session) return true;
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return false;
      const { session, profile } = JSON.parse(stored);
      // Verifica expiração do JWT
      if (!session || !session.expires_at) return false;
      if (Date.now() / 1000 > session.expires_at) {
        _clearSession();
        return false;
      }
      _session = session;
      _profile  = profile;
      return true;
    } catch { return false; }
  }

  // ─── Chamada directa à API Supabase Auth ──────────────────────────────────
  async function _authRequest(endpoint, body) {
    const resp = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${endpoint}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error_description || data.msg || `Auth error: ${resp.status}`);
    return data;
  }

  // ─── Busca o perfil do utilizador ─────────────────────────────────────────
  async function _fetchProfile(userId, accessToken) {
    const resp = await fetch(
      `${CONFIG.SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}&select=*,parish:parishes(id,parish_name)`,
      {
        headers: {
          'apikey':        CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    if (!resp.ok) throw new Error('Não foi possível carregar o perfil do utilizador');
    const rows = await resp.json();
    if (!rows.length) throw new Error('Perfil não encontrado. Contacta o administrador.');
    return rows[0];
  }

  // ─── API pública ──────────────────────────────────────────────────────────
  async function login(email, password) {
    try {
      const data = await _authRequest('token?grant_type=password', { email, password });
      const profile = await _fetchProfile(data.user.id, data.access_token);

      if (profile.status !== 'active') {
        return { success: false, error: 'Conta inactiva. Contacta o administrador.' };
      }

      _saveSession({
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    data.expires_at || (Math.floor(Date.now()/1000) + data.expires_in),
        user_id:       data.user.id,
        email:         data.user.email,
      }, profile);

      return { success: true, user: profile };
    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      const msg = err.message.includes('Invalid login') || err.message.includes('invalid')
        ? 'Email ou senha incorrectos.'
        : err.message;
      return { success: false, error: msg };
    }
  }

  async function logout() {
    try {
      if (_session?.access_token) {
        await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/logout`, {
          method:  'POST',
          headers: {
            'apikey':        CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${_session.access_token}`,
          },
        });
      }
    } catch(e) {}
    _clearSession();
    window.location.href = 'index.html';
  }

  // ─── Refresh automático do token ──────────────────────────────────────────
  async function _refreshIfNeeded() {
    if (!_session) return false;
    const expiresIn = _session.expires_at - Math.floor(Date.now() / 1000);
    if (expiresIn > 300) return true; // ainda válido por mais de 5 min

    try {
      const data = await _authRequest('token?grant_type=refresh_token', {
        refresh_token: _session.refresh_token,
      });
      const profile = await _fetchProfile(data.user.id, data.access_token);
      _saveSession({
        ..._session,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now()/1000) + data.expires_in,
      }, profile);
      return true;
    } catch(e) {
      console.warn('[Auth] Refresh falhou:', e.message);
      _clearSession();
      return false;
    }
  }

  function getAccessToken() {
    _loadSession();
    return _session?.access_token || CONFIG.SUPABASE_ANON_KEY;
  }

  function getCurrentUser() {
    _loadSession();
    return _profile || null;
  }

  function isAuthenticated() {
    return _loadSession();
  }

  function isAdmin() {
    const u = getCurrentUser();
    return u && u.role === CONFIG.ROLES.ADMIN;
  }

  function canAccessParish(parish_id) {
    const u = getCurrentUser();
    if (!u) return false;
    if (u.role === CONFIG.ROLES.ADMIN) return true;
    return u.parish_id === parish_id;
  }

  function requireAuth(requiredRole = null) {
    if (!isAuthenticated()) { window.location.href = 'index.html'; return false; }
    const u = getCurrentUser();
    if (requiredRole && u.role !== requiredRole && u.role !== CONFIG.ROLES.ADMIN) {
      window.location.href = 'index.html'; return false;
    }
    return true;
  }

  // Refresh automático a cada 4 minutos
  setInterval(_refreshIfNeeded, 4 * 60 * 1000);

  return { login, logout, getAccessToken, getCurrentUser, isAuthenticated, isAdmin, canAccessParish, requireAuth };
})();
