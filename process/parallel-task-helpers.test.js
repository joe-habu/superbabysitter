import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasParallelCapableTasks, validateDependencies, buildParallelBatches } from './parallel-task-helpers.js';

// === hasParallelCapableTasks ===

describe('hasParallelCapableTasks', () => {
  it('returns false for null', () => {
    assert.equal(hasParallelCapableTasks(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(hasParallelCapableTasks(undefined), false);
  });

  it('returns false for empty array', () => {
    assert.equal(hasParallelCapableTasks([]), false);
  });

  it('returns false when no tasks have dependsOn', () => {
    const tasks = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    assert.equal(hasParallelCapableTasks(tasks), false);
  });

  it('returns true when some tasks have dependsOn', () => {
    const tasks = [{ name: 'A' }, { name: 'B', dependsOn: [1] }];
    assert.equal(hasParallelCapableTasks(tasks), true);
  });

  it('returns true when all tasks have dependsOn', () => {
    const tasks = [{ name: 'A', dependsOn: [] }, { name: 'B', dependsOn: [1] }];
    assert.equal(hasParallelCapableTasks(tasks), true);
  });

  it('returns false when dependsOn is not an array (e.g. string)', () => {
    const tasks = [{ name: 'A', dependsOn: 'task1' }];
    assert.equal(hasParallelCapableTasks(tasks), false);
  });
});

// === validateDependencies ===

describe('validateDependencies', () => {
  it('returns valid for null input', () => {
    const result = validateDependencies(null);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('returns valid for empty array', () => {
    const result = validateDependencies([]);
    assert.equal(result.valid, true);
  });

  it('returns valid for tasks without dependsOn', () => {
    const result = validateDependencies([{ name: 'A' }, { name: 'B' }]);
    assert.equal(result.valid, true);
  });

  it('returns valid for all-independent tasks', () => {
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [] },
      { name: 'C', dependsOn: [] }
    ];
    assert.equal(validateDependencies(tasks).valid, true);
  });

  it('returns valid for linear chain', () => {
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [2] }
    ];
    assert.equal(validateDependencies(tasks).valid, true);
  });

  it('returns valid for diamond dependency graph', () => {
    // A -> B, A -> C, B -> D, C -> D
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [1] },
      { name: 'D', dependsOn: [2, 3] }
    ];
    assert.equal(validateDependencies(tasks).valid, true);
  });

  it('detects self-reference', () => {
    const tasks = [{ name: 'A', dependsOn: [1] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('self-reference')));
  });

  it('detects out-of-range reference (too high)', () => {
    const tasks = [{ name: 'A', dependsOn: [5] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('out-of-range')));
  });

  it('detects out-of-range reference (zero)', () => {
    const tasks = [{ name: 'A', dependsOn: [0] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('out-of-range')));
  });

  it('detects out-of-range reference (negative)', () => {
    const tasks = [{ name: 'A', dependsOn: [-1] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('out-of-range')));
  });

  it('detects non-integer dependency', () => {
    const tasks = [{ name: 'A', dependsOn: [1.5] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('non-integer')));
  });

  it('detects non-number dependency', () => {
    const tasks = [{ name: 'A', dependsOn: ['B'] }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('non-integer')));
  });

  it('detects non-array dependsOn', () => {
    const tasks = [{ name: 'A', dependsOn: 42 }];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('must be an array')));
  });

  it('detects 2-node circular dependency', () => {
    const tasks = [
      { name: 'A', dependsOn: [2] },
      { name: 'B', dependsOn: [1] }
    ];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Circular dependency')));
  });

  it('detects 3-node circular dependency', () => {
    const tasks = [
      { name: 'A', dependsOn: [3] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [2] }
    ];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Circular dependency')));
  });

  it('reports multiple errors', () => {
    const tasks = [
      { name: 'A', dependsOn: [1, 5] },
      { name: 'B', dependsOn: ['x'] }
    ];
    const result = validateDependencies(tasks);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3); // self-ref, out-of-range, non-integer
  });
});

// === buildParallelBatches ===

describe('buildParallelBatches', () => {
  it('returns empty for null input', () => {
    assert.deepEqual(buildParallelBatches(null), []);
  });

  it('returns empty for empty array', () => {
    assert.deepEqual(buildParallelBatches([]), []);
  });

  it('puts all independent tasks in one batch', () => {
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [] },
      { name: 'C', dependsOn: [] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 3);
    assert.deepEqual(batches[0].map(t => t.taskNumber), [1, 2, 3]);
  });

  it('creates N batches of 1 for linear chain', () => {
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [2] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 3);
    assert.equal(batches[0].length, 1);
    assert.equal(batches[0][0].taskNumber, 1);
    assert.equal(batches[1][0].taskNumber, 2);
    assert.equal(batches[2][0].taskNumber, 3);
  });

  it('handles diamond dependency (2 batches)', () => {
    // A -> B, A -> C, B -> D, C -> D
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [1] },
      { name: 'D', dependsOn: [2, 3] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0].map(t => t.taskNumber), [1]);
    assert.deepEqual(batches[1].map(t => t.taskNumber), [2, 3]);
    assert.deepEqual(batches[2].map(t => t.taskNumber), [4]);
  });

  it('handles fan-out pattern', () => {
    // A -> B, A -> C, A -> D
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [1] },
      { name: 'C', dependsOn: [1] },
      { name: 'D', dependsOn: [1] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 2);
    assert.deepEqual(batches[0].map(t => t.taskNumber), [1]);
    assert.deepEqual(batches[1].map(t => t.taskNumber), [2, 3, 4]);
  });

  it('handles fan-in pattern', () => {
    // A -> D, B -> D, C -> D
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [] },
      { name: 'C', dependsOn: [] },
      { name: 'D', dependsOn: [1, 2, 3] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 2);
    assert.deepEqual(batches[0].map(t => t.taskNumber), [1, 2, 3]);
    assert.deepEqual(batches[1].map(t => t.taskNumber), [4]);
  });

  it('sorts tasks within batch by originalIndex', () => {
    // E, D, C all independent - should appear in index order
    const tasks = [
      { name: 'E', dependsOn: [] },
      { name: 'D', dependsOn: [] },
      { name: 'C', dependsOn: [] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.deepEqual(batches[0].map(t => t.originalIndex), [0, 1, 2]);
  });

  it('splits large batch by maxBatchSize', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ name: `T${i + 1}`, dependsOn: [] }));
    const batches = buildParallelBatches(tasks, { maxBatchSize: 5 });
    assert.equal(batches.length, 2);
    assert.equal(batches[0].length, 5);
    assert.equal(batches[1].length, 3);
  });

  it('does not split batch at or under maxBatchSize', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({ name: `T${i + 1}`, dependsOn: [] }));
    const batches = buildParallelBatches(tasks, { maxBatchSize: 5 });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 5);
  });

  it('treats missing dependsOn as empty (first batch)', () => {
    const tasks = [
      { name: 'A' },
      { name: 'B', dependsOn: [] }
    ];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 2);
  });

  it('preserves task reference in batch entries', () => {
    const tasks = [{ name: 'A', dependsOn: [], fullText: 'Do A' }];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches[0][0].task, tasks[0]);
    assert.equal(batches[0][0].task.fullText, 'Do A');
  });

  it('handles single task', () => {
    const tasks = [{ name: 'Solo', dependsOn: [] }];
    const batches = buildParallelBatches(tasks);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 1);
    assert.equal(batches[0][0].taskNumber, 1);
  });

  it('handles complex graph with mixed levels', () => {
    // 1 -> 3, 2 -> 3, 3 -> 5, 4 independent, 5 last
    const tasks = [
      { name: 'A', dependsOn: [] },
      { name: 'B', dependsOn: [] },
      { name: 'C', dependsOn: [1, 2] },
      { name: 'D', dependsOn: [] },
      { name: 'E', dependsOn: [3] }
    ];
    const batches = buildParallelBatches(tasks);
    // Level 0: A(1), B(2), D(4) - all independent
    // Level 1: C(3) - depends on A and B
    // Level 2: E(5) - depends on C
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0].map(t => t.taskNumber), [1, 2, 4]);
    assert.deepEqual(batches[1].map(t => t.taskNumber), [3]);
    assert.deepEqual(batches[2].map(t => t.taskNumber), [5]);
  });
});
