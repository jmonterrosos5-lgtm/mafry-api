const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mafry_db',
  user: 'postgres',
  password: 'Fco220790',
});

pool.connect()
  .then(client => {
    console.log('✅ Conectado a PostgreSQL - mafry_db');
    client.release();
  })
  .catch(err => console.error('❌ Error de conexión PostgreSQL:', err.message));

module.exports = pool;