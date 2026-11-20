export interface Landmark {
    id: string;
    name: string;
    kind: 'campus' | 'office';
    latitude: number;
    longitude: number;
}
export declare const CHENNAI_LANDMARKS: readonly Landmark[];
/** Great-circle distance in km between two points. */
export declare function distanceKm(a: {
    latitude: number;
    longitude: number;
}, b: {
    latitude: number;
    longitude: number;
}): number;
/** Finds a landmark by id or by a loose name ("tidel", "IIT madras"). */
export declare function findLandmark(query: string): Landmark | null;
/** "about 1.2 km" under 10 km, "about 14 km" beyond. */
export declare function formatDistance(km: number): string;
