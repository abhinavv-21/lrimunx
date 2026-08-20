import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    poolOptions: { forks: { singleFork: true } },
    passWithNoTests: false,
    env: {
      S3_ENDPOINT: 'https://testproject.supabase.co/storage/v1/s3',
      S3_BUCKET: 'lrimunx-test',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_REGION: 'ap-south-1',
    },
  },
})
