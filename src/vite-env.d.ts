/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_GOOGLE_IOS_CLIENT_ID?: string;
  readonly VITE_GOOGLE_IOS_URL_SCHEME?: string;
  /** Bunny Stream CDN hostname (public, non-secret). HLS: https://{host}/{videoId}/playlist.m3u8 */
  readonly VITE_BUNNY_STREAM_CDN_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "swiper/css/zoom";
