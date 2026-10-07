// Variables para el entorno de pruebas (base de datos aislada, secretos solo de prueba).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'secreto-solo-para-pruebas-automatizadas-0123456789';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_TEST
  || 'postgresql://postgres:devlocal-pass@localhost:5432/mafry_test';
process.env.SEED_ADMIN_PASSWORD = 'AdminPrueba2026';
process.env.SEED_VENDEDOR_PASSWORD = 'VendedorPrueba2026';
process.env.LOGIN_MAX_INTENTOS = '5';
