import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // These suites cover pure logic only. Anything touching PostgreSQL lives
    // behind the integration suite, which needs a live DATABASE_URL.
    passWithNoTests: false,
    /*
      A bucket the tests can assume, and a fake one on purpose.

      `isStorageUrl` answers false for EVERY url when no store is configured —
      correct in production, since with no bucket there is no such thing as one
      of our URLs — but it means the schema suite would otherwise be testing the
      unconfigured path in every case rather than the rule it means to check.
      Nothing is ever fetched from these; only the shape is load-bearing.
    */
    env: {
      S3_ENDPOINT: 'https://testproject.supabase.co/storage/v1/s3',
      S3_BUCKET: 'lrimunx-test',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_REGION: 'ap-south-1',
    },
  },
})
