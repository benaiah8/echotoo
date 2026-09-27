/**
 * Edit Profile open-fetch may resolve after the user already mutated photos.
 * Compare generations captured at fetch start vs resolve time.
 */
export function shouldApplyHydratedProfilePhotos(
  generationAtFetchStart: number,
  currentGeneration: number,
): boolean {
  return generationAtFetchStart === currentGeneration;
}
