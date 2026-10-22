import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  // The compiler rewrites "@/" in imports, but jest.mock() needs it resolved as well
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // A build leaves a copy of package.json in .next/standalone
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
}

// Packages published only as ES modules, which Jest must transform like our own code
const esmPackages = ['cookie']

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
const jestConfig = async () => {
  const base = await createJestConfig(config)()
  return {
    ...base,
    transformIgnorePatterns: [
      `/node_modules/(?!(${esmPackages.join('|')})/)`,
      ...base.transformIgnorePatterns.filter((p) => !p.includes('/node_modules/')),
    ],
  }
}

export default jestConfig
