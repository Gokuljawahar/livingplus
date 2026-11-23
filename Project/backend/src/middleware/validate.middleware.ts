// Express middleware for Zod request body and query validation.
// Produces the same 400 { message, issues } payload as utils/validate.ts so
// frontend toasts and error handling stay identical across every endpoint.
import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';
import { INVALID_REQUEST } from '../utils/validate.js';

export function validateBody<T extends z.ZodType>(schema: T, message = INVALID_REQUEST) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      res.status(400).json({
        message,
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodType>(schema: T, message = INVALID_REQUEST) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      res.status(400).json({
        message,
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
      });
      return;
    }
    next();
  };
}
