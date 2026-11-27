// Campuses and offices people move to a city for, provisioned dynamically in
// PostgreSQL (`PlatformCatalog.landmarks`) and used by discovery + AI search.

export interface Landmark {
  id: string;
  name: string;
  kind: 'campus' | 'office' | string;
  latitude: number;
  longitude: number;
}

export const CHENNAI_LANDMARKS: readonly Landmark[] = [
  { id: 'iit-madras', name: 'IIT Madras', kind: 'campus', latitude: 12.9916, longitude: 80.2336 },
  { id: 'anna-university', name: 'Anna University, Guindy', kind: 'campus', latitude: 13.0108, longitude: 80.2354 },
  { id: 'tidel-park', name: 'Tidel Park, Taramani', kind: 'office', latitude: 12.9894, longitude: 80.2483 },
  { id: 'olympia-tech-park', name: 'Olympia Tech Park, Guindy', kind: 'office', latitude: 13.0094, longitude: 80.2120 },
  { id: 'elcot-sholinganallur', name: 'ELCOT IT Park, Sholinganallur', kind: 'office', latitude: 12.8996, longitude: 80.2270 },
  { id: 'sipcot-siruseri', name: 'SIPCOT IT Park, Siruseri', kind: 'office', latitude: 12.8262, longitude: 80.2185 }
];

/** Great-circle distance in km between two points. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Finds a landmark by id or by a loose name ("tidel", "IIT madras") from the active catalog. */
export function findLandmark(query: string, landmarks: readonly Landmark[] = CHENNAI_LANDMARKS): Landmark | null {
  const text = query.trim().toLowerCase();
  if (!text) return null;
  return landmarks.find((place) => place.id === text)
    ?? landmarks.find((place) => place.name.toLowerCase().includes(text) || text.includes(place.name.toLowerCase().split(',')[0]!))
    ?? null;
}

/** "about 1.2 km" under 10 km, "about 14 km" beyond. */
export function formatDistance(km: number): string {
  return `about ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
