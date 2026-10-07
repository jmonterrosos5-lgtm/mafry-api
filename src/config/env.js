// Carga y valida la configuración. Ningún secreto vive en el código:
// todo llega por variables de entorno (.env en local, panel de Render en producción).
require('dotenv').config({ quiet: true });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

function requerido(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Revisa .env.example`);
  }
  return valor;
}

const JWT_SECRET = requerido('JWT_SECRET');
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}

// Render entrega DATABASE_URL; en local se puede usar DATABASE_URL o DB_*.
const DATABASE_URL = process.env.DATABASE_URL || null;
if (!DATABASE_URL) {
  ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].forEach(requerido);
}

module.exports = {
  NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',
  PORT: Number(process.env.PORT) || 3000,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  JWT_ISSUER: 'mafry-api',
  DATABASE_URL,
  DB: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  DB_SSL: process.env.DB_SSL === 'true',
  // Orígenes del navegador permitidos (el panel se sirve desde la misma API).
  // La app Flutter no envía cabecera Origin, por eso no se ve afectada.
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  LOGIN_MAX_INTENTOS: Number(process.env.LOGIN_MAX_INTENTOS) || 5,
  LOGIN_BLOQUEO_MIN: Number(process.env.LOGIN_BLOQUEO_MIN) || 15,
  AUTO_MIGRATE: process.env.AUTO_MIGRATE === 'true',
};
