/**
 * config.js — Configuração central do sistema
 * Editar este ficheiro para apontar para o Google Sheets correcto
 */
const CONFIG = {
  // ─── Google Sheets ───────────────────────────────────────────────────────
  // Substitui pelo ID da tua planilha (encontra-se no URL do Google Sheets)
  // SPREADSHEET_ID: 'COLE_O_ID_DA_TUA_PLANILHA_AQUI',
  SPREADSHEET_ID: '1eMk0WvkFbsj3knT3WnnGJNK1uyT1FyA-Y98Km7RPF3A',

  // URL base para leitura via CSV público
  get SHEETS_BASE() {
    return `https://docs.google.com/spreadsheets/d/${this.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=`;
  },

  // Nomes exactos das sheets na planilha
  SHEETS: {
    PARISHES:   'Parishes',
    USERS:      'Users',
    STAGES:     'CatechesisStages',
    AGE_GROUPS: 'AgeGroups',
    BOOKS:      'Books',
    RECORDS:    'CatechesisRecords',
  },

  // ─── Aplicação ───────────────────────────────────────────────────────────
  APP_NAME:    'Catequese Vigararia',
  APP_VERSION: '1.0.0',
  LOCALE:      'pt-AO',

  // Sessão (minutos)
  SESSION_TIMEOUT: 480,

  // Roles
  ROLES: {
    ADMIN:  'admin',
    PARISH: 'parish',
  },

  // Status dos registos
  STATUS: {
    DRAFT:     'draft',
    SUBMITTED: 'submitted',
    CONFIRMED: 'confirmed',
  },
};

// Congela o objecto para evitar mutações acidentais
Object.freeze(CONFIG);
Object.freeze(CONFIG.SHEETS);
Object.freeze(CONFIG.ROLES);
