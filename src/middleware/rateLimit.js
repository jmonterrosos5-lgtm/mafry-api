const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const mensaje = (texto) => ({ error: texto });

// Límite general para toda la API (protege disponibilidad ante abuso).
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Demasiadas solicitudes, intente más tarde'),
});

// Límite estricto para el login (fuerza bruta / credential stuffing).
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? Number(process.env.TEST_LOGIN_LIMIT || 1000) : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensaje('Demasiados intentos de inicio de sesión, espere 15 minutos'),
});

module.exports = { limiteGeneral, limiteLogin };
