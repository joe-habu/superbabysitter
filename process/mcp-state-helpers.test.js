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

  it('respects searchDecisions query flag', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { searchDecisions: true }
    });
    assert.ok(result.join('\n').includes('result_type="decision"'));
  });

  it('respects searchPhase query flag', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'verification', resultType: 'verification',
      queryInstructions: { searchPhase: 'tdd' }
    });
    assert.ok(result.join('\n').includes('phase="tdd"'));
  });

  it('respects searchResultType query flag', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { searchResultType: 'decision' }
    });
    assert.ok(result.join('\n').includes('result_type="decision"'));
  });

  it('includes custom query instructions', () => {
    const result = mcpStateInstructions({
      runId: 1, phase: 'tdd', resultType: 'impl',
      queryInstructions: { custom: ['Custom instruction line'] }
    });
    assert.ok(result.join('\n').includes('Custom instruction line'));
  });
});

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
});

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
});

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
});

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
});

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
});
