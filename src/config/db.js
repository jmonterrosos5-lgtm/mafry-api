const { Pool, types } = require('pg');
const env = require('./env');

// Las credenciales vienen de variables de entorno (antes estaban escritas aquí).
// Las columnas DATE se devuelven como texto 'YYYY-MM-DD' (sin desfase de zona horaria).
types.setTypeParser(1082, (v) => v);

const base = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL }
  : { ...env.DB };

const pool = new Pool({
  ...base,
  // Neon exige TLS. Se verifica el certificado del servidor (evita ataques de intermediario).
  ssl: env.DB_SSL ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Fechas como "hoy" en hora de Guatemala aunque Render y Neon estén en UTC.
// (El pooler de Neon no acepta el parámetro "options", por eso se usa SET al conectar
//  y además la migración fija la zona horaria a nivel de base de datos.)
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Guatemala'").catch(() => {});
});

pool.on('error', (err) => {
  // No se imprime la cadena de conexión, solo el mensaje.
  console.error('[db] Error inesperado en el pool:', err.message);
});

module.exports = pool;
