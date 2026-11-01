import type { Request, Response } from 'express';
export declare const login: (req: Request, res: Response) => Promise<any>;
export declare const register: (req: Request, res: Response) => Promise<any>;
export declare const requestOtp: (req: Request, res: Response) => Promise<any>;
export declare const verifyOtp: (req: Request, res: Response) => Promise<any>;
export declare function consumePhoneToken(phone: string, token: string | undefined, purpose?: string): Promise<boolean>;
export declare const forgotPassword: (_req: Request, res: Response) => Promise<any>;
export declare const changePassword: (req: Request, res: Response) => Promise<any>;
export declare const adminResetPassword: (req: Request, res: Response) => Promise<any>;
export declare const updateProfile: (req: Request, res: Response) => Promise<any>;
//# sourceMappingURL=pg-auth.controller.d.ts.map