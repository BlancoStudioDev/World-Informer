export const GLOBE_R = 100

/** Coordinate cartesiane di three-globe (stessa formula di getCoords, senza allocare oggetti). */
export function polar2xyz(lat: number, lng: number, alt: number, out: Float32Array, o: number) {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((90 - lng) * Math.PI) / 180, r = GLOBE_R * (1 + alt)
  out[o] = r * Math.sin(phi) * Math.cos(th)
  out[o + 1] = r * Math.cos(phi)
  out[o + 2] = r * Math.sin(phi) * Math.sin(th)
}
