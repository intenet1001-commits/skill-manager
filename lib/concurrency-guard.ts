/**
 * Simple concurrency limiter. Tracks active slots and wraps async work
 * with try/finally so the slot is always released even on error.
 */
export class ConcurrencyGuard {
  private active = 0
  constructor(private readonly max: number) {}

  get isFull(): boolean {
    return this.active >= this.max
  }

  /** Increment counter. Call `release()` in a finally block. */
  acquire(): void {
    this.active++
  }

  release(): void {
    if (this.active > 0) this.active--
  }

  /** Run `fn` with acquire/release guard. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}
