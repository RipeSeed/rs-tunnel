export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function calculateCleanupBackoffSeconds(attempt: number): number {
  const base = 5;
  const max = 300;
  return Math.min(base * 2 ** Math.max(attempt - 1, 0), max);
}
