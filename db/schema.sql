-- =====================================================================
-- MAFRY · Esquema de base de datos (PostgreSQL 16)
-- Idempotente: se puede ejecutar varias veces sin perder datos.
-- La integridad se refuerza en la propia BD (CHECK, FK, UNIQUE, triggers)
-- y no solo en la aplicación.
-- =====================================================================

-- Zona horaria de Guatemala para toda la base (Neon y Render trabajan en UTC)
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Guatemala');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para fijar la zona horaria de la base; se usa SET por conexión';
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario        SERIAL PRIMARY KEY,
  nombre            VARCHAR(80)  NOT NULL,
  apellido          VARCHAR(80)  NOT NULL,
  correo            VARCHAR(120) NOT NULL UNIQUE,
  contrasena_hash   VARCHAR(100) NOT NULL,           -- bcrypt, nunca texto plano
  rol               VARCHAR(20)  NOT NULL CHECK (rol IN ('admin','vendedor')),
  activo            BOOLEAN      NOT NULL DEFAULT true,
  intentos_fallidos INTEGER      NOT NULL DEFAULT 0,
  bloqueado_hasta   TIMESTAMPTZ,
  ultimo_acceso     TIMESTAMPTZ,
  fecha_creacion    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendedores (
  id_vendedor      SERIAL PRIMARY KEY,
  id_usuario       INTEGER NOT NULL UNIQUE REFERENCES usuarios(id_usuario),
  codigo_vendedor  VARCHAR(20) NOT NULL UNIQUE,
  telefono         VARCHAR(20),
  zona_asignada    VARCHAR(80),
  activo           BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente        SERIAL PRIMARY KEY,
  nombre_negocio    VARCHAR(120) NOT NULL,
  nombre_contacto   VARCHAR(120),
  telefono          VARCHAR(20),
  direccion         VARCHAR(200),
  latitud           NUMERIC(9,6) CHECK (latitud BETWEEN -90 AND 90),
  longitud          NUMERIC(9,6) CHECK (longitud BETWEEN -180 AND 180),
  tipo_cliente      VARCHAR(20) NOT NULL DEFAULT 'tienda'
                    CHECK (tipo_cliente IN ('tienda','deposito','supermercado','super24','otro')),
  id_vendedor       INTEGER REFERENCES vendedores(id_vendedor),  -- vendedor asignado
  activo            BOOLEAN NOT NULL DEFAULT true,
  fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rutas (
  id_ruta      SERIAL PRIMARY KEY,
  nombre       VARCHAR(80) NOT NULL,
  zona         VARCHAR(80),
  id_vendedor  INTEGER REFERENCES vendedores(id_vendedor)
);

CREATE TABLE IF NOT EXISTS visitas (
  id_visita     SERIAL PRIMARY KEY,
  id_vendedor   INTEGER NOT NULL REFERENCES vendedores(id_vendedor),
  id_cliente    INTEGER NOT NULL REFERENCES clientes(id_cliente),
  id_ruta       INTEGER REFERENCES rutas(id_ruta),
  fecha_visita  DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio   TIME,
  hora_fin      TIME,
  latitud       NUMERIC(9,6) CHECK (latitud BETWEEN -90 AND 90),
  longitud      NUMERIC(9,6) CHECK (longitud BETWEEN -180 AND 180),
  observaciones VARCHAR(500),
  estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_curso','completada','no_atendida'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id_categoria SERIAL PRIMARY KEY,
  nombre       VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS productos (
  id_producto      SERIAL PRIMARY KEY,
  codigo_producto  VARCHAR(20) UNIQUE,
  id_categoria     INTEGER REFERENCES categorias(id_categoria),
  nombre           VARCHAR(120) NOT NULL,
  descripcion      VARCHAR(300),
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  unidad_medida    VARCHAR(20) NOT NULL DEFAULT 'unidad',
  stock_disponible INTEGER NOT NULL DEFAULT 0 CHECK (stock_disponible >= 0),
  activo           BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido     SERIAL PRIMARY KEY,
  id_visita     INTEGER NOT NULL REFERENCES visitas(id_visita),
  fecha_pedido  TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','confirmado','entregado','anulado')),
  total         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  metodo_pago   VARCHAR(20) CHECK (metodo_pago IN ('efectivo','credito','transferencia')),
  observaciones VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle      SERIAL PRIMARY KEY,
  id_pedido       INTEGER NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
  id_producto     INTEGER NOT NULL REFERENCES productos(id_producto),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

CREATE TABLE IF NOT EXISTS cobros (
  id_cobro     SERIAL PRIMARY KEY,
  id_pedido    INTEGER NOT NULL REFERENCES pedidos(id_pedido),
  id_vendedor  INTEGER NOT NULL REFERENCES vendedores(id_vendedor),
  monto        NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha_cobro  DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo       VARCHAR(20) NOT NULL CHECK (metodo IN ('efectivo','transferencia','cheque')),
  referencia   VARCHAR(60),
  estado       VARCHAR(20) NOT NULL DEFAULT 'cobrado'
               CHECK (estado IN ('cobrado','verificado','anulado'))
);

-- Bitácora de auditoría: solo se permite INSERT y SELECT.
CREATE TABLE IF NOT EXISTS bitacora (
  id_bitacora BIGSERIAL PRIMARY KEY,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_usuario  INTEGER REFERENCES usuarios(id_usuario),
  accion      VARCHAR(60) NOT NULL,
  entidad     VARCHAR(40),
  id_entidad  INTEGER,
  ip          VARCHAR(64),
  detalle     JSONB
);

CREATE OR REPLACE FUNCTION bitacora_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es de solo inserción (no se permite %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bitacora_inmutable ON bitacora;
CREATE TRIGGER trg_bitacora_inmutable
  BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();

-- Índices para las consultas más frecuentes
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor  ON visitas(id_vendedor, fecha_visita DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_visita    ON pedidos(id_visita);
CREATE INDEX IF NOT EXISTS idx_cobros_vendedor   ON cobros(id_vendedor, fecha_cobro DESC);
CREATE INDEX IF NOT EXISTS idx_cobros_pedido     ON cobros(id_pedido);
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor ON clientes(id_vendedor);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha    ON bitacora(fecha DESC);
