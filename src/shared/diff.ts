/** Einfacher zeilenbasierter Diff (LCS) für die Chat-Anzeige von YAML-Änderungen. */

export interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'gap';
  text: string;
}
export interface LineDiff {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/** LCS-Länge-Matrix → Rückverfolgung zu einem add/del/ctx-Diff, mit gekürztem Kontext. */
export function diffLines(oldText: string, newText: string, context = 2): LineDiff {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;

  // LCS-DP (Zeilen).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const raw: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: 'ctx', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'del', text: a[i] });
      i++;
    } else {
      raw.push({ type: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) raw.push({ type: 'del', text: a[i++] });
  while (j < m) raw.push({ type: 'add', text: b[j++] });

  const added = raw.filter((l) => l.type === 'add').length;
  const removed = raw.filter((l) => l.type === 'del').length;

  // Lange unveränderte Blöcke auf `context` Zeilen um jede Änderung kürzen.
  const keep = new Array(raw.length).fill(false);
  for (let k = 0; k < raw.length; k++) {
    if (raw[k].type !== 'ctx') {
      for (let d = -context; d <= context; d++) {
        if (raw[k + d]) keep[k + d] = true;
      }
    }
  }
  const lines: DiffLine[] = [];
  let gap = false;
  for (let k = 0; k < raw.length; k++) {
    if (keep[k]) {
      lines.push(raw[k]);
      gap = false;
    } else if (!gap) {
      lines.push({ type: 'gap', text: '⋯' });
      gap = true;
    }
  }
  return { lines, added, removed };
}
