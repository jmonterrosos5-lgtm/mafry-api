// Pruebas de INTEGRACIÓN (existentes desde la v2): supertest contra una base PostgreSQL real.
// No son pruebas unitarias; se ejecutan aparte con `npm run test:integration`.
module.exports = {
  testEnvironment: 'node',
  testTimeout: 20000,
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports', outputName: 'junit-integracion.xml' }]],
  coverageDirectory: 'coverage/integracion',
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  setupFiles: ['<rootDir>/tests/env.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  testMatch: ['<rootDir>/tests/*.test.js'],
};
