import type { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ApiError, type ApiErrorBody } from '../lib/errors.js'
import { env } from '../config/env.js'

function isBodyParserError(err: unknown, type: string): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: unknown }).type === type
}

function fieldsOf(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = error.meta?.['target']
  if (Array.isArray(target)) return target.filter((t): t is string => typeof t === 'string')
  if (typeof target === 'string') return [target]
  return []
}

function translatePrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (error.code) {
    case 'P2002': {
      const fields = fieldsOf(error)

      if (fields.includes('committeeId') && fields.includes('country')) {
        return ApiError.conflict('That country is already assigned in this committee', { fields })
      }
      if (fields.includes('delegateId')) {
        return ApiError.conflict('This delegate already has an assignment', { fields })
      }
      const label = fields.length > 0 ? fields.join(', ') : 'value'
      return ApiError.conflict(`A record with that ${label} already exists`, { fields })
    }
    case 'P2003':
      return ApiError.badRequest('Referenced record does not exist', { field: error.meta?.['field_name'] })
    case 'P2025':
      return ApiError.notFound('Record not found')
    default:
      return ApiError.internal()
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = { error: `No route for ${req.method} ${req.path}`, code: 404 }
  res.status(404).json(body)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let apiError: ApiError

  if (err instanceof ApiError) {
    apiError = err
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = translatePrismaError(err)
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    apiError = ApiError.badRequest('Invalid query for the current schema')
  } else if (err instanceof SyntaxError && 'body' in err) {
    apiError = ApiError.badRequest('Request body is not valid JSON')
  } else if (isBodyParserError(err, 'entity.too.large')) {
    apiError = new ApiError(413, 'That request is too large')
  } else if (isBodyParserError(err, 'entity.parse.failed')) {
    apiError = ApiError.badRequest('Request body could not be parsed')
  } else if (isBodyParserError(err, 'encoding.unsupported')) {
    apiError = ApiError.badRequest('Unsupported content encoding')
  } else {
    apiError = ApiError.internal()
  }

  const deliberate = err instanceof ApiError
  if (apiError.code >= 500 && !deliberate) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err)
  }

  const body = apiError.toBody()
  if (env.EXPOSE_ERROR_DETAILS && apiError.code >= 500 && !deliberate && err instanceof Error) {
    body.details = { message: err.message, stack: err.stack }
  }

  res.status(apiError.code).json(body)
}
