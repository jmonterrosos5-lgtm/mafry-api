const request = require('supertest');
const app = require('../src/app');

const CRED = {
  admin: { correo: 'admin@mafry.test', contrasena: process.env.SEED_ADMIN_PASSWORD },
  kevin: { correo: 'kevin.garcia@mafry.test', contrasena: process.env.SEED_VENDEDOR_PASSWORD },
  diego: { correo: 'diego.ruiz@mafry.test', contrasena: process.env.SEED_VENDEDOR_PASSWORD },
};

async function token(quien) {
  const res = await request(app).post('/api/auth/login').send(CRED[quien]);
  if (res.status !== 200) throw new Error(`Login ${quien} falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

const api = () => request(app);
module.exports = { api, token, CRED, app };
