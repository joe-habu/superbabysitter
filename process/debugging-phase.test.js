import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirror the helper functions for testing since they may not be exported yet.
// Once implemented, we verify the real exports match.

// --- normalizeIssue ---

function normalizeIssue(issue) {
  if (!issue) return { description: '' };
  if (typeof issue === 'string') return { description: issue };
  return issue;
}

describe('normalizeIssue', () => {
  it('string input returns { description: <string> }', () => {
    const result = normalizeIssue('something broke');
    assert.deepEqual(result, { description: 'something broke' });
  });

  it('object input returns the object as-is', () => {
    const obj = { description: 'a bug', extra: 42 };
    const result = normalizeIssue(obj);
    assert.strictEqual(result, obj);
    assert.equal(result.description, 'a bug');
  });

  it('object with structuredFailure preserves structured data', () => {
    const obj = {
      description: 'Requirement failed',
      structuredFailure: { requirement: 'X', command: 'npm test', output: 'FAIL', verdict: 'FAIL' }
    };
    const result = normalizeIssue(obj);
    assert.deepEqual(result.structuredFailure, obj.structuredFailure);
  });

  it('object with testResults preserves test result data', () => {
    const obj = {
      description: 'Test failures',
      testResults: { passed: 5, failed: 2, total: 7 }
    };
    const result = normalizeIssue(obj);
    assert.deepEqual(result.testResults, obj.testResults);
  });

  it('handles undefined gracefully', () => {
    const result = normalizeIssue(undefined);
    assert.deepEqual(result, { description: '' });
  });

  it('handles null gracefully', () => {
    const result = normalizeIssue(null);
    assert.deepEqual(result, { description: '' });
  });
});

// --- buildPriorAttemptsInstructions ---

function buildPriorAttemptsInstructions(priorAttempts) {
  if (!priorAttempts || priorAttempts.length === 0) return [];
  return [
    '=== PRIOR DEBUGGING ATTEMPTS (DO NOT REPEAT) ===',
    ...priorAttempts.map(pa => [
      `Attempt ${pa.attempt}:`,
      `  Hypothesis: ${pa.rootCauseHypothesis || 'unknown'}`,
      `  Evidence: ${(pa.rootCauseEvidence || []).join(', ') || 'none'}`,
      `  Pattern differences: ${(pa.patternDifferences || []).join(', ') || 'none'}`,
      `  Hypothesis test: ${pa.hypothesisTest || 'unknown'}`,
      `  Confirmed: ${pa.confirmed}`,
    ].join('\n')),
    '=== END PRIOR ATTEMPTS ===',
    'You MUST investigate a DIFFERENT root cause hypothesis. Do NOT repeat the above.'
  ];
}

describe('buildPriorAttemptsInstructions', () => {
  it('empty array returns empty array', () => {
    assert.deepEqual(buildPriorAttemptsInstructions([]), []);
  });

  it('undefined returns empty array', () => {
    assert.deepEqual(buildPriorAttemptsInstructions(undefined), []);
  });

  it('null returns empty array', () => {
    assert.deepEqual(buildPriorAttemptsInstructions(null), []);
  });

  it('single attempt generates DO NOT REPEAT instructions', () => {
    const attempts = [{
      attempt: 1,
      rootCauseHypothesis: 'race condition in auth',
      rootCauseEvidence: ['log line 42', 'timing mismatch'],
      patternDifferences: ['missing await'],
      hypothesisTest: 'added await to auth call',
      confirmed: false
    }];
    const result = buildPriorAttemptsInstructions(attempts);

    assert.ok(result.length > 0);
    assert.equal(result[0], '=== PRIOR DEBUGGING ATTEMPTS (DO NOT REPEAT) ===');
    assert.equal(result[result.length - 2], '=== END PRIOR ATTEMPTS ===');
    assert.ok(result[result.length - 1].includes('DIFFERENT root cause'));

    const attemptBlock = result[1];
    assert.ok(attemptBlock.includes('Attempt 1:'));
    assert.ok(attemptBlock.includes('race condition in auth'));
    assert.ok(attemptBlock.includes('log line 42, timing mismatch'));
    assert.ok(attemptBlock.includes('missing await'));
    assert.ok(attemptBlock.includes('added await to auth call'));
    assert.ok(attemptBlock.includes('Confirmed: false'));
  });

  it('multiple attempts render all with separators', () => {
    const attempts = [
      { attempt: 1, rootCauseHypothesis: 'H1', confirmed: false },
      { attempt: 2, rootCauseHypothesis: 'H2', confirmed: false }
    ];
    const result = buildPriorAttemptsInstructions(attempts);

    assert.ok(result[0].includes('PRIOR DEBUGGING ATTEMPTS'));
    // Two attempt blocks between delimiters
    const attemptBlocks = result.filter(line => typeof line === 'string' && line.includes('Attempt'));
    assert.ok(attemptBlocks.length >= 2);
  });

  it('handles attempts with missing fields gracefully', () => {
    const attempts = [{ attempt: 1, confirmed: false }];
    const result = buildPriorAttemptsInstructions(attempts);
    const block = result[1];
    assert.ok(block.includes('Hypothesis: unknown'));
    assert.ok(block.includes('Evidence: none'));
    assert.ok(block.includes('Pattern differences: none'));
    assert.ok(block.includes('Hypothesis test: unknown'));
  });
});

// --- buildEscalationHistory ---

function buildEscalationHistory(allAttempts) {
  if (!allAttempts || allAttempts.length === 0) return [];
  return [
    'Investigation History:',
    ...allAttempts.map(pa =>
      `  Attempt ${pa.attempt}: "${pa.rootCauseHypothesis || 'unknown'}" -> ${pa.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`
    )
  ];
}

describe('buildEscalationHistory', () => {
  it('empty array returns empty array', () => {
    assert.deepEqual(buildEscalationHistory([]), []);
  });

  it('undefined returns empty array', () => {
    assert.deepEqual(buildEscalationHistory(undefined), []);
  });

  it('null returns empty array', () => {
    assert.deepEqual(buildEscalationHistory(null), []);
  });

  it('single attempt shows details', () => {
    const attempts = [{ attempt: 1, rootCauseHypothesis: 'Bad config', confirmed: false }];
    const result = buildEscalationHistory(attempts);
    assert.equal(result[0], 'Investigation History:');
    assert.ok(result[1].includes('Attempt 1'));
    assert.ok(result[1].includes('"Bad config"'));
    assert.ok(result[1].includes('NOT CONFIRMED'));
  });

  it('multiple attempts show full chain', () => {
    const attempts = [
      { attempt: 1, rootCauseHypothesis: 'H1', confirmed: false },
      { attempt: 2, rootCauseHypothesis: 'H2', confirmed: false },
      { attempt: 3, rootCauseHypothesis: 'H3', confirmed: false }
    ];
    const result = buildEscalationHistory(attempts);
    assert.equal(result.length, 4); // header + 3 entries
    assert.ok(result[1].includes('Attempt 1'));
    assert.ok(result[2].includes('Attempt 2'));
    assert.ok(result[3].includes('Attempt 3'));
  });

  it('shows CONFIRMED for confirmed hypotheses', () => {
    const attempts = [{ attempt: 1, rootCauseHypothesis: 'Found it', confirmed: true }];
    const result = buildEscalationHistory(attempts);
    assert.ok(result[1].includes('CONFIRMED'));
    assert.ok(!result[1].includes('NOT CONFIRMED'));
  });

  it('handles missing hypothesis field gracefully', () => {
    const attempts = [{ attempt: 1, confirmed: false }];
    const result = buildEscalationHistory(attempts);
    assert.ok(result[1].includes('"unknown"'));
  });
});

// --- Export verification ---

describe('debugging-phase exports', () => {
  it('exports all expected functions', async () => {
    const mod = await import('./debugging-phase.js');
    assert.equal(typeof mod.debuggingPhase, 'function');
    assert.equal(typeof mod.normalizeIssue, 'function');
    assert.equal(typeof mod.buildPriorAttemptsInstructions, 'function');
    assert.equal(typeof mod.buildEscalationHistory, 'function');
  });

  it('exports all task definitions', async () => {
    const mod = await import('./debugging-phase.js');
    assert.ok(mod.rootCauseInvestigationTask);
    assert.ok(mod.patternAnalysisTask);
    assert.ok(mod.hypothesisTestingTask);
  });

  it('normalizeIssue from module matches expected behavior', async () => {
    const mod = await import('./debugging-phase.js');
    assert.deepEqual(mod.normalizeIssue('test'), { description: 'test' });
    assert.deepEqual(mod.normalizeIssue(null), { description: '' });
    const obj = { description: 'x', structuredFailure: { a: 1 } };
    assert.strictEqual(mod.normalizeIssue(obj), obj);
  });

  it('buildPriorAttemptsInstructions from module matches expected behavior', async () => {
    const mod = await import('./debugging-phase.js');
    assert.deepEqual(mod.buildPriorAttemptsInstructions([]), []);
    const result = mod.buildPriorAttemptsInstructions([{ attempt: 1, confirmed: false }]);
    assert.ok(result[0].includes('PRIOR DEBUGGING ATTEMPTS'));
  });

  it('buildEscalationHistory from module matches expected behavior', async () => {
    const mod = await import('./debugging-phase.js');
    assert.deepEqual(mod.buildEscalationHistory([]), []);
    const result = mod.buildEscalationHistory([{ attempt: 1, rootCauseHypothesis: 'H', confirmed: false }]);
    assert.equal(result[0], 'Investigation History:');
  });
});
