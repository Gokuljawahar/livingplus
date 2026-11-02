export declare function slugifyPgName(name: string): string;
export declare function createUniquePgSlug(db: any, name: string): Promise<string>;
export declare function assignMissingPgSlugs(db: any): Promise<number>;
export type HostContext = {
    kind: 'public';
} | {
    kind: 'platform-admin';
} | {
    kind: 'api';
} | {
    kind: 'property';
    slug: string;
} | {
    kind: 'unknown';
};
export declare function resolveHostContext(hostname: string, rootDomain?: string): HostContext;
//# sourceMappingURL=pg-slug.d.ts.map