/**
 * Sliding-window rate limiter.
 * Tracks timestamps of recent calls and blocks when the window is full.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
      this.timestamps.shift();
    }
  }

  tryAcquire(): boolean {
    const now = Date.now();
    this.prune(now);
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.prune(now);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = oldest + this.windowMs - now + 1;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.prune(Date.now());
    }

    this.timestamps.push(Date.now());
  }
}
