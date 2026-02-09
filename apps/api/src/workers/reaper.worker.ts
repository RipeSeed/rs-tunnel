import { logger } from '../lib/logger.js';
import { CleanupService } from '../services/cleanup.service.js';

export class ReaperWorker {
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly cleanupService: CleanupService,
    private readonly intervalSec: number,
  ) {}

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      this.tick().catch((error) => {
        logger.error('Reaper tick failed', error);
      });
    }, this.intervalSec * 1000);

    void this.tick();
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  private async tick(): Promise<void> {
    await this.cleanupService.sweepStaleLeases();
    await this.cleanupService.processQueuedJobs();
  }
}
