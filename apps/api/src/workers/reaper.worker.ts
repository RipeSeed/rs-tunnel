import { logger } from '../lib/logger.js';
import { CleanupService } from '../services/cleanup.service.js';

export class ReaperWorker {
  private timeoutHandle?: NodeJS.Timeout;
  private isRunning = false;
  private stopped = true;

  constructor(
    private readonly cleanupService: CleanupService,
    private readonly intervalSec: number,
  ) {}

  start(): void {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    this.scheduleNextTick(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.stopped) {
      return;
    }

    this.timeoutHandle = setTimeout(() => {
      void this.runTick();
    }, delayMs);
  }

  private async runTick(): Promise<void> {
    if (this.stopped || this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      await this.tick();
    } catch (error) {
      logger.error('Reaper tick failed', error);
    } finally {
      this.isRunning = false;
      this.scheduleNextTick(this.intervalSec * 1000);
    }
  }

  private async tick(): Promise<void> {
    await this.cleanupService.sweepStaleLeases();
    await this.cleanupService.processQueuedJobs();
  }
}
