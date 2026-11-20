import { resolveHostContext } from '../utils/pg-slug.js';
import { asSystem, setDbHostProperty } from '../db/context.js';
export function resolvePgHost(db) {
    return async (req, res, next) => {
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
        let propertyId;
        if (slug) {
            // Unpublished PGs keep their resident site, so look the slug up regardless of status.
            const property = await asSystem('resolve a PG slug to its id', () => db.pGProperty.findFirst({
                where: { slug },
                select: { id: true }
            }));
            if (!property) {
                res.status(404).json({ message: 'PG site not found' });
                return;
            }
            propertyId = property.id;
        }
        req.pgHostContext = hostContext;
        req.pgSlug = slug || undefined;
        req.pgPropertyId = propertyId;
        setDbHostProperty(req, propertyId);
        next();
    };
}
//# sourceMappingURL=pg-host.middleware.js.map