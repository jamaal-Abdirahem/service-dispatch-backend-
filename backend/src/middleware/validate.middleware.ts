import { Request, Response, NextFunction } from 'express';

/**
 * Lightweight body validator.
 * Checks that all required fields are present and non-empty.
 */
export const validateBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing: string[] = [];

    for (const field of requiredFields) {
      const value = req.body[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
      return;
    }

    next();
  };
};
