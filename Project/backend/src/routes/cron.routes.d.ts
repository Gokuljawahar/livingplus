import { Router, type NextFunction, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
export declare function authorizeCron(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function cronRoutes(prisma: PrismaClient): Router;
//# sourceMappingURL=cron.routes.d.ts.map