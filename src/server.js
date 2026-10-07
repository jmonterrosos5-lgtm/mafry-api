const env = require('./config/env');
const app = require('./app');
const pool = require('./config/db');
const { migrar } = require('../scripts/migrate');
const { sembrar } = require('../scripts/seed');

async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conectado a PostgreSQL');
  } catch (err) {
    console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
    process.exit(1);
  }

  if (env.AUTO_MIGRATE) {
    await migrar();
    await sembrar({ soloSiVacio: true });
  }

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 MAFRY API escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
  });

  // Apagado ordenado (Render envía SIGTERM en cada despliegue)
  const cerrar = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

iniciar();
