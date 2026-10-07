-- =====================================================================
-- MAFRY · Principio de mínimo privilegio en PostgreSQL
-- Ejecutar como superusuario/propietario DESPUÉS de schema.sql:
--   psql "$DATABASE_URL_ADMIN" -v app_password="'<contraseña-larga>'" -f db/roles.sql
-- La API se conecta con mafry_app, que NO puede borrar datos, crear/alterar
-- tablas ni modificar la bitácora. El usuario propietario solo se usa para migraciones.
-- En Neon se ejecuta con el usuario propietario (neondb_owner) desde el SQL Editor
-- o con psql; luego la DATABASE_URL de Render se cambia al usuario mafry_app.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mafry_app') THEN
    CREATE ROLE mafry_app LOGIN;
  END IF;
END $$;

ALTER ROLE mafry_app WITH PASSWORD :app_password;
ALTER ROLE mafry_app NOSUPERUSER NOCREATEDB NOCREATEROLE;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM mafry_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE ON SCHEMA public TO mafry_app;

-- Lectura/escritura sin DELETE en tablas de negocio
GRANT SELECT, INSERT, UPDATE ON
  usuarios, vendedores, clientes, rutas, visitas,
  categorias, productos, pedidos, detalle_pedido, cobros
TO mafry_app;

-- Bitácora: solo insertar y leer
GRANT SELECT, INSERT ON bitacora TO mafry_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mafry_app;
