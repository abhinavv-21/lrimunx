export interface ApiErrorBody {
  error: string
  code: number
  details?: unknown
}

export class ApiError extends Error {
  readonly code: number
  readonly details?: unknown

  constructor(code: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }

  toBody(): ApiErrorBody {
    return this.details === undefined
      ? { error: this.message, code: this.code }
      : { error: this.message, code: this.code, details: this.details }
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, message, details)
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message)
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message)
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message)
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, details)
  }

  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, message, details)
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message)
  }
}
