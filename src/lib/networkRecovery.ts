/**
 * [OPTIMIZATION FILE: Phase 7]
 * 
 * Network recovery and automatic retry utilities
 * 
 * Optimizations included:
 * - Network status monitoring
 * - Automatic retry when network comes back online
 * - Failed request queuing
 * 
 * Related optimizations:
 * - See: src/lib/retry.ts for retry utilities
 * - See: App.tsx for network recovery initialization
 */

type QueuedRequest = {
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
};

/**
 * [OPTIMIZATION: Phase 7.1.6] Network recovery manager
 * Why: Automatically retries failed requests when network comes back online
 */
class NetworkRecoveryManager {
  private queue: QueuedRequest[] = [];
  private maxQueueSize = 50; // Limit queue size to prevent memory issues
  private maxQueueAge = 5 * 60 * 1000; // 5 minutes - don't retry very old requests
  private isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  private listeners: Array<() => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      // Listen for online/offline events
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
  }

  private handleOnline = () => {
    console.log("[NetworkRecovery] Network came back online");
    this.isOnline = true;
    this.processQueue();
    // Notify listeners
    this.listeners.forEach((listener) => listener());
  };

  private handleOffline = () => {
    console.log("[NetworkRecovery] Network went offline");
    this.isOnline = false;
  };

  /**
   * Queue a failed request for retry when network comes back
   */
  queueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // Remove old requests from queue
      const now = Date.now();
      this.queue = this.queue.filter(
        (req) => now - req.timestamp < this.maxQueueAge
      );

      // Limit queue size
      if (this.queue.length >= this.maxQueueSize) {
        // Remove oldest request
        this.queue.shift();
      }

      this.queue.push({
        fn,
        resolve,
        reject,
        timestamp: now,
      });

      // If already online, try immediately
      if (this.isOnline) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue() {
    if (!this.isOnline || this.queue.length === 0) return;

    const requests = [...this.queue];
    this.queue = [];

    console.log(
      `[NetworkRecovery] Processing ${requests.length} queued requests`
    );

    for (const request of requests) {
      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        // If still failing, might be server error - don't re-queue
        request.reject(error);
      }
    }
  }

  /**
   * Register a callback for when network comes back online
   */
  onNetworkOnline(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Check if currently online
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
    this.queue = [];
    this.listeners = [];
  }
}

// Singleton instance
export const networkRecovery = new NetworkRecoveryManager();

/**
 * [OPTIMIZATION: Phase 7.1.6] Wrap a request with network recovery
 * Why: Automatically retries when network comes back online
 */
export async function withNetworkRecovery<T>(
  fn: () => Promise<T>
): Promise<T> {
  if (networkRecovery.getOnlineStatus()) {
    // Online - execute immediately
    try {
      return await fn();
    } catch (error: any) {
      // If network error, queue for retry
      if (!error.response && !error.status) {
        return networkRecovery.queueRequest(fn);
      }
      throw error;
    }
  } else {
    // Offline - queue for when network comes back
    return networkRecovery.queueRequest(fn);
  }
}

