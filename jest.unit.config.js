// Pruebas UNITARIAS (Fase 2 — curso Aseguramiento de la Calidad de Software).
// Cada unidad se prueba aislada: la base de datos, bcrypt, TOTP, la bitácora y fetch
// se reemplazan por dobles de prueba (ver tests/unit/helpers/dobles.js).
// No necesitan PostgreSQL ni red: corren en el pipeline antes del análisis estático.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports', outputName: 'junit-unitarias.xml' }]],
  collectCoverage: true,
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  // Alcance de la cobertura = módulos críticos declarados en el entregable E2
  // (Autenticación, Pedidos, Cobros) + la lógica del panel web (frontend).
  collectCoverageFrom: [
    'src/controllers/authController.js',
    'src/middleware/auth.js',
    'src/controllers/pedidosController.js',
    'src/controllers/cobrosController.js',
    'public/admin/lib.js',
  ],
  // RNF-05: cobertura ≥ 70 %; si baja, el pipeline falla.
  coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } },
};
