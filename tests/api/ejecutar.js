// Ejecuta la colección Postman con Newman (pruebas de API, no unitarias).
// Las contraseñas NO están en el repositorio: se leen de las mismas variables de entorno
// con las que se sembró la base de prueba (SEED_ADMIN_PASSWORD y SEED_VENDEDOR_PASSWORD).
//   Local:  $env:SEED_ADMIN_PASSWORD="..."; $env:SEED_VENDEDOR_PASSWORD="..."; npm run test:api
//   CI:     el pipeline las genera al azar en cada ejecución.
const path = require('path');
const newman = require('newman');

const faltan = ['SEED_ADMIN_PASSWORD', 'SEED_VENDEDOR_PASSWORD'].filter((v) => !process.env[v]);
if (faltan.length) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  process.exit(1);
}

const envVar = [
  { key: 'adminContrasena', value: process.env.SEED_ADMIN_PASSWORD },
  { key: 'vendContrasena', value: process.env.SEED_VENDEDOR_PASSWORD },
];
if (process.env.API_BASE_URL) envVar.push({ key: 'baseUrl', value: process.env.API_BASE_URL });

newman.run({
  collection: path.join(__dirname, 'MAFRY.postman_collection.json'),
  environment: path.join(__dirname, 'local.postman_environment.json'),
  envVar,
  reporters: ['cli', 'junit'],
  reporter: { junit: { export: path.join(__dirname, '..', '..', 'reports', 'newman-junit.xml') } },
}, (err, resumen) => {
  if (err) { console.error(err); process.exit(1); }
  process.exitCode = resumen.run.failures.length ? 1 : 0;
});
