const crypto = require('crypto');
const env = require('../config/env');

// Asigna un identificador a cada solicitud para rastrearla en los logs.
const requestId = (req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

// Log de acceso estructurado (sin cuerpos ni cabeceras con tokens).
const logAcceso = (req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (env.isTest) return;
    console.log(JSON.stringify({
      t: new Date().toISOString(),
      id: req.id,
      metodo: req.method,
      ruta: req.originalUrl.split('?')[0],
      estado: res.statusCode,
      ms: Date.now() - inicio,
      usuario: req.usuario ? req.usuario.id_usuario : null,
      ip: req.ip,
    }));
  });
  next();
};

class ErrorApp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const noEncontrado = (req, res) => res.status(404).json({ error: 'Recurso no encontrado' });

// Manejo centralizado: el cliente recibe un mensaje genérico y el id de la solicitud;
// el detalle técnico (stack, SQL) solo queda en el log del servidor.
const manejadorErrores = (err, req, res, next) => {
  if (err instanceof ErrorApp) {
    return res.status(err.estado).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Solicitud demasiado grande' });
  }
  // Violaciones de integridad de PostgreSQL → 409/400 sin exponer el detalle.
  if (err.code === '23505') return res.status(409).json({ error: 'El registro ya existe' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referencia inválida' });
  if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: 'Valor no permitido' });

  console.error(JSON.stringify({ t: new Date().toISOString(), id: req.id, error: err.message, stack: env.isProd ? undefined : err.stack }));
  res.status(500).json({ error: 'Error interno del servidor', solicitud: req.id });
};

module.exports = { requestId, logAcceso, manejadorErrores, noEncontrado, ErrorApp };
