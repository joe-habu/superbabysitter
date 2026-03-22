/**
 * @module build-manifest-helpers
 * @description Renders buildManifest data into perspective-specific instruction arrays
 * for downstream phases (verification, debugging, finishing).
 */

const PERSPECTIVE_HEADERS = {
  verification: 'Focus verification commands on these specific files and verify each task\'s claimed changes actually exist and work correctly.',
  debugging: 'Start root cause investigation here. The bug is most likely in recently changed files.',
  finishing: 'Ensure the test suite covers all changed files and focus test output analysis on these paths.',
};

const DEFAULT_HEADER = 'The following tasks were completed during this run:';

/**
 * Renders buildManifest into an instruction string array for spreading into agent instructions.
 * @param {Array|null} buildManifest - Array of {taskNumber, taskName, filesChanged, decisions, summary}
 * @param {object} [opts={}]
 * @param {string} [opts.perspective] - 'verification' | 'debugging' | 'finishing'
 * @returns {string[]}
 */
export function buildManifestInstructions(buildManifest, opts = {}) {
  if (!buildManifest || !Array.isArray(buildManifest) || buildManifest.length === 0) {
    return [];
  }

  const header = PERSPECTIVE_HEADERS[opts.perspective] || DEFAULT_HEADER;
  const lines = [
    '=== BUILD MANIFEST ===',
    header,
    '',
  ];

  for (const entry of buildManifest) {
    lines.push(`Task ${entry.taskNumber}: ${entry.taskName}`);
    if (entry.summary) {
      lines.push(`  Summary: ${entry.summary}`);
    }
    if (entry.filesChanged && entry.filesChanged.length > 0) {
      lines.push(`  Files changed: ${entry.filesChanged.join(', ')}`);
    }
    if (entry.decisions && entry.decisions.length > 0) {
      lines.push(`  Decisions: ${entry.decisions.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('=== END BUILD MANIFEST ===');
  return lines;
}

/**
 * Extracts a deduplicated flat list of all file paths from the buildManifest.
 * @param {Array|null} buildManifest
 * @returns {string[]}
 */
export function buildManifestFilesChanged(buildManifest) {
  if (!buildManifest || !Array.isArray(buildManifest) || buildManifest.length === 0) {
    return [];
  }

  const seen = new Set();
  const files = [];
  for (const entry of buildManifest) {
    if (entry.filesChanged && Array.isArray(entry.filesChanged)) {
      for (const f of entry.filesChanged) {
        if (!seen.has(f)) {
          seen.add(f);
          files.push(f);
        }
      }
    }
  }
  return files;
}
