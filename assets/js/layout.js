/**
 * layout.js — Componente de layout partilhado
 * Gera o sidebar e header em todas as páginas protegidas
 */
const Layout = (() => {

  const adminNav = [
    { section: 'Dashboard' },
    { href: 'dashboard.html', icon: '📊', label: 'Dashboard', id: 'dashboard' },

    { section: 'Registos' },
    { href: 'global-records.html', icon: '📚', label: 'Todos os Registos', id: 'global-records' },

    { section: 'Administração' },
    { href: 'parishes.html',  icon: '⛪', label: 'Paróquias',    id: 'parishes' },
    { href: 'users.html',     icon: '👥', label: 'Utilizadores', id: 'users' },
    { href: 'books.html',     icon: '📖', label: 'Livros',       id: 'books' },
  ];

  const parishNav = [
    { section: 'A minha paróquia' },
    { href: 'records.html', icon: '📋', label: 'Os meus Registos', id: 'records' },
    { href: 'new-record.html', icon: '➕', label: 'Novo Registo', id: 'new-record' },
  ];

  function _buildNavItems(items, currentPage) {
    return items.map(item => {
      if (item.section) {
        return `<div class="nav-section-title">${item.section}</div>`;
      }
      const active = currentPage === item.id ? 'active' : '';
      return `<a href="${item.href}" class="nav-item ${active}">
        <span class="nav-item-icon">${item.icon}</span>
        <span>${item.label}</span>
      </a>`;
    }).join('');
  }

  function render(currentPage) {
    if (!Auth.requireAuth()) return;
    const user    = Auth.getCurrentUser();
    const isAdmin = user.role === CONFIG.ROLES.ADMIN;
    const navItems = isAdmin ? adminNav : parishNav;
    const initials = user.display_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    const sidebar = `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon">✝</div>
          <div class="sidebar-brand-name">Catequese Vigararia</div>
          <div class="sidebar-brand-sub">Sistema de Gestão</div>
        </div>

        <nav class="sidebar-nav">
          ${_buildNavItems(navItems, currentPage)}
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${initials}</div>
            <div>
              <div class="sidebar-user-name">${user.display_name}</div>
              <div class="sidebar-user-role">${isAdmin ? 'Administrador' : 'Paróquia'}</div>
            </div>
          </div>
          <button class="btn-logout" onclick="Auth.logout()">↩ Terminar sessão</button>
        </div>
      </aside>`;

    // Injeta no body
    document.body.insertAdjacentHTML('afterbegin', sidebar);

    // Adiciona toggle mobile
    const header = document.querySelector('.page-header');
    if (header) {
      const toggle = document.createElement('button');
      toggle.className = 'btn btn-ghost btn-icon';
      toggle.innerHTML = '☰';
      toggle.style.display = 'none';
      toggle.id = 'sidebarToggle';
      toggle.onclick = () => document.getElementById('sidebar').classList.toggle('open');
      header.insertBefore(toggle, header.firstChild);
    }

    // Mostra toggle em mobile
    if (window.innerWidth <= 900) {
      const t = document.getElementById('sidebarToggle');
      if (t) t.style.display = '';
    }
  }

  return { render };
})();
