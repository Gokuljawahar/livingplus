import type { Request } from 'express';
export type StorageKind = 'local' | 'gcs' | 's3';
export declare const storageKind: () => StorageKind;
export declare function localUploadPath(fileKey: string): string | null;
export declare function newFileKey(extension: 'webp' | 'pdf'): string;
export interface GcsFileLike {
    save(data: Buffer, options: {
        contentType: string;
        resumable: boolean;
    }): Promise<unknown>;
    getSignedUrl(options: {
        version: 'v4';
        action: 'read' | 'write';
        expires: number;
        contentType?: string;
    }): Promise<[string]>;
    download?(): Promise<[Buffer]>;
}
export interface GcsBucketLike {
    file(name: string): GcsFileLike;
}
/** Test hook: replace the Cloud Storage bucket with a fake (null restores). */
export declare function setGcsBucketForTests(bucket: GcsBucketLike | null): void;
/** Stores a validated file under fileKey. Local writes never overwrite. */
export declare function putFile(fileKey: string, data: Buffer, contentType: string): Promise<void>;
/** Reads a stored file back (for server-side checks such as AI KYC reading). */
export declare function readStoredFile(fileKey: string): Promise<{
    data: Buffer;
    contentType: string;
}>;
/**
 * A short-lived URL to view an already-authorized file, or null when the file
 * does not exist (local storage) or cannot be signed.
 */
export declare function viewUrl(req: Request, fileKey: string): Promise<string | null>;
/** A signed direct-upload URL (cloud storage only; local uses the proxy upload). */
export declare function directUploadUrl(fileKey: string, contentType: string): Promise<string>;
//# sourceMappingURL=storage.d.ts.map