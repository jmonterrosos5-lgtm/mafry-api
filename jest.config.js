module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'reports/coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/db.js',
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
    }],
  ],
  testTimeout: 10000,
};
