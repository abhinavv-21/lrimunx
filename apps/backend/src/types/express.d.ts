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
      /** Populated by requireAuth. Absent on public routes. */
      user?: AuthUser
      /** Set by recordAudit so the audit guard can verify admin mutations were logged. */
      auditWritten?: boolean
    }
  }
}

export {}
