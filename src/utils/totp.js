// Segundo factor de autenticación (MFA) con códigos TOTP de 6 dígitos (RFC 6238),
// compatibles con Google Authenticator, Microsoft Authenticator, Authy, etc.
// Se implementa con el módulo crypto de Node (sin dependencias externas).
//
// El secreto de cada usuario se guarda CIFRADO en la base de datos con AES-256-GCM.
// La clave de cifrado sale de MFA_ENC_KEY (variable de entorno) o, si no existe,
// se deriva de JWT_SECRET con HKDF. Nunca se guarda en el repositorio.
const crypto = require('crypto');
const env = require('../config/env');

const PERIODO = 30;      // segundos por código
const DIGITOS = 6;
const VENTANA = 1;       // tolera ±30 s de diferencia de reloj del teléfono
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += B32[(valor << (5 - bits)) & 31];
  return salida;
}

function base32Decode(texto) {
  const limpio = texto.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const c of limpio) {
    const i = B32.indexOf(c);
    if (i === -1) throw new Error('Secreto base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generarSecreto() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, recomendado por RFC 4226
}

function codigoEn(secreto, contador) {
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', base32Decode(secreto)).update(mensaje).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const numero = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITOS;
  return String(numero).padStart(DIGITOS, '0');
}

function contadorActual(ahoraMs = Date.now()) {
  return Math.floor(ahoraMs / 1000 / PERIODO);
}

// Devuelve el contador del código aceptado (para impedir que se reutilice) o null.
function verificar(secreto, codigo, ahoraMs = Date.now()) {
  if (!/^\d{6}$/.test(String(codigo || ''))) return null;
  const actual = contadorActual(ahoraMs);
  for (let d = -VENTANA; d <= VENTANA; d++) {
    const esperado = Buffer.from(codigoEn(secreto, actual + d));
    if (crypto.timingSafeEqual(esperado, Buffer.from(String(codigo)))) return actual + d;
  }
  return null;
}

function uriOtpauth(secreto, cuenta) {
  const emisor = 'MAFRY';
  return `otpauth://totp/${encodeURIComponent(`${emisor}:${cuenta}`)}?secret=${secreto}`
    + `&issuer=${emisor}&algorithm=SHA1&digits=${DIGITOS}&period=${PERIODO}`;
}

// ---- cifrado del secreto en reposo ----
let claveCache;
function clave() {
  if (!claveCache) {
    claveCache = env.MFA_ENC_KEY
      ? crypto.createHash('sha256').update(env.MFA_ENC_KEY).digest()
      : Buffer.from(crypto.hkdfSync('sha256', env.JWT_SECRET, 'mafry-mfa', 'cifrado-secreto-totp', 32));
  }
  return claveCache;
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join('.');
}

function descifrar(empaquetado) {
  const [version, iv, tag, datos] = String(empaquetado).split('.');
  if (version !== 'v1') throw new Error('Formato de secreto MFA desconocido');
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}

module.exports = { generarSecreto, verificar, codigoEn, contadorActual, uriOtpauth, cifrar, descifrar, base32Encode };
