/**
 * Map chip texture: blue gradient + **white grid lines** + green park (readable on both
 * light Google Maps tab and dark finalize pills). Replaces dark navy strokes.
 */
const mapsTabTextureWhiteGridSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#c5d9e8"/><stop offset="100%" stop-color="#a3bdd4"/></linearGradient></defs><rect fill="url(#m)" width="200" height="100"/><path stroke="rgba(255,255,255,0.92)" stroke-width="1.45" fill="none" d="M0 22h200M0 50h200M0 78h200M40 0v100M80 0v100M120 0v100M160 0v100"/><path stroke="rgba(255,255,255,0.72)" stroke-width="1" fill="none" d="M20 0v100M60 0v100M100 0v100M140 0v100M180 0v100"/><path fill="rgba(52,211,153,0.48)" d="M148 8c14 6 22 22 18 36-10 6-30-8-32-26 2-12 8-14 14-10z"/><path stroke="rgba(255,255,255,0.5)" stroke-width="0.55" fill="none" d="M0 36h200M0 64h200M28 0v100M92 0v100M152 0v100"/></svg>`;

export const MAPS_LINK_TAB_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent(
  mapsTabTextureWhiteGridSvg
)}")`;
