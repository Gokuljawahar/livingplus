// Campuses and offices people move to Chennai for, so guests can see how far
// each PG is from where they'll study or work. Coordinates are approximate
// (main gate / campus centre); distances are straight-line, so the UI says
// "about". Used by the guest site and the assistant's search tool.
export const CHENNAI_LANDMARKS = [
    { id: 'iit-madras', name: 'IIT Madras', kind: 'campus', latitude: 12.9916, longitude: 80.2336 },
    { id: 'anna-university', name: 'Anna University, Guindy', kind: 'campus', latitude: 13.0108, longitude: 80.2354 },
    { id: 'tidel-park', name: 'Tidel Park, Taramani', kind: 'office', latitude: 12.9894, longitude: 80.2483 },
    { id: 'olympia-tech-park', name: 'Olympia Tech Park, Guindy', kind: 'office', latitude: 13.0094, longitude: 80.2120 },
    { id: 'elcot-sholinganallur', name: 'ELCOT IT Park, Sholinganallur', kind: 'office', latitude: 12.8996, longitude: 80.2270 },
    { id: 'sipcot-siruseri', name: 'SIPCOT IT Park, Siruseri', kind: 'office', latitude: 12.8262, longitude: 80.2185 }
];
/** Great-circle distance in km between two points. */
export function distanceKm(a, b) {
    const rad = (degrees) => (degrees * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Finds a landmark by id or by a loose name ("tidel", "IIT madras"). */
export function findLandmark(query) {
    const text = query.trim().toLowerCase();
    if (!text)
        return null;
    return CHENNAI_LANDMARKS.find((place) => place.id === text)
        ?? CHENNAI_LANDMARKS.find((place) => place.name.toLowerCase().includes(text) || text.includes(place.name.toLowerCase().split(',')[0]))
        ?? null;
}
/** "about 1.2 km" under 10 km, "about 14 km" beyond. */
export function formatDistance(km) {
    return `about ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
