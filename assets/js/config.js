/**
 * config.js — Configuração central
 * Preenche SUPABASE_URL e SUPABASE_ANON_KEY com os valores do teu projecto
 * Settings → API no dashboard do Supabase
 */
const CONFIG = {
  // ─── Supabase ─────────────────────────────────────────────────────────────
  // SUPABASE_URL:      'COLE_O_PROJECT_URL_AQUI',       // ex: https://xyzxyz.supabase.co
  // SUPABASE_ANON_KEY: 'COLE_O_ANON_KEY_AQUI',          // começa com eyJ...
  SUPABASE_URL:      'https://dbtsqhgtsyibcxfhkzfh.supabase.co',       // ex: https://xyzxyz.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_7ihCGJq2FPTm0L6C0Ulkdw_M_RzLZKw',          // começa com eyJ...

  // ─── Aplicação ────────────────────────────────────────────────────────────
  APP_NAME:        'Catequese Vigararia',
  APP_VERSION:     '2.0.0',
  LOCALE:          'pt-AO',
  SESSION_TIMEOUT: 480, // minutos

  ROLES:  { ADMIN: 'admin', PARISH: 'parish' },
  STATUS: { DRAFT: 'draft', SUBMITTED: 'submitted', CONFIRMED: 'confirmed' },
};

Object.freeze(CONFIG);
Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.STATUS);
