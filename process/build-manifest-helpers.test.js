import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifestInstructions, buildManifestFilesChanged } from './build-manifest-helpers.js';

// === Sample fixtures ===

const sampleManifest = [
  {
    taskNumber: 1,
    taskName: 'Add auth module',
    filesChanged: ['src/auth.js', 'src/auth.test.js'],
    decisions: ['Use JWT over sessions', 'Store in httpOnly cookie'],
    summary: 'Added JWT-based authentication'
  },
  {
    taskNumber: 2,
    taskName: 'Add user routes',
    filesChanged: ['src/routes/user.js', 'src/routes/user.test.js', 'src/auth.js'],
    decisions: [],
    summary: 'REST endpoints for user CRUD'
  }
];

const minimalManifest = [
  { taskNumber: 1, taskName: 'Fix bug' }
];

// === buildManifestInstructions ===

describe('buildManifestInstructions', () => {
  describe('null/empty handling', () => {
    it('returns empty array for null', () => {
      assert.deepEqual(buildManifestInstructions(null), []);
    });

    it('returns empty array for undefined', () => {
      assert.deepEqual(buildManifestInstructions(undefined), []);
    });

    it('returns empty array for empty array', () => {
      assert.deepEqual(buildManifestInstructions([]), []);
    });

    it('returns empty array for non-array', () => {
      assert.deepEqual(buildManifestInstructions('not an array'), []);
    });

    it('returns empty array for null with opts', () => {
      assert.deepEqual(buildManifestInstructions(null, { perspective: 'verification' }), []);
    });
  });

  describe('delimiters', () => {
    it('starts with BUILD MANIFEST delimiter', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.equal(result[0], '=== BUILD MANIFEST ===');
    });

    it('ends with END BUILD MANIFEST delimiter', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.equal(result[result.length - 1], '=== END BUILD MANIFEST ===');
    });
  });

  describe('default perspective', () => {
    it('uses default header when no perspective specified', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.includes('The following tasks were completed during this run:'));
    });

    it('uses default header for unknown perspective', () => {
      const result = buildManifestInstructions(sampleManifest, { perspective: 'unknown' });
      assert.ok(result.includes('The following tasks were completed during this run:'));
    });
  });

  describe('verification perspective', () => {
    it('uses verification-specific header', () => {
      const result = buildManifestInstructions(sampleManifest, { perspective: 'verification' });
      assert.ok(result.some(l => l.includes('Focus verification commands')));
    });
  });

  describe('debugging perspective', () => {
    it('uses debugging-specific header', () => {
      const result = buildManifestInstructions(sampleManifest, { perspective: 'debugging' });
      assert.ok(result.some(l => l.includes('Start root cause investigation')));
    });
  });

  describe('finishing perspective', () => {
    it('uses finishing-specific header', () => {
      const result = buildManifestInstructions(sampleManifest, { perspective: 'finishing' });
      assert.ok(result.some(l => l.includes('Ensure the test suite covers')));
    });
  });

  describe('entry rendering', () => {
    it('renders task number and name', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.some(l => l.includes('Task 1: Add auth module')));
      assert.ok(result.some(l => l.includes('Task 2: Add user routes')));
    });

    it('renders summary when present', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.some(l => l.includes('Summary: Added JWT-based authentication')));
    });

    it('renders files changed when present', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.some(l => l.includes('Files changed: src/auth.js, src/auth.test.js')));
    });

    it('renders decisions when present', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.some(l => l.includes('Decisions: Use JWT over sessions; Store in httpOnly cookie')));
    });

    it('omits summary line when empty', () => {
      const result = buildManifestInstructions(minimalManifest);
      assert.ok(!result.some(l => l.includes('Summary:')));
    });

    it('omits files changed line when empty or missing', () => {
      const result = buildManifestInstructions(minimalManifest);
      assert.ok(!result.some(l => l.includes('Files changed:')));
    });

    it('omits decisions line when empty', () => {
      const manifest = [{ taskNumber: 1, taskName: 'Fix', decisions: [], summary: 'done' }];
      const result = buildManifestInstructions(manifest);
      assert.ok(!result.some(l => l.includes('Decisions:')));
    });

    it('handles entry with all optional fields missing', () => {
      const manifest = [{ taskNumber: 3, taskName: 'Cleanup' }];
      const result = buildManifestInstructions(manifest);
      assert.ok(result.some(l => l.includes('Task 3: Cleanup')));
      assert.ok(!result.some(l => l.includes('Summary:')));
      assert.ok(!result.some(l => l.includes('Files changed:')));
      assert.ok(!result.some(l => l.includes('Decisions:')));
    });
  });

  describe('opts defaults', () => {
    it('works with no opts argument', () => {
      const result = buildManifestInstructions(sampleManifest);
      assert.ok(result.length > 0);
    });

    it('works with empty opts object', () => {
      const result = buildManifestInstructions(sampleManifest, {});
      assert.ok(result.length > 0);
    });
  });
});

// === buildManifestFilesChanged ===

describe('buildManifestFilesChanged', () => {
  describe('null/empty handling', () => {
    it('returns empty array for null', () => {
      assert.deepEqual(buildManifestFilesChanged(null), []);
    });

    it('returns empty array for undefined', () => {
      assert.deepEqual(buildManifestFilesChanged(undefined), []);
    });

    it('returns empty array for empty array', () => {
      assert.deepEqual(buildManifestFilesChanged([]), []);
    });

    it('returns empty array for non-array', () => {
      assert.deepEqual(buildManifestFilesChanged('not an array'), []);
    });
  });

  describe('file extraction', () => {
    it('extracts files from single entry', () => {
      const manifest = [{ filesChanged: ['a.js', 'b.js'] }];
      assert.deepEqual(buildManifestFilesChanged(manifest), ['a.js', 'b.js']);
    });

    it('extracts files from multiple entries', () => {
      const result = buildManifestFilesChanged(sampleManifest);
      assert.ok(result.includes('src/auth.js'));
      assert.ok(result.includes('src/auth.test.js'));
      assert.ok(result.includes('src/routes/user.js'));
      assert.ok(result.includes('src/routes/user.test.js'));
    });
  });

  describe('deduplication', () => {
    it('deduplicates files appearing in multiple entries', () => {
      const result = buildManifestFilesChanged(sampleManifest);
      const authCount = result.filter(f => f === 'src/auth.js').length;
      assert.equal(authCount, 1, 'src/auth.js should appear exactly once');
    });

    it('preserves first-seen order', () => {
      const result = buildManifestFilesChanged(sampleManifest);
      const authIdx = result.indexOf('src/auth.js');
      const routeIdx = result.indexOf('src/routes/user.js');
      assert.ok(authIdx < routeIdx, 'src/auth.js should come before src/routes/user.js');
    });
  });

  describe('edge cases', () => {
    it('handles entries with missing filesChanged', () => {
      const manifest = [{ taskNumber: 1, taskName: 'Fix' }, { filesChanged: ['a.js'] }];
      assert.deepEqual(buildManifestFilesChanged(manifest), ['a.js']);
    });

    it('handles entries with non-array filesChanged', () => {
      const manifest = [{ filesChanged: 'not an array' }, { filesChanged: ['a.js'] }];
      assert.deepEqual(buildManifestFilesChanged(manifest), ['a.js']);
    });

    it('handles entries with empty filesChanged', () => {
      const manifest = [{ filesChanged: [] }, { filesChanged: ['a.js'] }];
      assert.deepEqual(buildManifestFilesChanged(manifest), ['a.js']);
    });
  });
});
