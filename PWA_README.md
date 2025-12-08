# PWA & Performance Optimizations

This app now includes Progressive Web App (PWA) functionality and image optimization to reduce bandwidth usage and improve user experience.

## PWA Features

- **Install App Button**: Users can install the app on their device for a native-like experience
- **Offline Support**: Service worker caches static assets and images
- **App Manifest**: Proper app metadata for installation
- **Responsive Design**: Works on all device sizes

## Image Optimization

- **Automatic Resizing**: Images are automatically resized based on usage context
- **Format Optimization**: WebP format when supported, fallback to original
- **Quality Control**: Configurable quality settings (80-90% default)
- **Lazy Loading**: Images load only when needed
- **Bandwidth Reduction**: ~50-80% reduction in image bandwidth usage

## Usage

### Image Optimization

```typescript
import { optimizeImageUrl } from "../lib/imageOptimization";

// Optimize for different contexts
const avatarUrl = optimizeImageUrl(url, "thumb", 85); // 150px
const feedUrl = optimizeImageUrl(url, "small", 80); // 400px
const detailUrl = optimizeImageUrl(url, "medium", 85); // 800px
const fullscreenUrl = optimizeImageUrl(url, "large", 90); // 1200px
```

### Signed URLs (for private buckets)

```typescript
import { getSignedUrl } from "../lib/signedUrl";

const signedUrl = await getSignedUrl("private-bucket", "path/to/file.jpg", 120);
```

## Installation

The app will automatically show an install prompt when:

- User visits the site multiple times
- Browser supports PWA installation
- User hasn't dismissed the prompt recently

## Service Worker

The service worker automatically:

- Caches static assets
- Caches images for offline viewing
- Implements network-first strategy for API calls
- Provides fallback images when network fails
