// Local tangent-plane projection shared with scripts/build-data.mjs: x = east (m), z = south (m).
export const LAT0 = 32.090, LON0 = 34.880;
const PHI = LAT0 * Math.PI / 180;
export const KX = 111412.84 * Math.cos(PHI) - 93.5 * Math.cos(3 * PHI);
export const KZ = 111132.92 - 559.82 * Math.cos(2 * PHI) + 1.175 * Math.cos(4 * PHI);
export const toLocal = (lat, lon) => ({ x: (lon - LON0) * KX, z: -(lat - LAT0) * KZ });
export const toLatLon = (x, z) => ({ lat: LAT0 - z / KZ, lon: LON0 + x / KX });
