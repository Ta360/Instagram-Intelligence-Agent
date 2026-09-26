import { AppError } from "../../lib/errors.js";

/**
 * Outbound Instagram API call budget (sliding one-hour window) plus a cooldown
 * that engages when Instagram itself reports throttling. This keeps the app well
 * inside Meta's rate limits instead of discovering them the hard way.
 */
export class CallBudget {
  private calls: number[] = [];
  private cooldownUntil = 0;
  /** Latest usage headers reported by Meta (x-app-usage / x-business-use-case-usage). */
  metaUsage: Record<string, unknown> | null = null;

  constructor(
    private limitPerHour: number,
    private windowMs = 60 * 60 * 1000,
  ) {}

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    while (this.calls.length && this.calls[0]! <= cutoff) this.calls.shift();
  }

  /** Reserve one call or throw RATE_LIMITED. */
  consume(now = Date.now()) {
    this.prune(now);
    if (now < this.cooldownUntil) {
      throw new AppError("RATE_LIMITED", undefined, {
        retryAfterSeconds: Math.ceil((this.cooldownUntil - now) / 1000),
      });
    }
    if (this.calls.length >= this.limitPerHour) {
      const retry = Math.ceil((this.calls[0]! + this.windowMs - now) / 1000);
      throw new AppError("RATE_LIMITED", undefined, { retryAfterSeconds: retry });
    }
    this.calls.push(now);
  }

  /** Called when Instagram reports throttling. */
  engageCooldown(seconds: number, now = Date.now()) {
    this.cooldownUntil = Math.max(this.cooldownUntil, now + seconds * 1000);
  }

  snapshot(now = Date.now()) {
    this.prune(now);
    return {
      used: this.calls.length,
      limit: this.limitPerHour,
      windowMinutes: Math.round(this.windowMs / 60000),
      cooldownUntil: this.cooldownUntil > now ? new Date(this.cooldownUntil).toISOString() : null,
      metaUsage: this.metaUsage,
    };
  }

  reset() {
    this.calls = [];
    this.cooldownUntil = 0;
  }
}
