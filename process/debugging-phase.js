/**
 * @process superbabysitter/debugging-phase
 * @description Phase 5: Debugging Phase (conditional) - 4-phase root cause investigation when verification or tests fail
 * @inputs { issue: string }
 * @outputs { fixResult: object | undefined }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { subagentImplementerTask } from './subagent-tdd-loop.js';
import { mcpDebuggingInstructions, mcpFixInstructions } from './mcp-state-helpers.js';

// === TASK DEFINITIONS ===

export const rootCauseInvestigationTask = defineTask('root-cause-investigation', (args, taskCtx) => ({
  kind: 'agent',
  title: `Investigate: ${args.issue.substring(0, 50)}...`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'systematic debugger who investigates before fixing',
      task: 'Investigate root cause of issue - do NOT propose fixes',
      context: { issue: args.issue },
      instructions: args.instructions,
      outputFormat: 'JSON with hypothesis (string), evidence (array), dataFlow (string), reproducible (boolean)'
    },
    outputSchema: {
      type: 'object',
      required: ['hypothesis', 'evidence'],
      properties: {
        hypothesis: { type: 'string' },
        evidence: { type: 'array', items: { type: 'string' } },
        dataFlow: { type: 'string' },
        reproducible: { type: 'boolean' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const patternAnalysisTask = defineTask('pattern-analysis', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Pattern analysis: working vs broken',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'code analyst comparing working and broken patterns',
      task: 'Find working examples and identify differences from broken code',
      context: { issue: args.issue, rootCause: args.rootCause },
      instructions: args.instructions,
      outputFormat: 'JSON with workingExamples (array), differences (array), dependencies (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['workingExamples', 'differences'],
      properties: {
        workingExamples: { type: 'array', items: { type: 'string' } },
        differences: { type: 'array', items: { type: 'string' } },
        dependencies: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const hypothesisTestingTask = defineTask('hypothesis-testing', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Test hypothesis with minimal change',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'scientific debugger testing one hypothesis at a time',
      task: 'Test single hypothesis with smallest possible change',
      context: { issue: args.issue, rootCause: args.rootCause, pattern: args.pattern },
      instructions: args.instructions,
      outputFormat: 'JSON with hypothesis (string), testPerformed (string), confirmed (boolean), fix (string if confirmed)'
    },
    outputSchema: {
      type: 'object',
      required: ['hypothesis', 'confirmed'],
      properties: {
        hypothesis: { type: 'string' },
        testPerformed: { type: 'string' },
        confirmed: { type: 'boolean' },
        fix: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

const MAX_DEBUG_ATTEMPTS = 3;

export async function debuggingPhase(ctx, issue, attempt = 1, runId = null) {
  const log = (ctx.log || (() => {})).bind(ctx);
  log(`Phase 5: Debugging Phase (attempt ${attempt}/${MAX_DEBUG_ATTEMPTS})`);

  const mcpRootCauseInstr = runId ? mcpDebuggingInstructions(runId, 'root_cause_investigation') : [];
  const mcpPatternInstr = runId ? mcpDebuggingInstructions(runId, 'pattern_analysis') : [];
  const mcpHypothesisInstr = runId ? mcpDebuggingInstructions(runId, 'hypothesis_test') : [];

  // Phase 1: Root cause investigation (REQUIRED before any fix)
  const rootCause = await ctx.task(rootCauseInvestigationTask, {
    issue,
    instructions: [
      'IRON LAW: No fixes without root cause investigation first.',
      'INVESTIGATE, do not fix.',
      '1. Read error messages - full stack traces, line numbers',
      '2. Reproduce consistently',
      '3. Check recent changes - git diff',
      '4. Trace data flow backward to source',
      'Report hypothesis with evidence, NOT a fix',
      ...mcpRootCauseInstr
    ]
  });

  // Phase 2: Pattern analysis
  const pattern = await ctx.task(patternAnalysisTask, {
    issue, rootCause,
    instructions: [
      'Find working examples, compare, list differences',
      'Understand dependencies and assumptions',
      ...mcpPatternInstr
    ]
  });

  // Phase 3: Hypothesis testing
  const hypothesis = await ctx.task(hypothesisTestingTask, {
    issue, rootCause, pattern,
    instructions: [
      'Form SINGLE hypothesis. Test with SMALLEST change.',
      'ONE variable at a time. Report confirmed or not.',
      ...mcpHypothesisInstr
    ]
  });

  // Phase 4: Fix implementation (only after root cause confirmed)
  if (hypothesis.confirmed) {
    const mcpFixInstrs = runId ? mcpFixInstructions(runId) : [];
    const fixResult = await ctx.task(subagentImplementerTask, {
      taskNumber: 0,
      taskName: `Fix: ${issue.substring(0, 40)}`,
      taskDescription: `Root cause: ${rootCause.hypothesis}\nFix: ${hypothesis.fix || '(no specific fix suggested -- apply root cause analysis)'}`,
      sceneContext: 'Debugging fix',
      instructions: [
        'IRON LAW: No production code without a failing test first.',
        'Create failing regression test. Verify FAILS.',
        'Implement fix for ROOT CAUSE. Verify PASSES.',
        'Run full suite. Verify nothing else broke. Commit.',
        ...mcpFixInstrs
      ]
    });
    return fixResult;
  } else {
    // Hypothesis not confirmed - retry with guard
    if (attempt >= MAX_DEBUG_ATTEMPTS) {
      log(`Debugging exhausted ${MAX_DEBUG_ATTEMPTS} attempts. Escalating to human.`);
      await ctx.breakpoint({
        question: [
          `Debugging failed to confirm a root cause after ${MAX_DEBUG_ATTEMPTS} attempts.`,
          '',
          `Issue: ${issue.substring(0, 200)}`,
          `Last hypothesis: ${hypothesis.hypothesis}`,
          '',
          'Resolve this breakpoint to skip this issue and continue.',
          'To abort, leave the breakpoint unresolved and cancel the run.'
        ].join('\n'),
        title: 'Debugging Escalation',
        context: { runId: runId || ctx.runId }
      });
      return undefined;
    }
    log('Hypothesis not confirmed. Returning to root cause investigation.');
    return await debuggingPhase(ctx, issue, attempt + 1, runId);
  }
}
