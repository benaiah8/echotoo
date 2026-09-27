export function createLocalVideoPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeLocalVideoPreviewUrl(url: string | null | undefined): void {
  if (url) {
    URL.revokeObjectURL(url);
  }
}
