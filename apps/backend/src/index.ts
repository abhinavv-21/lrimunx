import { createApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { initialisePush } from './lib/push.js'

async function main(): Promise<void> {
  try {
    await prisma.$connect()
  } catch (error) {
    console.error(
      '\nCould not connect to PostgreSQL using DATABASE_URL.\n' +
        'Start a database and run `npx prisma migrate dev` before starting the API.\n',
      error,
    )
    process.exit(1)
  }

  initialisePush()

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    console.log(`[api] LRI MUN X Operations Hub listening on http://localhost:${env.PORT}/api/v1`)
  })

  const shutdown = (signal: string) => {
    console.log(`\n[api] ${signal} received, shutting down…`)
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0))
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

void main()
