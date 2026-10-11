/**
 * Timestamp in the format SQLite's datetime('now') stores (UTC, "YYYY-MM-DD HH:MM:SS").
 * Columns filled by that default must be compared against this format: an ISO string
 * ("…T…Z") sorts after it on the same day, which shifts every day boundary by one day.
 */
export function sqlTime(value: Date | string): string {
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.slice(0, 19).replace('T', ' ');
}
