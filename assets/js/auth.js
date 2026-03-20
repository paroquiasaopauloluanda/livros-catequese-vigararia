/**
 * auth.js — Gestão de autenticação e sessão
 * Autenticação simples via Google Sheets (sem backend)
 * NOTA: Para produção recomenda-se Firebase Authentication
 */
const Auth = (() => {
  const SESSION_KEY = 'cvs_session';
  const TIMEOUT_KEY = 'cvs_session_exp';

  // ─── Estado interno ───────────────────────────────────────────────────────
  let _currentUser = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _saveSession(user) {
    const expiry = Date.now() + CONFIG.SESSION_TIMEOUT * 60 * 1000;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    sessionStorage.setItem(TIMEOUT_KEY, expiry.toString());
    _currentUser = user;
  }

  function _clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TIMEOUT_KEY);
    _currentUser = null;
  }

  function _isSessionValid() {
    const expiry = sessionStorage.getItem(TIMEOUT_KEY);
    if (!expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /**
   * Tenta autenticar o utilizador contra a sheet Users
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async function login(username, password) {
    try {
      const users = await API.fetchSheet(CONFIG.SHEETS.USERS);
      const user = users.find(
        u => u.username === username.trim() && u.password === password
      );

      if (!user) {
        return { success: false, error: 'Credenciais inválidas. Verifica o utilizador e a senha.' };
      }

      if (user.status !== 'active') {
        return { success: false, error: 'Conta inactiva. Contacta o administrador da vigararia.' };
      }

      // Não guardar a password na sessão
      const sessionUser = {
        user_id:    user.user_id,
        username:   user.username,
        role:       user.role,
        parish_id:  user.parish_id,
        display_name: user.display_name || user.username,
      };

      _saveSession(sessionUser);
      return { success: true, user: sessionUser };

    } catch (err) {
      console.error('[Auth] Erro no login:', err);
      return { success: false, error: 'Erro ao aceder à base de dados. Verifica a ligação.' };
    }
  }

  /** Termina a sessão e redireciona para o login */
  function logout() {
    _clearSession();
    window.location.href = 'index.html';
  }

  /**
   * Devolve o utilizador da sessão actual ou null
   * @returns {object|null}
   */
  function getCurrentUser() {
    if (_currentUser) return _currentUser;

    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && _isSessionValid()) {
      _currentUser = JSON.parse(stored);
      return _currentUser;
    }

    _clearSession();
    return null;
  }

  /** Verifica se há sessão válida */
  function isAuthenticated() {
    return getCurrentUser() !== null;
  }

  /** Verifica se o utilizador actual é admin */
  function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === CONFIG.ROLES.ADMIN;
  }

  /** Verifica se o utilizador pertence a uma paróquia específica */
  function canAccessParish(parish_id) {
    const user = getCurrentUser();
    if (!user) return false;
    if (user.role === CONFIG.ROLES.ADMIN) return true;
    return user.parish_id === parish_id;
  }

  /**
   * Guarda-guard: redireciona se não autenticado
   * Chamar no início de cada página protegida
   */
  function requireAuth(requiredRole = null) {
    const user = getCurrentUser();
    if (!user) {
      window.location.href = 'index.html';
      return false;
    }
    if (requiredRole && user.role !== requiredRole && user.role !== CONFIG.ROLES.ADMIN) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // ─── Renova a sessão ao interagir ────────────────────────────────────────
  document.addEventListener('click', () => {
    if (isAuthenticated()) {
      const expiry = Date.now() + CONFIG.SESSION_TIMEOUT * 60 * 1000;
      sessionStorage.setItem(TIMEOUT_KEY, expiry.toString());
    }
  });

  return { login, logout, getCurrentUser, isAuthenticated, isAdmin, canAccessParish, requireAuth };
})();
