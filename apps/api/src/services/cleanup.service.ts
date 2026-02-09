import { logger } from '../lib/logger.js';
import { Repository } from '../db/repository.js';
import { addSeconds, calculateCleanupBackoffSeconds } from '../utils/time.js';
import { TunnelService } from './tunnel.service.js';

export class CleanupService {
  constructor(
    private readonly repository: Repository,
    private readonly tunnelService: TunnelService,
  ) {}

  async sweepStaleLeases(): Promise<void> {
    const staleTunnelIds = await this.repository.findStaleTunnelIds(new Date());
    await Promise.all(
      staleTunnelIds.map((tunnelId) => this.repository.enqueueCleanupJob(tunnelId, 'stale_lease')),
    );
  }

  async processQueuedJobs(): Promise<void> {
    const now = new Date();
    const jobs = await this.repository.claimDueJobs(now, 25);

    for (const job of jobs) {
      try {
        await this.tunnelService.stopTunnelById(job.tunnelId, `cleanup:${job.reason}`);
        await this.repository.markCleanupJobDone(job.id);
      } catch (error) {
        const attemptCount = job.attemptCount + 1;
        const backoffSeconds = calculateCleanupBackoffSeconds(attemptCount);
        const nextAttemptAt = addSeconds(now, backoffSeconds);
        const message = error instanceof Error ? error.message : 'Unknown cleanup failure';

        await this.repository.markCleanupJobFailed({
          jobId: job.id,
          attemptCount,
          nextAttemptAt,
          message,
        });

        logger.error('Cleanup job failed', {
          jobId: job.id,
          tunnelId: job.tunnelId,
          attemptCount,
          message,
        });
      }
    }
  }
}
