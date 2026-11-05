// Stub de src/config/env.js: valores fijos y conocidos para que las pruebas sean deterministas
// y no dependan de un archivo .env ni de secretos reales.
module.exports = {
  NODE_ENV: 'test',
  isProd: false,
  isTest: true,
  PORT: 0,
  JWT_SECRET: 'secreto-unitario-0123456789-abcdefghijklmnop',
  JWT_EXPIRES_IN: '8h',
  JWT_ISSUER: 'mafry-api',
  DATABASE_URL: null,
  DB: {},
  DB_SSL: false,
  CORS_ORIGINS: [],
  RATE_LIMIT_GENERAL: 300,
  LOGIN_MAX_INTENTOS: 5,
  LOGIN_BLOQUEO_MIN: 15,
  AUTO_MIGRATE: false,
  MFA_ENC_KEY: null,
  MFA_TOKEN_MIN: 5,
};
