// Image optimization utilities for better performance

export interface ImageSize {
  width: number;
  height: number;
  quality?: number;
}

export type ImageFormat = "webp" | "jpeg" | "avif" | "original";

export interface OptimizedImageOptions {
  format?: ImageFormat[];
  sizes?: ImageSize[];
  quality?: number;
}

// Image size presets for different use cases
export const IMAGE_SIZES = {
  thumbnail: { width: 150, height: 150, quality: 80 },
  small: { width: 300, height: 300, quality: 85 },
  medium: { width: 600, height: 600, quality: 90 },
  large: { width: 1200, height: 1200, quality: 95 },
} as const;

/**
 * Generate optimized image URLs with multiple formats and sizes
 */
export function getOptimizedImageUrl(
  path: string | null | undefined,
  options: OptimizedImageOptions = {}
): string[] {
  if (!path) return [];

  const {
    format = ["webp", "jpeg"],
    sizes = [IMAGE_SIZES.medium],
    quality = 85,
  } = options;

  // If it's already a full URL or data URL, return as-is
  if (/^https?:\/\//i.test(path) || path.startsWith("data:image/")) {
    return [path];
  }

  const urls: string[] = [];

  // Generate URLs for each format and size combination
  for (const size of sizes) {
    for (const fmt of format) {
      const params = new URLSearchParams({
        width: size.width.toString(),
        height: size.height.toString(),
        quality: (size.quality || quality).toString(),
        format: fmt,
      });

      // Assuming Supabase Storage with image transformation
      // You might need to adjust this based on your setup
      try {
        const optimizedUrl = `${path}?${params.toString()}`;
        urls.push(optimizedUrl);
      } catch (error) {
        console.warn("Error generating optimized URL:", error);
        urls.push(path); // Fallback to original
      }
    }
  }

  return urls.length > 0 ? urls : [path];
}

/**
 * Get the best image URL based on browser support and viewport
 */
export function getBestImageUrl(
  path: string | null | undefined,
  viewportWidth?: number
): string {
  if (!path) return "";

  // If it's already optimized or external, return as-is
  if (/^https?:\/\//i.test(path) || path.startsWith("data:image/")) {
    return path;
  }

  // Determine best size based on viewport
  let size: (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES] = IMAGE_SIZES.medium;
  if (viewportWidth) {
    if (viewportWidth < 400) {
      size = IMAGE_SIZES.small;
    } else if (viewportWidth > 800) {
      size = IMAGE_SIZES.large;
    }
  }

  // Determine best format based on browser support
  const formats = getSupportedFormats();

  try {
    const params = new URLSearchParams({
      width: size.width.toString(),
      height: size.height.toString(),
      quality: size.quality.toString(),
      format: formats[0], // Use the best supported format
    });

    return `${path}?${params.toString()}`;
  } catch (error) {
    console.warn("Error generating best image URL:", error);
    return path; // Fallback to original
  }
}

/**
 * Legacy function for backward compatibility - used by MediaCarousel and Avatar
 */
export function optimizeImageUrl(
  url: string,
  size: "small" | "medium" | "large" = "medium",
  quality: number = 85
): string {
  if (!url) return "";

  const sizeMap = {
    small: IMAGE_SIZES.small.width,
    medium: IMAGE_SIZES.medium.width,
    large: IMAGE_SIZES.large.width,
  };

  return getBestImageUrl(url, sizeMap[size]);
}

/**
 * Detect supported image formats
 */
function getSupportedFormats(): ImageFormat[] {
  if (typeof window === "undefined") return ["jpeg"];

  // Check for WebP support
  const webpSupported = checkFormatSupport("webp");
  // Check for AVIF support
  const avifSupported = checkFormatSupport("avif");

  const formats: ImageFormat[] = [];

  if (avifSupported) formats.push("avif");
  if (webpSupported) formats.push("webp");
  formats.push("jpeg"); // Always have JPEG as fallback

  return formats;
}

/**
 * Check if browser supports specific image format
 */
function checkFormatSupport(format: string): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(`image/${format}`).indexOf(`image/${format}`) === 5;
  } catch {
    return false;
  }
}

/**
 * Preload images for better performance
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Preload multiple images
 */
export async function preloadImages(srcs: string[]): Promise<void> {
  const promises = srcs.map((src) =>
    preloadImage(src).catch(() => {
      console.warn(`Failed to preload image: ${src}`);
    })
  );
  await Promise.all(promises);
}

/**
 * Get responsive image sources for different screen sizes
 */
export function getResponsiveImageSrcs(
  path: string,
  sizes: string[] = [
    "(max-width: 400px) 300px",
    "(max-width: 800px) 600px",
    "1200px",
  ]
): { srcSet: string; sizes: string } {
  if (!path) return { srcSet: "", sizes: "" };

  const srcSet = sizes
    .map((size, index) => {
      const sizeObj =
        index === 0
          ? IMAGE_SIZES.small
          : index === 1
          ? IMAGE_SIZES.medium
          : IMAGE_SIZES.large;
      const optimizedUrl = getBestImageUrl(path, sizeObj.width);
      return `${optimizedUrl} ${sizeObj.width}w`;
    })
    .join(", ");

  return {
    srcSet,
    sizes: sizes.join(", "),
  };
}
