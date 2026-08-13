import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { ZodError, type ZodSchema } from 'zod'
import { ApiError } from '../lib/errors.js'

type Source = 'body' | 'query' | 'params'

function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }))
}

export function validate<T>(schema: ZodSchema<T>, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      next(ApiError.unprocessable('Request validation failed', formatZodError(result.error)))
      return
    }

    ;(req as unknown as Record<Source, unknown>)[source] = result.data
    next()
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}
