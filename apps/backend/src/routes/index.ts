import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { authRouter } from './auth.routes.js'
import { integrationsRouter } from './integrations.routes.js'
import { publicRouter } from './public.routes.js'
import { registrationsRouter } from './registrations.routes.js'
import { referralsRouter } from './referrals.routes.js'
import { dashboardRouter } from './dashboard.routes.js'
import { delegatesRouter } from './delegates.routes.js'
import { committeesRouter } from './committees.routes.js'
import { matrixRouter } from './matrix.routes.js'
import { logisticsRouter } from './logistics.routes.js'
import { attendanceRouter } from './attendance.routes.js'
import { allocationsRouter } from './allocations.routes.js'
import { conferenceRouter } from './conference.routes.js'
import { ledgerRouter } from './ledger.routes.js'
import { usersRouter } from './users.routes.js'
import { auditRouter } from './audit.routes.js'
import { exportsRouter } from './exports.routes.js'
import { pushRouter } from './push.routes.js'
import { settingsRouter } from './settings.routes.js'
import { dangerRouter } from './danger.routes.js'

export const apiRouter = Router()

apiRouter.use('/auth', authRouter)
apiRouter.use('/integrations', integrationsRouter)
apiRouter.use('/public', publicRouter)

apiRouter.use(requireAuth)

apiRouter.use('/dashboard', dashboardRouter)
apiRouter.use('/delegates', delegatesRouter)
apiRouter.use('/registrations', registrationsRouter)
apiRouter.use('/referrals', referralsRouter)
apiRouter.use('/committees', committeesRouter)

apiRouter.use('/matrix', matrixRouter)
apiRouter.use('/logistics-requests', logisticsRouter)
apiRouter.use('/attendance', attendanceRouter)
apiRouter.use('/allocations', allocationsRouter)
apiRouter.use('/conference', conferenceRouter)
apiRouter.use('/ledger', ledgerRouter)
apiRouter.use('/users', usersRouter)
apiRouter.use('/audit-logs', auditRouter)
apiRouter.use('/exports', exportsRouter)
apiRouter.use('/push', pushRouter)
apiRouter.use('/settings', settingsRouter)

apiRouter.use('/danger', dangerRouter)
