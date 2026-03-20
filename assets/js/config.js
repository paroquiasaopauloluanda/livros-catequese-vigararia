/**
 * config.js — Configuração central do sistema
 */
const CONFIG = {
  // ─── Google Sheets ───────────────────────────────────────────────────────
  SPREADSHEET_ID: '1eMk0WvkFbsj3knT3WnnGJNK1uyT1FyA-Y98Km7RPF3A',

  // URL do Google Apps Script Web App (para escrita na planilha)
  // Depois de fazer deploy do Apps Script, cola o URL aqui
  // APPS_SCRIPT_URL: 'COLE_O_URL_DO_APPS_SCRIPT_AQUI',
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxPtIyG-whMGCfAatkTrrt1qPFW9fnFCqf8h9HMOb-O_7FcnODc-huwE_V0iDlTKJQ_/exec',

  get SHEETS_BASE() {
    return `https://docs.google.com/spreadsheets/d/${this.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=`;
  },

  SHEETS: {
    PARISHES:   'Parishes',
    USERS:      'Users',
    STAGES:     'CatechesisStages',
    AGE_GROUPS: 'AgeGroups',
    BOOKS:      'Books',
    RECORDS:    'CatechesisRecords',
  },

  APP_NAME:        'Catequese Vigararia',
  APP_VERSION:     '1.0.0',
  LOCALE:          'pt-AO',
  SESSION_TIMEOUT: 480,

  ROLES:  { ADMIN: 'admin', PARISH: 'parish' },
  STATUS: { DRAFT: 'draft', SUBMITTED: 'submitted', CONFIRMED: 'confirmed' },
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.SHEETS);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.STATUS);
