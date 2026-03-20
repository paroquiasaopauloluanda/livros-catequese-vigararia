/**
 * layout.js — Sidebar e navegação partilhada
 */
const Layout = (() => {

  const adminNav = [
    { section: 'Dashboard' },
    { href: 'dashboard.html',      icon: '📊', label: 'Dashboard',        id: 'dashboard' },
    { section: 'Registos' },
    { href: 'global-records.html', icon: '📚', label: 'Todos os Registos', id: 'global-records' },
    { section: 'Administração' },
    { href: 'parishes.html',       icon: '⛪', label: 'Paróquias',         id: 'parishes' },
    { href: 'users.html',          icon: '👥', label: 'Utilizadores',      id: 'users' },
    { href: 'books.html',          icon: '📖', label: 'Livros',            id: 'books' },
  ];

  const parishNav = [
    { section: 'A minha paróquia' },
    { href: 'records.html',     icon: '📋', label: 'Os meus Registos', id: 'records' },
    { href: 'new-record.html',  icon: '➕', label: 'Novo Registo',      id: 'new-record' },
  ];

  function _buildNav(items, currentPage) {
    return items.map(item => {
      if (item.section) return `<div class="nav-section-title">${item.section}</div>`;
      const active = currentPage === item.id ? 'active' : '';
      return `<a href="${item.href}" class="nav-item ${active}">
        <span class="nav-item-icon">${item.icon}</span>
        <span>${item.label}</span>
      </a>`;
    }).join('');
  }

  function render(currentPage) {
    if (!Auth.requireAuth()) return;
    const user     = Auth.getCurrentUser();
    const isAdmin  = user.role === CONFIG.ROLES.ADMIN;
    const navItems = isAdmin ? adminNav : parishNav;
    const initials = (user.display_name || user.username)
      .split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    // Sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">✝</div>
        <div class="sidebar-brand-name">Catequese Vigararia</div>
        <div class="sidebar-brand-sub">Sistema de Gestão</div>
      </div>
      <nav class="sidebar-nav">${_buildNav(navItems, currentPage)}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">${initials}</div>
          <div>
            <div class="sidebar-user-name">${user.display_name || user.username}</div>
            <div class="sidebar-user-role">${isAdmin ? 'Administrador' : 'Paróquia'}</div>
          </div>
        </div>
        <button class="btn-logout" onclick="Auth.logout()">↩ Terminar sessão</button>
      </div>`;

    // Overlay para fechar sidebar em mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    overlay.addEventListener('click', closeSidebar);

    document.body.insertBefore(overlay, document.body.firstChild);
    document.body.insertBefore(sidebar, overlay.nextSibling);

    // Botão hamburguer no header
    const header = document.querySelector('.page-header');
    if (header) {
      const toggle = document.createElement('button');
      toggle.className = 'btn btn-ghost btn-icon';
      toggle.id = 'sidebarToggle';
      toggle.innerHTML = '☰';
      toggle.style.display = 'none'; // escondido por defeito, CSS mostra em mobile
      toggle.setAttribute('aria-label', 'Menu');
      toggle.addEventListener('click', openSidebar);
      header.insertBefore(toggle, header.firstChild);
    }

    // Fecha sidebar ao clicar num link (mobile)
    sidebar.querySelectorAll('.nav-item').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 900) closeSidebar();
      });
    });
  }

  function openSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    document.body.style.overflow = '';
  }

  return { render, openSidebar, closeSidebar };
})();
