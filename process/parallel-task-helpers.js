/**
 * @module parallel-task-helpers
 * @description Pure helper functions for dependency-aware parallel task batching.
 * Analyzes task dependency graphs to group independent tasks into concurrent batches.
 */

/**
 * Returns true if at least one task has a dependsOn array.
 * This is the backward-compatibility gate: if no tasks declare dependencies,
 * the TDD loop falls back to sequential execution.
 * @param {Array<{dependsOn?: number[]}>} tasks
 * @returns {boolean}
 */
export function hasParallelCapableTasks(tasks) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return false;
  return tasks.some(t => Array.isArray(t.dependsOn));
}

/**
 * Validates dependency declarations across all tasks.
 * Checks: type validity, range (1-based, within task count), no self-references, no cycles.
 * @param {Array<{dependsOn?: number[]}>} tasks
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDependencies(tasks) {
  const errors = [];
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return { valid: true, errors: [] };
  }

  const n = tasks.length;

  for (let i = 0; i < n; i++) {
    const taskNum = i + 1;
    const deps = tasks[i].dependsOn;
    if (deps === undefined || deps === null) continue;
    if (!Array.isArray(deps)) {
      errors.push(`Task ${taskNum}: dependsOn must be an array, got ${typeof deps}`);
      continue;
    }

    for (const dep of deps) {
      if (typeof dep !== 'number' || !Number.isInteger(dep)) {
        errors.push(`Task ${taskNum}: dependsOn contains non-integer value: ${dep}`);
      } else if (dep < 1 || dep > n) {
        errors.push(`Task ${taskNum}: dependsOn references out-of-range task ${dep} (valid: 1-${n})`);
      } else if (dep === taskNum) {
        errors.push(`Task ${taskNum}: dependsOn contains self-reference`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Cycle detection via Kahn's algorithm
  const inDegree = new Array(n).fill(0);
  const adj = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const deps = tasks[i].dependsOn || [];
    for (const dep of deps) {
      const depIdx = dep - 1;
      adj[depIdx].push(i);
      inDegree[i]++;
    }
  }

  const queue = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    processed++;
    for (const neighbor of adj[node]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    }
  }

  if (processed < n) {
    const cycleNodes = [];
    for (let i = 0; i < n; i++) {
      if (inDegree[i] > 0) cycleNodes.push(i + 1);
    }
    errors.push(`Circular dependency detected involving tasks: ${cycleNodes.join(', ')}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Groups tasks into parallel batches using topological sort with level grouping.
 * Level 0 (zero in-degree) = Batch 1, after removing their edges: Level 1 = Batch 2, etc.
 * Large batches are split into sub-batches of at most maxBatchSize.
 * Tasks within each batch are sorted by originalIndex for determinism.
 *
 * @param {Array<{dependsOn?: number[]}>} tasks
 * @param {{ maxBatchSize?: number }} [opts={}]
 * @returns {Array<Array<{originalIndex: number, taskNumber: number, task: object}>>}
 */
export function buildParallelBatches(tasks, { maxBatchSize = 5 } = {}) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return [];

  const n = tasks.length;
  const inDegree = new Array(n).fill(0);
  const adj = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    const deps = tasks[i].dependsOn || [];
    for (const dep of deps) {
      const depIdx = dep - 1;
      adj[depIdx].push(i);
      inDegree[i]++;
    }
  }

  // BFS level grouping (Kahn's with levels)
  let currentLevel = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) currentLevel.push(i);
  }

  const levelBatches = [];
  while (currentLevel.length > 0) {
    // Sort by index for determinism
    currentLevel.sort((a, b) => a - b);

    const batch = currentLevel.map(idx => ({
      originalIndex: idx,
      taskNumber: idx + 1,
      task: tasks[idx]
    }));
    levelBatches.push(batch);

    const nextLevel = [];
    for (const idx of currentLevel) {
      for (const neighbor of adj[idx]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) nextLevel.push(neighbor);
      }
    }
    currentLevel = nextLevel;
  }

  // Split large batches into sub-batches
  const result = [];
  for (const batch of levelBatches) {
    if (batch.length <= maxBatchSize) {
      result.push(batch);
    } else {
      for (let i = 0; i < batch.length; i += maxBatchSize) {
        result.push(batch.slice(i, i + maxBatchSize));
      }
    }
  }

  return result;
}
