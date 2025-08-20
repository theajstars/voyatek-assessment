type TimestampMs = number;

export class SlidingWindowRateLimiter {
  private readonly maxEvents: number;
  private readonly windowMs: number;
  private readonly userToEvents: Map<string | number, TimestampMs[]> =
    new Map();

  constructor(maxEvents: number, windowMs: number) {
    this.maxEvents = maxEvents;
    this.windowMs = windowMs;
  }

  allow(userKey: string | number): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const events = this.userToEvents.get(userKey) || [];
    const pruned = events.filter((t) => t > windowStart);
    pruned.push(now);
    this.userToEvents.set(userKey, pruned);
    return pruned.length <= this.maxEvents;
  }
}
