/**
 * config.js — Configuração central
 */
const CONFIG = {
  // ─── Supabase ─────────────────────────────────────────────────────────────
  SUPABASE_URL:      'https://dbtsqhgtsyibcxfhkzfh.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7ihCGJq2FPTm0L6C0Ulkdw_M_RzLZKw',

  // Domínio interno usado para criar emails fictícios
  // O utilizador NUNCA vê isto — é só para o Supabase Auth internamente
  INTERNAL_DOMAIN: 'vigararia.internal',

  // ─── Aplicação ────────────────────────────────────────────────────────────
  APP_NAME:        'Catequese Vigararia',
  APP_VERSION:     '2.0.0',
  LOCALE:          'pt-AO',
  SESSION_TIMEOUT: 480,

  ROLES:  { ADMIN: 'admin', PARISH: 'parish' },
  STATUS: { DRAFT: 'draft', SUBMITTED: 'submitted', CONFIRMED: 'confirmed' },

  // Converte username para email interno
  usernameToEmail(username) {
    return `${username.toLowerCase().trim()}@${this.INTERNAL_DOMAIN}`;
  },
};

Object.freeze(CONFIG.ROLES);
Object.freeze(CONFIG.STATUS);
