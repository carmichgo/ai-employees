/**
 * Lightweight Jaro-Winkler string similarity — no external dependencies.
 *
 * Used for server-side task deduplication: detects near-duplicate task titles
 * like "Research competitors" vs "Research top competitors".
 */

/** Jaro similarity score between two strings (0.0 – 1.0). */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(i + matchWindow + 1, s2.length);
    for (let j = lo; j < hi; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
}

/** Jaro-Winkler similarity score (0.0 – 1.0). Boosts scores for strings sharing a common prefix. */
export function jaroWinkler(s1: string, s2: string): number {
  const jaroScore = jaro(s1, s2);

  // Common prefix length (up to 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaroScore + prefix * 0.1 * (1 - jaroScore);
}

/**
 * Check if a new task title is a near-duplicate of any existing task title.
 * Returns the matching task or undefined.
 */
export function findDuplicateTask<T extends { title: string }>(
  newTitle: string,
  existingTasks: T[],
  threshold = 0.85,
): T | undefined {
  const normalized = newTitle.trim().toLowerCase();
  for (const task of existingTasks) {
    const existing = task.title.trim().toLowerCase();
    if (existing === normalized || jaroWinkler(existing, normalized) > threshold) {
      return task;
    }
  }
  return undefined;
}
