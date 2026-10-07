// Deja la base de pruebas en un estado conocido antes de correr la suite.
module.exports = async () => {
  require('./env');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  const { migrar } = require('../scripts/migrate');
  const { sembrar } = require('../scripts/seed');
  await migrar();
  await sembrar();
  await require('../src/config/db').end();
};
