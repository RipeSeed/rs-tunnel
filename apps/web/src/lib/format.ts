export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = units[0] ?? 'KB';

  for (const currentUnit of units) {
    size /= 1024;
    unit = currentUnit;

    if (size < 1024) {
      break;
    }
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
}
