import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { createEmptyManifest, addTaskToManifest, condensedManifestForPrompt, writeManifestMarkdown } from './build-manifest.js';

describe('createEmptyManifest', () => {
  it('returns correct structure', () => {
    const manifest = createEmptyManifest();
    assert.deepStrictEqual(manifest, {
      tasks: [],
      allFilesChanged: [],
      openConcerns: []
    });
  });
});

describe('addTaskToManifest', () => {
  let manifest;

  beforeEach(() => {
    manifest = createEmptyManifest();
  });

  it('adds a task entry', () => {
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Add user model',
      filesChanged: ['models/user.go'],
      concerns: ['Need to add indexes later'],
      architecturalDecisions: ['Used GORM tags'],
      summary: 'Created user model'
    });

    assert.strictEqual(manifest.tasks.length, 1);
    assert.strictEqual(manifest.tasks[0].name, 'Add user model');
    assert.deepStrictEqual(manifest.allFilesChanged, ['models/user.go']);
    assert.deepStrictEqual(manifest.openConcerns, ['Need to add indexes later']);
  });

  it('deduplicates files across tasks', () => {
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Task 1',
      filesChanged: ['a.go', 'b.go']
    });
    addTaskToManifest(manifest, {
      taskNumber: 2,
      name: 'Task 2',
      filesChanged: ['b.go', 'c.go']
    });

    assert.deepStrictEqual(manifest.allFilesChanged, ['a.go', 'b.go', 'c.go']);
  });

  it('deduplicates concerns across tasks', () => {
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Task 1',
      concerns: ['Concern A', 'Concern B']
    });
    addTaskToManifest(manifest, {
      taskNumber: 2,
      name: 'Task 2',
      concerns: ['Concern B', 'Concern C']
    });

    assert.deepStrictEqual(manifest.openConcerns, ['Concern A', 'Concern B', 'Concern C']);
  });

  it('handles missing filesChanged and concerns gracefully', () => {
    addTaskToManifest(manifest, { taskNumber: 1, name: 'Minimal' });

    assert.strictEqual(manifest.tasks.length, 1);
    assert.deepStrictEqual(manifest.allFilesChanged, []);
    assert.deepStrictEqual(manifest.openConcerns, []);
  });
});

describe('condensedManifestForPrompt', () => {
  it('returns null for empty manifest', () => {
    const manifest = createEmptyManifest();
    assert.strictEqual(condensedManifestForPrompt(manifest), null);
  });

  it('returns condensed structure for populated manifest', () => {
    const manifest = createEmptyManifest();
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Add model',
      filesChanged: ['models/user.go'],
      architecturalDecisions: ['Used GORM'],
      concerns: ['Add indexes'],
      summary: 'Created model',
      dependsOn: []
    });

    const condensed = condensedManifestForPrompt(manifest);
    assert.deepStrictEqual(condensed, {
      completedTasks: [
        {
          name: 'Add model',
          filesChanged: ['models/user.go'],
          architecturalDecisions: ['Used GORM']
        }
      ],
      allFilesChanged: ['models/user.go'],
      openConcerns: ['Add indexes']
    });
  });

  it('excludes summary and dependsOn from condensed output', () => {
    const manifest = createEmptyManifest();
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Task',
      filesChanged: [],
      architecturalDecisions: [],
      summary: 'Should not appear',
      dependsOn: ['also-should-not-appear']
    });

    const condensed = condensedManifestForPrompt(manifest);
    const taskKeys = Object.keys(condensed.completedTasks[0]);
    assert.ok(!taskKeys.includes('summary'));
    assert.ok(!taskKeys.includes('dependsOn'));
  });
});

describe('writeManifestMarkdown', () => {
  it('writes valid markdown', () => {
    const manifest = createEmptyManifest();
    addTaskToManifest(manifest, {
      taskNumber: 1,
      name: 'Add user model',
      filesChanged: ['models/user.go'],
      architecturalDecisions: ['Used GORM tags'],
      dependsOn: [],
      summary: 'Created user model',
      concerns: ['Need indexes']
    });

    const tmpPath = '/tmp/superbabysitter-test-manifest.md';
    writeManifestMarkdown(manifest, tmpPath);

    const content = readFileSync(tmpPath, 'utf8');

    assert.ok(content.startsWith('# Build Manifest'));
    assert.ok(content.includes('## Completed Tasks'));
    assert.ok(content.includes('### Task 1: Add user model'));
    assert.ok(content.includes('models/user.go'));
    assert.ok(content.includes('Used GORM tags'));
    assert.ok(content.includes('## All Files Changed'));
    assert.ok(content.includes('## Open Concerns'));
    assert.ok(content.includes('Need indexes'));

    unlinkSync(tmpPath);
  });
});
