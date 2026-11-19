export interface LocalPostgres {
    url: string;
    stop(): Promise<void>;
}
export interface LocalPostgresOptions {
    dir: string;
    port: number;
    database: string;
    /** Keep the data directory after stop (development) or delete it (tests). */
    persistent: boolean;
    user?: string;
    password?: string;
}
export declare function startLocalPostgres(options: LocalPostgresOptions): Promise<LocalPostgres>;
//# sourceMappingURL=local-postgres.d.ts.map