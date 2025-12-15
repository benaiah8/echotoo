/**
 * [OPTIMIZATION FILE: Phase 3]
 * 
 * This file contains the enhanced request manager with priority queue and deduplication.
 * 
 * Optimizations included:
 * - Dedupe: Automatic request deduplication for same key
 * - Priority: Priority queue for request execution
 * - Batch: Prevents duplicate follow status and privacy checks
 * 
 * Related optimizations:
 * - See: src/lib/cacheInvalidation.ts for unified cache invalidation
 */

type Priority = "high" | "medium" | "low";

interface RequestResult<T> {
  data: T | null;
  error: any;
}

interface QueuedRequest<T> {
  key: string;
  fn: (signal: AbortSignal) => Promise<T>; // [OPTIMIZATION: Phase 3 - Fix] Changed from AbortController to AbortSignal to match executeRequest signature
  priority: Priority;
  resolve: (result: RequestResult<T>) => void;
  reject: (error: any) => void;
  abortController: AbortController;
}

class RequestManager {
  // [OPTIMIZATION: Phase 3 - Dedupe] Active requests map (key -> AbortController)
  // Why: Tracks in-flight requests to prevent duplicates
  private requests: Map<string, AbortController> = new Map();
  
  // [OPTIMIZATION: Phase 3 - Priority] Priority queues for different priority levels
  // Why: Allows high-priority requests to execute before low-priority ones
  private highPriorityQueue: QueuedRequest<any>[] = [];
  private mediumPriorityQueue: QueuedRequest<any>[] = [];
  private lowPriorityQueue: QueuedRequest<any>[] = [];
  
  // [OPTIMIZATION: Phase 3 - Priority] Track currently executing requests
  // Why: Limits concurrent requests and processes queues in priority order
  private executingCount = 0;
  private readonly maxConcurrent = 5; // Max concurrent requests

  // [OPTIMIZATION: Phase 3 - Dedupe] Map of pending requests (key -> Promise)
  // Why: Allows multiple callers to share the same request result
  private pendingRequests: Map<string, Promise<RequestResult<any>>> = new Map();

  async execute<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    priority: Priority = "medium"
  ): Promise<RequestResult<T>> {
    // [OPTIMIZATION: Phase 3 - Dedupe] Check if request with same key is already in flight
    // Why: Prevents duplicate requests for same resource (e.g., same follow status check, privacy check)
    const existingPromise = this.pendingRequests.get(key);
    if (existingPromise) {
      // Request already in flight - return the same promise
      // This prevents duplicate follow status checks, privacy checks, etc.
      return existingPromise as Promise<RequestResult<T>>;
    }

    // [OPTIMIZATION: Phase 3 - Priority] Queue request based on priority
    // Why: High-priority requests execute first, low-priority wait
    if (this.executingCount >= this.maxConcurrent) {
      return new Promise<RequestResult<T>>((resolve, reject) => {
        const abortController = new AbortController();
        const queuedRequest: QueuedRequest<T> = {
          key,
          fn: async (signal) => fn(signal),
          priority,
          resolve,
          reject,
          abortController,
        };

        // Add to appropriate queue based on priority
        if (priority === "high") {
          this.highPriorityQueue.push(queuedRequest);
        } else if (priority === "medium") {
          this.mediumPriorityQueue.push(queuedRequest);
        } else {
          this.lowPriorityQueue.push(queuedRequest);
        }

        // Process queues
        this.processQueues();
      });
    }

    // Execute immediately if under limit
    const promise = this.executeRequest(key, fn, priority);
    this.pendingRequests.set(key, promise);
    
    // Clean up when request completes
    promise.finally(() => {
      this.pendingRequests.delete(key);
    });
    
    return promise;
  }

  // [OPTIMIZATION: Phase 3 - Priority] Execute a request immediately
  // Why: Handles actual request execution and queue processing
  private async executeRequest<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    priority: Priority
  ): Promise<RequestResult<T>> {
    const abortController = new AbortController();
    this.requests.set(key, abortController);
    this.executingCount++;

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
      this.executingCount--;
      // Process next queued requests
      this.processQueues();
    }
  }

  // [OPTIMIZATION: Phase 3 - Priority] Process queued requests in priority order
  // Why: Ensures high-priority requests execute before low-priority ones
  private processQueues(): void {
    while (this.executingCount < this.maxConcurrent) {
      let nextRequest: QueuedRequest<any> | undefined;

      // Get next request from highest priority queue
      if (this.highPriorityQueue.length > 0) {
        nextRequest = this.highPriorityQueue.shift();
      } else if (this.mediumPriorityQueue.length > 0) {
        nextRequest = this.mediumPriorityQueue.shift();
      } else if (this.lowPriorityQueue.length > 0) {
        nextRequest = this.lowPriorityQueue.shift();
      }

      if (!nextRequest) break;

      // Execute the request
      this.executeRequest(
        nextRequest.key,
        nextRequest.fn,
        nextRequest.priority
      )
        .then(nextRequest.resolve)
        .catch(nextRequest.reject);
    }
  }

  cancel(key: string): void {
    const controller = this.requests.get(key);
    if (controller) {
      controller.abort();
      this.requests.delete(key);
    }

    // Remove from pending requests
    this.pendingRequests.delete(key);

    // Also remove from queues
    this.highPriorityQueue = this.highPriorityQueue.filter((r) => r.key !== key);
    this.mediumPriorityQueue = this.mediumPriorityQueue.filter(
      (r) => r.key !== key
    );
    this.lowPriorityQueue = this.lowPriorityQueue.filter((r) => r.key !== key);
  }

  cancelAll(): void {
    this.requests.forEach((controller) => controller.abort());
    this.requests.clear();
    this.pendingRequests.clear();
    this.highPriorityQueue = [];
    this.mediumPriorityQueue = [];
    this.lowPriorityQueue = [];
  }

  // Public method to get all request keys
  getRequestKeys(): string[] {
    return Array.from(this.requests.keys());
  }
}

export const requestManager = new RequestManager();

export function cancelContextRequests(context: string): void {
  requestManager.getRequestKeys().forEach((key) => {
    if (key.startsWith(context)) {
      requestManager.cancel(key);
    }
  });
}

