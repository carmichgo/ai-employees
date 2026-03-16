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

/** Tokenize a string into meaningful words, stripping common stop words. */
function tokenize(s: string): Set<string> {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "this", "that", "my", "our",
  ]);
  const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  return new Set(words.filter((w) => !stopWords.has(w) && w.length > 1));
}

/** Jaccard similarity between two token sets (0.0 – 1.0). */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

/**
 * Check if a new task title is a near-duplicate of any existing task title.
 * Returns the matching task or undefined.
 *
 * Uses both character-level (Jaro-Winkler) and token-level (Jaccard) similarity
 * to avoid false positives on structurally similar but semantically different tasks
 * like "Publish blog about AI" vs "Publish blog about marketing".
 */
export function findDuplicateTask<T extends { title: string }>(
  newTitle: string,
  existingTasks: T[],
  threshold = 0.85,
): T | undefined {
  const normalized = newTitle.trim().toLowerCase();
  const newTokens = tokenize(normalized);

  for (const task of existingTasks) {
    const existing = task.title.trim().toLowerCase();

    // Exact match — always deduplicate
    if (existing === normalized) return task;

    const charSimilarity = jaroWinkler(existing, normalized);
    const wordOverlap = tokenOverlap(newTokens, tokenize(existing));

    // Require both high character similarity AND high word overlap
    if (charSimilarity > threshold && wordOverlap >= 0.6) {
      return task;
    }
  }
  return undefined;
}
