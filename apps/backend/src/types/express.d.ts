import type { Role } from '@prisma/client'

export interface AuthUser {
  id: string
  username: string
  fullName: string
  role: Role
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser

      auditWritten?: boolean
    }
  }
}

export {}
