// tiny in-memory cache
const map = new Map<string, any>();
export const pageCache = {
  get: (k: string) => map.get(k),
  set: (k: string, v: any) => map.set(k, v),
};
