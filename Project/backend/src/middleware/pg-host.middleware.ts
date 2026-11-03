import type { NextFunction, Request, Response } from 'express';
import { resolveHostContext } from '../utils/pg-slug.js';

export function resolvePgHost(db: any) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const hostContext = resolveHostContext(req.hostname);
    const requestedSlug = String(req.get('x-pg-slug') || '').trim().toLowerCase();
    const hostSlug = hostContext.kind === 'property' ? hostContext.slug : '';
    if (requestedSlug && hostSlug && requestedSlug !== hostSlug) {
      res.status(400).json({ message: 'PG host does not match the requested property' });
      return;
    }

    if (hostContext.kind === 'unknown') {
      res.status(404).json({ message: 'Host is not configured' });
      return;
    }

    const slug = hostSlug || requestedSlug;
    let propertyId: string | undefined;
    if (slug) {
      const property = await db.pGProperty.findFirst({
        where: { slug },
        select: { id: true }
      });
      if (!property) {
        res.status(404).json({ message: 'PG site not found' });
        return;
      }
      propertyId = property.id;
    }

    (req as any).pgHostContext = hostContext;
    (req as any).pgSlug = slug || undefined;
    (req as any).pgPropertyId = propertyId;
    next();
  };
}