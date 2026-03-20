/**
 * auth.js — Autenticação e sessão
 */
const Auth = (() => {
  const SESSION_KEY = 'cvs_session';
  const TIMEOUT_KEY = 'cvs_session_exp';
  let _currentUser = null;

  function _save(user) {
    const expiry = Date.now() + CONFIG.SESSION_TIMEOUT * 60 * 1000;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem(TIMEOUT_KEY, expiry.toString());
    _currentUser = user;
  }

  function _clear() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TIMEOUT_KEY);
    _currentUser = null;
  }

  async function login(username, password) {
    try {
      // Usa _getUsersRaw para ter acesso às passwords reais
      const users = await API._getUsersRaw();
      console.log('[Auth] Utilizadores carregados:', users.length);

      const user = users.find(u =>
        u.username && u.password &&
        u.username.toString().trim().toLowerCase() === username.trim().toLowerCase() &&
        u.password.toString().trim() === password.trim()
      );

      if (!user) return { success: false, error: 'Credenciais inválidas. Verifica o utilizador e a senha.' };
      if (user.status && user.status.toString().trim() !== 'active') {
        return { success: false, error: 'Conta inactiva. Contacta o administrador.' };
      }

      const sessionUser = {
        user_id:      user.user_id,
        username:     user.username,
        role:         user.role,
        parish_id:    user.parish_id,
        display_name: user.display_name || user.username,
      };
      _save(sessionUser);
      return { success: true, user: sessionUser };

    } catch (err) {
      console.error('[Auth] Erro no login:', err);
      return { success: false, error: 'Erro ao aceder à base de dados. Verifica a ligação.' };
    }
  }

  function logout() {
    _clear();
    window.location.href = 'index.html';
  }

  function getCurrentUser() {
    if (_currentUser) return _currentUser;
    const stored = sessionStorage.getItem(SESSION_KEY);
    const expiry  = sessionStorage.getItem(TIMEOUT_KEY);
    if (stored && expiry && Date.now() < parseInt(expiry, 10)) {
      _currentUser = JSON.parse(stored);
      return _currentUser;
    }
    _clear();
    return null;
  }

  function isAuthenticated()           { return getCurrentUser() !== null; }
  function isAdmin()                   { const u = getCurrentUser(); return u && u.role === CONFIG.ROLES.ADMIN; }
  function canAccessParish(parish_id)  {
    const u = getCurrentUser();
    return u && (u.role === CONFIG.ROLES.ADMIN || u.parish_id === parish_id);
  }

  function requireAuth(requiredRole = null) {
    const user = getCurrentUser();
    if (!user) { window.location.href = 'index.html'; return false; }
    if (requiredRole && user.role !== requiredRole && user.role !== CONFIG.ROLES.ADMIN) {
      window.location.href = 'index.html'; return false;
    }
    return true;
  }

  // Renova sessão ao interagir
  document.addEventListener('click', () => {
    if (isAuthenticated()) {
      sessionStorage.setItem(TIMEOUT_KEY, (Date.now() + CONFIG.SESSION_TIMEOUT * 60 * 1000).toString());
    }
  });

  return { login, logout, getCurrentUser, isAuthenticated, isAdmin, canAccessParish, requireAuth };
})();
