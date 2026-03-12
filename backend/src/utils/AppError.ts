/**
 * Application-level error that carries an HTTP status code.
 * Throw this from services/controllers instead of plain `new Error(...)`.
 * The global error handler reads `.statusCode` to set the HTTP response status.
 *
 * Usage:
 *   throw new AppError('Phone number already registered', 409);
 *   throw new AppError('Invalid credentials', 401);
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain (needed when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
