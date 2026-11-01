import type { Request, Response, NextFunction } from 'express';
export declare function encryptData(data: unknown): string;
export declare function decryptRequest(req: Request, res: Response, next: NextFunction): void;
export declare function encryptResponse(_req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=encryption.middleware.d.ts.map