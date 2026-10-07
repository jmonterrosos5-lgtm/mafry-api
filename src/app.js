const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const pool = require('./config/db');
const { limiteGeneral } = require('./middleware/rateLimit');
const { requestId, logAcceso, manejadorErrores, noEncontrado } = require('./middleware/errores');

const app = express();

// Render coloca un proxy delante: se confía en él para obtener la IP real del cliente.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);
app.use(logAcceso);

// Cabeceras de seguridad (CSP, HSTS, X-Frame-Options, nosniff, etc.).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
}));

// CORS restringido: solo los orígenes configurados (el panel es del mismo origen).
app.use(cors({
  origin(origin, cb) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '100kb' }));

// Salud del servicio (Render lo usa para saber si la app está disponible).
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', bd: 'ok', version: '2.0.0' });
  } catch {
    res.status(503).json({ estado: 'degradado', bd: 'sin conexión' });
  }
});

app.get('/', (req, res) => res.redirect('/admin/'));

// Panel administrativo web (archivos estáticos)
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin'), { index: 'index.html', maxAge: '1h' }));

app.use('/api', limiteGeneral);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/visitas', require('./routes/visitas'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/cobros', require('./routes/cobros'));
app.use('/api/vendedores', require('./routes/vendedores'));
app.use('/api/admin', require('./routes/admin'));

app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;
