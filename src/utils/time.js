/**
 * Parse a time string to seconds (float) for comparison.
 *   "83.45"    → 83.45
 *   "1:23.45"  → 83.45
 *   "1:23:45"  → 5025
 * Returns Infinity for unparseable input.
 */
export function parseTime(str) {
  if (!str) return Infinity;
  const parts = str.trim().split(':');
  const nums = parts.map(Number);
  if (nums.some(isNaN)) return Infinity;
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}
