import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { authRouter } from './auth.routes.js'
import { integrationsRouter } from './integrations.routes.js'
import { publicRouter } from './public.routes.js'
import { registrationsRouter } from './registrations.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { delegatesRouter } from './delegates.routes.js'
import { committeesRouter } from './committees.routes.js'
import { assignmentsRouter } from './assignments.routes.js'
import { logisticsRouter } from './logistics.routes.js'
import { attendanceRouter } from './attendance.routes.js'
import { usersRouter } from './users.routes.js'
import { auditRouter } from './audit.routes.js'
import { exportsRouter } from './exports.routes.js'
import { pushRouter } from './push.routes.js'
import { settingsRouter } from './settings.routes.js'
import { dangerRouter } from './danger.routes.js'

export const apiRouter = Router()

/* --- Routes with their own authentication -------------------------------- */
// /auth issues tokens; /integrations carries the Apps Script webhook, which
// authenticates with a shared secret rather than a JWT; /public carries the
// registration form on the conference website, which has no caller to
// authenticate at all and defends itself with rate limits and a honeypot
// instead. All three are mounted before the global guard.
apiRouter.use('/auth', authRouter)
apiRouter.use('/integrations', integrationsRouter)
apiRouter.use('/public', publicRouter)

/* --- Everything below requires a valid access token ---------------------- */
apiRouter.use(requireAuth)

apiRouter.use('/dashboard', dashboardRouter)
apiRouter.use('/delegates', delegatesRouter)
apiRouter.use('/registrations', registrationsRouter)
apiRouter.use('/committees', committeesRouter)
apiRouter.use('/assignments', assignmentsRouter)
apiRouter.use('/logistics-requests', logisticsRouter)
apiRouter.use('/attendance', attendanceRouter)
apiRouter.use('/users', usersRouter)
apiRouter.use('/audit-logs', auditRouter)
apiRouter.use('/exports', exportsRouter)
apiRouter.use('/push', pushRouter)
apiRouter.use('/settings', settingsRouter)
// Irreversible bulk operations. ADMIN plus a passphrase — see danger.routes.
apiRouter.use('/danger', dangerRouter)
