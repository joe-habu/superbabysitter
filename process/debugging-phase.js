/**
 * @process superbabysitter/debugging-phase
 * @description Phase 5: Debugging Phase (conditional) - 4-phase root cause investigation when verification or tests fail
 * @inputs { issue: string }
 * @outputs { fixResult: object | undefined }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { subagentImplementerTask } from './subagent-tdd-loop.js';
import { mcpDebuggingInstructions, mcpFixInstructions } from './mcp-state-helpers.js';

// === HELPER FUNCTIONS ===

export function normalizeIssue(issue) {
  if (!issue) return { description: '' };
  if (typeof issue === 'string') return { description: issue };
  return issue;
}

export function buildPriorAttemptsInstructions(priorAttempts) {
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

export function buildEscalationHistory(allAttempts) {
  if (!allAttempts || allAttempts.length === 0) return [];
  return [
    'Investigation History:',
    ...allAttempts.map(pa =>
      `  Attempt ${pa.attempt}: "${pa.rootCauseHypothesis || 'unknown'}" -> ${pa.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`
    )
  ];
}

// === TASK DEFINITIONS ===

export const rootCauseInvestigationTask = defineTask('root-cause-investigation', (args, taskCtx) => ({
  kind: 'agent',
  title: `Investigate: ${(args.issue || '').substring(0, 50)}...`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'systematic debugger who investigates before fixing',
      task: 'Investigate root cause of issue - do NOT propose fixes',
      context: {
        issue: args.issue,
        ...(args.structuredContext || {})
      },
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

export async function debuggingPhase(ctx, issue, attempt = 1, runId = null, priorAttempts = []) {
  const log = (ctx.log || (() => {})).bind(ctx);
  log(`Phase 5: Debugging Phase (attempt ${attempt}/${MAX_DEBUG_ATTEMPTS})`);

  const normalized = normalizeIssue(issue);
  const issueDescription = normalized.description;

  const mcpRootCauseInstr = runId ? mcpDebuggingInstructions(runId, 'root_cause_investigation') : [];
  const mcpPatternInstr = runId ? mcpDebuggingInstructions(runId, 'pattern_analysis') : [];
  const mcpHypothesisInstr = runId ? mcpDebuggingInstructions(runId, 'hypothesis_test') : [];

  // Phase 1: Root cause investigation (REQUIRED before any fix)
  const rootCause = await ctx.task(rootCauseInvestigationTask, {
    issue: issueDescription,
    structuredContext: {
      ...(normalized.structuredFailure && { structuredFailure: normalized.structuredFailure }),
      ...(normalized.testResults && { testResults: normalized.testResults })
    },
    instructions: [
      'IRON LAW: No fixes without root cause investigation first.',
      'INVESTIGATE, do not fix.',
      '1. Read error messages - full stack traces, line numbers',
      '2. Reproduce consistently',
      '3. Check recent changes - git diff',
      '4. Trace data flow backward to source',
      'Report hypothesis with evidence, NOT a fix',
      ...buildPriorAttemptsInstructions(priorAttempts),
      ...mcpRootCauseInstr
    ]
  });

  // Phase 2: Pattern analysis
  const pattern = await ctx.task(patternAnalysisTask, {
    issue: issueDescription, rootCause,
    instructions: [
      'Find working examples, compare, list differences',
      'Understand dependencies and assumptions',
      ...mcpPatternInstr
    ]
  });

  // Phase 3: Hypothesis testing
  const hypothesis = await ctx.task(hypothesisTestingTask, {
    issue: issueDescription, rootCause, pattern,
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
      taskName: `Fix: ${issueDescription.substring(0, 40)}`,
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
    const attemptRecord = {
      attempt,
      rootCauseHypothesis: rootCause.hypothesis,
      rootCauseEvidence: rootCause.evidence,
      patternDifferences: pattern.differences,
      hypothesisTest: hypothesis.hypothesis,
      confirmed: false
    };

    if (attempt >= MAX_DEBUG_ATTEMPTS) {
      log(`Debugging exhausted ${MAX_DEBUG_ATTEMPTS} attempts. Escalating to human.`);
      const allAttempts = [...priorAttempts, attemptRecord];
      await ctx.breakpoint({
        question: [
          `Debugging failed to confirm a root cause after ${MAX_DEBUG_ATTEMPTS} attempts.`,
          '',
          `Issue: ${issueDescription.substring(0, 200)}`,
          '',
          ...buildEscalationHistory(allAttempts),
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
    return await debuggingPhase(ctx, issue, attempt + 1, runId, [...priorAttempts, attemptRecord]);
  }
}
