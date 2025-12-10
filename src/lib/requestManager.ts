type Priority = "high" | "medium" | "low";

interface RequestResult<T> {
  data: T | null;
  error: any;
}

class RequestManager {
  public requests: Map<string, AbortController> = new Map();

  async execute<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    priority: Priority = "medium"
  ): Promise<RequestResult<T>> {
    // Cancel existing request with same key
    this.cancel(key);

    const abortController = new AbortController();
    this.requests.set(key, abortController);

    try {
      const data = await fn(abortController.signal);
      if (abortController.signal.aborted) {
        return { data: null, error: new Error("Aborted") };
      }
      return { data, error: null };
    } catch (error: any) {
      if (error.name === "AbortError" || abortController.signal.aborted) {
        return { data: null, error: new Error("Aborted") };
      }
      return { data: null, error };
    } finally {
      this.requests.delete(key);
    }
  }

  cancel(key: string): void {
    const controller = this.requests.get(key);
    if (controller) {
      controller.abort();
      this.requests.delete(key);
    }
  }

  cancelAll(): void {
    this.requests.forEach((controller) => controller.abort());
    this.requests.clear();
  }
}

export const requestManager = new RequestManager();

export function cancelContextRequests(context: string): void {
  requestManager.requests.forEach((_, key) => {
    if (key.startsWith(context)) {
      requestManager.cancel(key);
    }
  });
}

