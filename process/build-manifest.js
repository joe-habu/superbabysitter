/**
 * @module superbabysitter/build-manifest
 * @description Shared build manifest functions for tracking task context propagation across TDD implementation loops.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createEmptyManifest() {
  return {
    tasks: [],
    allFilesChanged: [],
    openConcerns: []
  };
}

export function addTaskToManifest(manifest, taskEntry) {
  manifest.tasks.push(taskEntry);

  const newFiles = (taskEntry.filesChanged || [])
    .filter(f => !manifest.allFilesChanged.includes(f));
  manifest.allFilesChanged.push(...newFiles);

  const newConcerns = (taskEntry.concerns || [])
    .filter(c => !manifest.openConcerns.includes(c));
  manifest.openConcerns.push(...newConcerns);
}

export function writeManifestMarkdown(manifest, filePath) {
  const lines = ['# Build Manifest', ''];

  lines.push('## Completed Tasks', '');
  for (const t of manifest.tasks) {
    lines.push(`### Task ${t.taskNumber}: ${t.name}`);
    lines.push(`- **Files:** ${(t.filesChanged || []).join(', ') || '(none)'}`);
    lines.push(`- **Decisions:** ${(t.architecturalDecisions || []).join('; ') || '(none)'}`);
    lines.push(`- **Dependencies:** ${(t.dependsOn || []).join(', ') || '(none)'}`);
    lines.push(`- **Summary:** ${t.summary || '(none)'}`);
    lines.push('');
  }

  lines.push('## All Files Changed', '');
  for (const f of manifest.allFilesChanged) {
    lines.push(`- ${f}`);
  }
  lines.push('');

  lines.push('## Open Concerns', '');
  if (manifest.openConcerns.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of manifest.openConcerns) {
      lines.push(`- ${c}`);
    }
  }
  lines.push('');

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, lines.join('\n'));
}

export function condensedManifestForPrompt(manifest) {
  if (manifest.tasks.length === 0) return null;
  return {
    completedTasks: manifest.tasks.map(t => ({
      name: t.name,
      filesChanged: t.filesChanged,
      architecturalDecisions: t.architecturalDecisions
    })),
    allFilesChanged: manifest.allFilesChanged,
    openConcerns: manifest.openConcerns
  };
}
