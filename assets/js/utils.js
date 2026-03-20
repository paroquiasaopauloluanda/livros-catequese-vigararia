/**
 * utils.js — Utilitários globais
 * Formatação, validação, exportação, helpers UI
 */
const Utils = (() => {

  // ─── Formatação ───────────────────────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('pt-AO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
    } catch { return dateStr; }
  }

  function truncate(str, max = 40) {
    if (!str) return '—';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ─── Validação ────────────────────────────────────────────────────────────
  function validateRequired(fields, data) {
    const errors = [];
    fields.forEach(field => {
      if (!data[field] || data[field].toString().trim() === '') {
        errors.push(field);
      }
    });
    return errors;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ─── Exportação Excel ─────────────────────────────────────────────────────
  function exportToExcel(data, filename, sheetName = 'Dados') {
    if (typeof XLSX === 'undefined') {
      Toast.show('Biblioteca XLSX não carregada', 'error');
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
    Toast.show('Ficheiro Excel exportado com sucesso!', 'success');
  }

  function exportToCSV(data, filename) {
    if (!data.length) { Toast.show('Sem dados para exportar', 'warning'); return; }
    const headers = Object.keys(data[0]);
    const rows = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','))
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Ficheiro CSV exportado com sucesso!', 'success');
  }

  function printPage() {
    window.print();
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return [...document.querySelectorAll(sel)]; }

  function setHTML(id, html) {
    const elem = el(id);
    if (elem) elem.innerHTML = html;
  }

  function showEl(id) { const e = el(id); if (e) e.style.display = ''; }
  function hideEl(id) { const e = el(id); if (e) e.style.display = 'none'; }

  function setLoading(id, loading, text = 'A carregar…') {
    const e = el(id);
    if (!e) return;
    if (loading) {
      e.dataset.origHtml = e.innerHTML;
      e.innerHTML = `<span class="spinner"></span> ${text}`;
      e.disabled = true;
    } else {
      e.innerHTML = e.dataset.origHtml || text;
      e.disabled = false;
    }
  }

  // ─── Tabela dinâmica simples ───────────────────────────────────────────────
  function buildTable(containerId, columns, data, actions = []) {
    const container = el(containerId);
    if (!container) return;

    if (!data.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Sem registos encontrados.</p></div>';
      return;
    }

    const thead = columns.map(c => `<th>${c.label}</th>`).join('');
    const tbody = data.map(row => {
      const cells = columns.map(c => {
        const val = c.render ? c.render(row[c.key], row) : (row[c.key] || '—');
        return `<td>${val}</td>`;
      }).join('');
      const btns = actions.map(a =>
        `<button class="btn-action btn-${a.type}" data-id="${row[a.idKey || 'id']}" onclick="${a.fn}('${row[a.idKey || columns[0].key]}')">${a.label}</button>`
      ).join(' ');
      return `<tr>${cells}${actions.length ? `<td class="actions-cell">${btns}</td>` : ''}</tr>`;
    }).join('');

    const actionHeader = actions.length ? '<th>Acções</th>' : '';

    container.innerHTML = `
      <div class="table-search-bar">
        <input type="text" placeholder="Pesquisar…" oninput="Utils._filterTable(this, '${containerId}')" class="table-search-input">
        <span class="table-count">${data.length} registos</span>
      </div>
      <div class="table-responsive">
        <table class="data-table" id="tbl_${containerId}">
          <thead><tr>${thead}${actionHeader}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    `;
  }

  function _filterTable(input, containerId) {
    const term = input.value.toLowerCase();
    const rows = document.querySelectorAll(`#tbl_${containerId} tbody tr`);
    let count = 0;
    rows.forEach(row => {
      const match = row.textContent.toLowerCase().includes(term);
      row.style.display = match ? '' : 'none';
      if (match) count++;
    });
    const countEl = document.querySelector(`#${containerId} .table-count`);
    if (countEl) countEl.textContent = `${count} registos`;
  }

  // ─── Badge de status ──────────────────────────────────────────────────────
  function statusBadge(status) {
    const map = {
      draft:     { label: 'Rascunho',  cls: 'badge-gray' },
      submitted: { label: 'Submetido', cls: 'badge-blue' },
      confirmed: { label: 'Confirmado', cls: 'badge-green' },
      active:    { label: 'Activo',    cls: 'badge-green' },
      inactive:  { label: 'Inactivo',  cls: 'badge-gray' },
      admin:     { label: 'Admin',     cls: 'badge-purple' },
      parish:    { label: 'Paróquia',  cls: 'badge-blue' },
    };
    const s = map[status] || { label: status, cls: 'badge-gray' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  function showModal(title, bodyHtml, footerHtml = '') {
    let m = el('globalModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'globalModal';
      m.className = 'modal-overlay';
      document.body.appendChild(m);
    }
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" onclick="Utils.closeModal()">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>`;
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  }

  function closeModal() {
    const m = el('globalModal');
    if (m) { m.style.display = 'none'; document.body.style.overflow = ''; }
  }

  // ─── Confirmação ──────────────────────────────────────────────────────────
  function confirmAction(message, onConfirm) {
    showModal('Confirmar acção',
      `<p style="margin:0;font-size:15px;">${message}</p>`,
      `<button class="btn btn-danger" onclick="(${onConfirm.toString()})(); Utils.closeModal()">Confirmar</button>
       <button class="btn btn-secondary" onclick="Utils.closeModal()">Cancelar</button>`
    );
  }

  // ─── Estatísticas ─────────────────────────────────────────────────────────
  function computeStats(records, parishes, stages) {
    const total = records.length;

    // Livros mais usados
    const bookCount = {};
    records.forEach(r => {
      bookCount[r.book_name] = (bookCount[r.book_name] || 0) + 1;
    });
    const topBooks = Object.entries(bookCount)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Por paróquia
    const byParish = {};
    records.forEach(r => {
      byParish[r.parish_id] = (byParish[r.parish_id] || 0) + 1;
    });

    // Por etapa
    const byStage = {};
    records.forEach(r => {
      byStage[r.stage_id] = (byStage[r.stage_id] || 0) + 1;
    });

    // Taxa de uniformização: etapas onde TODAS as paróquias com registos usam o mesmo livro
    const stageBooks = {};
    records.forEach(r => {
      if (!stageBooks[r.stage_id]) stageBooks[r.stage_id] = new Set();
      stageBooks[r.stage_id].add(r.book_name);
    });
    const uniformStages = Object.values(stageBooks).filter(s => s.size === 1).length;
    const totalStagesWithRecords = Object.keys(stageBooks).length;
    const uniformRate = totalStagesWithRecords > 0
      ? Math.round((uniformStages / totalStagesWithRecords) * 100)
      : 0;

    // Paróquias com registos
    const activeParishes = new Set(records.map(r => r.parish_id)).size;

    return { total, topBooks, byParish, byStage, uniformRate, activeParishes, stageBooks };
  }

  return {
    formatDate, truncate, capitalize,
    validateRequired, validateEmail,
    exportToExcel, exportToCSV, printPage,
    el, qs, qsa, setHTML, showEl, hideEl, setLoading,
    buildTable, _filterTable,
    statusBadge,
    showModal, closeModal, confirmAction,
    computeStats,
  };
})();

// ─── Toast notifications ─────────────────────────────────────────────────────
const Toast = (() => {
  let container;

  function _ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
  }

  function show(message, type = 'info', duration = 3500) {
    _ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  return { show };
})();
