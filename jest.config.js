/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/simulador/guarda-somente-leitura.ts'],
  testMatch: ['**/test/**/*.spec.ts'],
};
