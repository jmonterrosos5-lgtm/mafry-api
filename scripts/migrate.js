// Aplica db/schema.sql (idempotente). Uso: npm run migrate
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function migrar() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Esquema aplicado');
}

if (require.main === module) {
  migrar()
    .catch((err) => { console.error('❌ Error en migración:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { migrar };
