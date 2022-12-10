/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  testTimeout: 5000,
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["**/(test|src)/**/?(*.)+(spec|test).[jt]s?(x)"],
};
