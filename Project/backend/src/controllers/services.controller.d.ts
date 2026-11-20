import type { Request, Response } from 'express';
import { type ServiceSettings } from '@livingplus/shared';
export declare function settingsFor(propertyId: string): Promise<ServiceSettings>;
/** Owner: which services this PG offers, and their prices. */
export declare const updateServiceSettings: (req: Request, res: Response) => Promise<any>;
/** Resident: my orders (upcoming first) and what my PG offers. */
export declare const listMyServiceOrders: (req: Request, res: Response) => Promise<any>;
/** Resident: order a meal or book housekeeping for a day and slot. */
export declare const createServiceOrder: (req: Request, res: Response) => Promise<any>;
/** Resident: cancel an order the PG has not confirmed yet. */
export declare const cancelMyServiceOrder: (req: Request, res: Response) => Promise<any>;
/** Staff: orders for one day across my PGs, with meal head-counts for the kitchen. */
export declare const listStaffServiceOrders: (req: Request, res: Response) => Promise<any>;
/** Staff: confirm, complete or cancel an order. */
export declare const updateServiceOrderStatus: (req: Request, res: Response) => Promise<any>;
//# sourceMappingURL=services.controller.d.ts.map