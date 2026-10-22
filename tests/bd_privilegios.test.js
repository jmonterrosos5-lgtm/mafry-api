// Pruebas del principio de mínimo privilegio en PostgreSQL (db/roles.sql).
// Se crean los roles con contraseñas de prueba y se intenta, conectado como cada rol,
// hacer operaciones que la política prohíbe.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pool = require('../src/config/db');

const PASS_APP = 'app-solo-pruebas-2026';
const PASS_RESP = 'respaldo-solo-pruebas-2026';
let app; let respaldo;

function conexionComo(usuario, contrasena) {
  const url = new URL(process.env.DATABASE_URL);
  url.username = usuario;
  url.password = contrasena;
  return new Pool({ connectionString: url.toString(), max: 1 });
}

beforeAll(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'roles.sql'), 'utf8')
    .replace(':app_password', `'${PASS_APP}'`)
    .replace(':respaldo_password', `'${PASS_RESP}'`);
  await pool.query(sql);
  app = conexionComo('mafry_app', PASS_APP);
  respaldo = conexionComo('mafry_respaldo', PASS_RESP);
});
afterAll(async () => {
  await app.end();
  await respaldo.end();
  await pool.end();
});

describe('Rol de la aplicación (mafry_app)', () => {
  test('puede leer y registrar datos de negocio', async () => {
    const r = await app.query('SELECT count(*)::int AS n FROM productos');
    expect(r.rows[0].n).toBeGreaterThan(0);
    await app.query("INSERT INTO bitacora (accion) VALUES ('PRUEBA_PRIVILEGIOS')");
  });

  test('NO puede borrar registros de negocio', async () => {
    await expect(app.query('DELETE FROM clientes WHERE id_cliente = -1')).rejects.toThrow(/permission denied|permiso denegado/);
  });

  test('NO puede alterar ni eliminar tablas', async () => {
    await expect(app.query('DROP TABLE pedidos')).rejects.toThrow(/must be owner|debe ser dueño/);
    await expect(app.query('ALTER TABLE usuarios ADD COLUMN x int')).rejects.toThrow(/must be owner|debe ser dueño/);
  });

  test('NO puede crear tablas nuevas en el esquema', async () => {
    await expect(app.query('CREATE TABLE intrusa (id int)')).rejects.toThrow(/permission denied|permiso denegado/);
  });

  test('NO puede modificar la bitácora (sin privilegio y con trigger)', async () => {
    await expect(app.query("UPDATE bitacora SET accion = 'X'")).rejects.toThrow(/permission denied|permiso denegado/);
  });
});

describe('Rol de respaldos (mafry_respaldo)', () => {
  test('puede leer todas las tablas (necesario para pg_dump)', async () => {
    const r = await respaldo.query('SELECT count(*)::int AS n FROM usuarios');
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  test('NO puede insertar, modificar ni borrar', async () => {
    await expect(respaldo.query("INSERT INTO categorias (nombre) VALUES ('X')")).rejects.toThrow(/permission denied|permiso denegado/);
    await expect(respaldo.query('UPDATE productos SET precio_unitario = 0')).rejects.toThrow(/permission denied|permiso denegado/);
    await expect(respaldo.query('DELETE FROM cobros')).rejects.toThrow(/permission denied|permiso denegado/);
  });
});
