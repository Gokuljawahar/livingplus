import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/auth-config.js';
export const optionalAuthenticate = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    if (token) {
        try {
            req.user = jwt.verify(token, getJwtSecret());
        }
        catch {
            // Invalid or expired token: continue as guest rather than blocking chat.
        }
    }
    next();
};
export const authenticate = (req, res, next) => {
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
        const decoded = jwt.verify(token, getJwtSecret());
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};
//# sourceMappingURL=auth.middleware.js.map