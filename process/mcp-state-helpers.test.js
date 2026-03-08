import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mcpStateInstructions,
  mcpImplementerInstructions,
  mcpReviewerInstructions,
  mcpTddFixerInstructions,
  mcpFixInstructions,
  mcpDebuggingInstructions
} from './mcp-state-helpers.js';

// === Shared assertion helpers ===

function assertMandatoryQueryDelimiters(joined) {
  assert.ok(joined.includes('=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ==='),
    'Missing opening MANDATORY STATE QUERY delimiter');
  assert.ok(joined.includes('=== END MANDATORY STATE QUERY ==='),
    'Missing closing MANDATORY STATE QUERY delimiter');
}

function assertRecordingDelimiters(joined) {
  assert.ok(joined.includes('=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ==='),
    'Missing opening STATE RECORDING delimiter');
  assert.ok(joined.includes('=== END STATE RECORDING ==='),
    'Missing closing STATE RECORDING delimiter');
}

function assertGetResultsFollowsSearch(joined) {
  const searchIdx = joined.indexOf('search_results');
  if (searchIdx !== -1) {
    assert.ok(joined.includes('get_results(ids='),
      'get_results must follow search_results to complete the 3-layer pattern');
  }
}

function assertStateContextUsed(joined) {
  assert.ok(joined.includes('stateContextUsed'),
    'Recording section must include stateContextUsed for accountability');
}

function assertPurposeLines(joined) {
  if (joined.includes('=== MANDATORY STATE QUERY')) {
    assert.ok(joined.includes('PURPOSE:'),
      'Query steps must include PURPOSE: lines');
    assert.ok(joined.includes('USE THIS TO:'),
      'Query steps must include USE THIS TO: lines');
  }
}

function assertNoOldDelimiters(joined) {
  assert.ok(!joined.includes('--- MCP STATE MANAGEMENT ---'),
    'Old delimiter format must not appear');
  assert.ok(!joined.includes('--- END MCP STATE ---'),
    'Old end delimiter format must not appear');
}

// === mcpStateInstructions ===

describe('mcpStateInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpStateInstructions({ runId: 1, phase: 'design', resultType: 'context_exploration' });
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('includes the runId in instructions', () => {
    const result = mcpStateInstructions({ runId: 42, phase: 'tdd', resultType: 'implementation' });
    const joined = result.join('\n');
    assert.ok(joined.includes('42'));
  });

  it('includes phase and resultType in recording section', () => {
    const result = mcpStateInstructions({ runId: 1, phase: 'debugging', resultType: 'fix' });
    const joined = result.join('\n');
    assert.ok(joined.includes('"debugging"'));
    assert.ok(joined.includes('"fix"'));
  });

  it('uses new delimiter format', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { getRunSummary: true }
    });
    const joined = result.join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('respects getRunSummary query flag', () => {
    const withFlag = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { getRunSummary: true }
    });
    const withoutFlag = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: {}
    });
    assert.ok(withFlag.join('\n').includes('get_run_summary'));
    assert.ok(!withoutFlag.join('\n').includes('get_run_summary'));
  });

  it('respects searchDecisions query flag with get_results follow-up', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { searchDecisions: true }
    });
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="decision"'));
    assertGetResultsFollowsSearch(joined);
    assertPurposeLines(joined);
  });

  it('respects searchPhase query flag with get_results follow-up', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'verification', resultType: 'verification',
      queryInstructions: { searchPhase: 'tdd' }
    });
    const joined = result.join('\n');
    assert.ok(joined.includes('phase="tdd"'));
    assertGetResultsFollowsSearch(joined);
  });

  it('respects searchResultType query flag with get_results follow-up', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { searchResultType: 'decision' }
    });
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="decision"'));
    assertGetResultsFollowsSearch(joined);
  });

  it('includes custom query instructions', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { custom: ['Custom instruction line'] }
    });
    assert.ok(result.join('\n').includes('Custom instruction line'));
  });

  it('includes stateContextUsed in recording section', () => {
    const result = mcpStateInstructions({ runId: 1, phase: 'design', resultType: 'context_exploration' });
    assertStateContextUsed(result.join('\n'));
  });

  it('omits query section when no query instructions provided', () => {
    const result = mcpStateInstructions({ runId: 1, phase: 'design', resultType: 'context_exploration' });
    const joined = result.join('\n');
    assert.ok(!joined.includes('=== MANDATORY STATE QUERY'));
    assertRecordingDelimiters(joined);
  });
});

// === mcpImplementerInstructions ===

describe('mcpImplementerInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpImplementerInstructions(1, 3, 'Test Task');
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('includes task number and name', () => {
    const result = mcpImplementerInstructions(5, 7, 'Build Widget');
    const joined = result.join('\n');
    assert.ok(joined.includes('7'));
    assert.ok(joined.includes('Build Widget'));
  });

  it('records as implementation result type', () => {
    const result = mcpImplementerInstructions(1, 1, 'Task');
    const joined = result.join('\n');
    assert.ok(joined.includes('"implementation"'));
  });

  it('queries implementation and decision results', () => {
    const result = mcpImplementerInstructions(1, 1, 'Task');
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="implementation"'));
    assert.ok(joined.includes('result_type="decision"'));
  });

  it('uses new delimiter format', () => {
    const joined = mcpImplementerInstructions(1, 1, 'Task').join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('includes get_results after every search_results', () => {
    assertGetResultsFollowsSearch(mcpImplementerInstructions(1, 1, 'Task').join('\n'));
  });

  it('includes PURPOSE and USE THIS TO lines', () => {
    assertPurposeLines(mcpImplementerInstructions(1, 1, 'Task').join('\n'));
  });

  it('includes stateContextUsed in recording section', () => {
    assertStateContextUsed(mcpImplementerInstructions(1, 1, 'Task').join('\n'));
  });
});

// === mcpReviewerInstructions ===

describe('mcpReviewerInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpReviewerInstructions(1, 1, 'Task', 'spec');
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('uses spec_review for spec review type', () => {
    const result = mcpReviewerInstructions(1, 1, 'Task', 'spec');
    const joined = result.join('\n');
    assert.ok(joined.includes('"spec_review"'));
    assert.ok(!joined.includes('"quality_review"'));
  });

  it('uses quality_review for quality review type', () => {
    const result = mcpReviewerInstructions(1, 1, 'Task', 'quality');
    const joined = result.join('\n');
    assert.ok(joined.includes('"quality_review"'));
    assert.ok(!joined.includes('"spec_review"'));
  });

  it('includes task number and name', () => {
    const result = mcpReviewerInstructions(5, 3, 'Widget', 'spec');
    const joined = result.join('\n');
    assert.ok(joined.includes('3'));
    assert.ok(joined.includes('Widget'));
  });

  it('uses new delimiter format', () => {
    const joined = mcpReviewerInstructions(1, 1, 'Task', 'spec').join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('includes get_results after every search_results', () => {
    assertGetResultsFollowsSearch(mcpReviewerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });

  it('includes PURPOSE and USE THIS TO lines', () => {
    assertPurposeLines(mcpReviewerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });

  it('includes stateContextUsed in recording section', () => {
    assertStateContextUsed(mcpReviewerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });
});

// === mcpTddFixerInstructions ===

describe('mcpTddFixerInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpTddFixerInstructions(1, 1, 'Task', 'spec');
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('queries spec_review for spec review type', () => {
    const result = mcpTddFixerInstructions(1, 2, 'Task', 'spec');
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="spec_review"'));
  });

  it('queries quality_review for quality review type', () => {
    const result = mcpTddFixerInstructions(1, 2, 'Task', 'quality');
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="quality_review"'));
  });

  it('records as fix result type in tdd phase', () => {
    const result = mcpTddFixerInstructions(1, 1, 'Task', 'spec');
    const joined = result.join('\n');
    assert.ok(joined.includes('"fix"'));
    assert.ok(joined.includes('"tdd"'));
  });

  it('includes task number and name', () => {
    const result = mcpTddFixerInstructions(5, 3, 'Widget', 'spec');
    const joined = result.join('\n');
    assert.ok(joined.includes('3'));
    assert.ok(joined.includes('Widget'));
  });

  it('uses new delimiter format', () => {
    const joined = mcpTddFixerInstructions(1, 1, 'Task', 'spec').join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('includes get_results after every search_results', () => {
    assertGetResultsFollowsSearch(mcpTddFixerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });

  it('includes PURPOSE and USE THIS TO lines', () => {
    assertPurposeLines(mcpTddFixerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });

  it('includes stateContextUsed in recording section', () => {
    assertStateContextUsed(mcpTddFixerInstructions(1, 1, 'Task', 'spec').join('\n'));
  });
});

// === mcpFixInstructions ===

describe('mcpFixInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpFixInstructions(1);
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('queries root_cause_investigation, pattern_analysis, and hypothesis_test', () => {
    const result = mcpFixInstructions(1);
    const joined = result.join('\n');
    assert.ok(joined.includes('result_type="root_cause_investigation"'));
    assert.ok(joined.includes('result_type="pattern_analysis"'));
    assert.ok(joined.includes('result_type="hypothesis_test"'));
  });

  it('records as fix result type in debugging phase', () => {
    const result = mcpFixInstructions(1);
    const joined = result.join('\n');
    assert.ok(joined.includes('"fix"'));
    assert.ok(joined.includes('"debugging"'));
  });

  it('uses new delimiter format', () => {
    const joined = mcpFixInstructions(1).join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('includes get_results after every search_results', () => {
    assertGetResultsFollowsSearch(mcpFixInstructions(1).join('\n'));
  });

  it('includes PURPOSE and USE THIS TO lines', () => {
    assertPurposeLines(mcpFixInstructions(1).join('\n'));
  });

  it('includes stateContextUsed in recording section', () => {
    assertStateContextUsed(mcpFixInstructions(1).join('\n'));
  });
});

// === mcpDebuggingInstructions ===

describe('mcpDebuggingInstructions', () => {
  it('returns an array of strings', () => {
    const result = mcpDebuggingInstructions(1);
    assert.ok(Array.isArray(result));
    result.forEach(item => assert.equal(typeof item, 'string'));
  });

  it('defaults to debug_investigation result type', () => {
    const result = mcpDebuggingInstructions(1);
    const joined = result.join('\n');
    assert.ok(joined.includes('"debug_investigation"'));
  });

  it('accepts custom resultType parameter', () => {
    const result = mcpDebuggingInstructions(1, 'root_cause_investigation');
    const joined = result.join('\n');
    assert.ok(joined.includes('"root_cause_investigation"'));
    assert.ok(!joined.includes('"debug_investigation"'));
  });

  it('accepts pattern_analysis resultType', () => {
    const result = mcpDebuggingInstructions(1, 'pattern_analysis');
    const joined = result.join('\n');
    assert.ok(joined.includes('"pattern_analysis"'));
  });

  it('accepts hypothesis_test resultType', () => {
    const result = mcpDebuggingInstructions(1, 'hypothesis_test');
    const joined = result.join('\n');
    assert.ok(joined.includes('"hypothesis_test"'));
  });

  it('includes runId in instructions', () => {
    const result = mcpDebuggingInstructions(99);
    const joined = result.join('\n');
    assert.ok(joined.includes('99'));
  });

  it('uses new delimiter format', () => {
    const joined = mcpDebuggingInstructions(1).join('\n');
    assertMandatoryQueryDelimiters(joined);
    assertRecordingDelimiters(joined);
    assertNoOldDelimiters(joined);
  });

  it('includes get_results after every search_results', () => {
    assertGetResultsFollowsSearch(mcpDebuggingInstructions(1).join('\n'));
  });

  it('includes PURPOSE and USE THIS TO lines', () => {
    assertPurposeLines(mcpDebuggingInstructions(1).join('\n'));
  });

  it('includes stateContextUsed in recording section', () => {
    assertStateContextUsed(mcpDebuggingInstructions(1).join('\n'));
  });
});
