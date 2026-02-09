import { AppError } from '../lib/app-error.js';

export function assertWithinTunnelLimit(activeCount: number, maxActive: number): void {
  if (activeCount >= maxActive) {
    throw new AppError(
      409,
      'TUNNEL_LIMIT_REACHED',
      `Maximum of ${maxActive} active tunnels reached.`,
      { activeCount, maxActive },
    );
  }
}
