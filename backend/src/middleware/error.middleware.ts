import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Priority: AppError.statusCode → Express err.status (body-parser etc.) → res.statusCode → 500
  let statusCode = err.statusCode ?? err.status ?? (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message || 'Internal Server Error';

  // — Prisma error codes ———————————————————————————————————————
  if (err.code === 'P2002') {
    statusCode = 409; // Conflict is semantically more correct than 400
    // Don't expose DB field names (err.meta?.target) in production
    message = isProduction
      ? 'A resource with that value already exists'
      : `Duplicate field value: ${err.meta?.target}`;
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  } else if (err.code === 'P2003') {
    statusCode = 400;
    message = 'Related record not found';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  // Log server errors for observability (500-range)
  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Only expose stack trace during development
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
