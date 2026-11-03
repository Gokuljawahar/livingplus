import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/auth-config.js';

export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  if (token) {
    try {
      (req as any).user = jwt.verify(token, getJwtSecret());
    } catch {
      // Invalid or expired token: continue as guest rather than blocking chat.
    }
  }
  next();
};

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authorization token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'Authorization token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    const hostPropertyId = (req as any).pgPropertyId as string | undefined;
    const tokenPropertyId = typeof decoded.propertyId === 'string' ? decoded.propertyId : undefined;
    if (hostPropertyId && tokenPropertyId !== hostPropertyId && decoded.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'This session is not valid for this PG host' });
      return;
    }
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
