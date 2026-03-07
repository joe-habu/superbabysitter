/**
 * @process superbabysitter/finishing-gate
 * @description Phase 6: Finishing Gate - verify tests pass, present 4 completion options
 * @inputs { }
 * @outputs { testResult: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { debuggingPhase } from './debugging-phase.js';

// === TASK DEFINITIONS ===

export const testRunnerTask = defineTask('test-runner', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Run full test suite',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'test runner who reports exact numbers with evidence',
      task: 'Run full test suite and report results with evidence',
      context: {},
      instructions: args.instructions,
      outputFormat: 'JSON with allPassing (boolean), passed (number), failed (number), total (number), output (string), failures (string if any)'
    },
    outputSchema: {
      type: 'object',
      required: ['allPassing', 'passed', 'total'],
      properties: {
        allPassing: { type: 'boolean' },
        passed: { type: 'number' },
        failed: { type: 'number' },
        total: { type: 'number' },
        output: { type: 'string' },
        failureDetails: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

const MAX_FINISH_ATTEMPTS = 3;

export async function finishingGate(inputs, ctx, attempt = 1) {
  ctx.log(`Phase 6: Finishing Gate (attempt ${attempt}/${MAX_FINISH_ATTEMPTS})`);

  const finalTests = await ctx.task(testRunnerTask, {
    instructions: [
      'IRON LAW: No completion claims without fresh verification evidence.',
      'Run FULL test suite. Read FULL output. Report exact numbers.'
    ]
  });

  if (!finalTests.allPassing) {
    if (attempt >= MAX_FINISH_ATTEMPTS) {
      ctx.log(`Finishing gate exhausted ${MAX_FINISH_ATTEMPTS} test/debug cycles. Escalating to human.`);
      await ctx.breakpoint({
        question: [
          `Tests still failing after ${MAX_FINISH_ATTEMPTS} debug/fix cycles.`,
          '',
          `Results: ${finalTests.passed} passed, ${finalTests.failed} failed out of ${finalTests.total}`,
          finalTests.failureDetails ? `Failures: ${finalTests.failureDetails.substring(0, 300)}` : `${finalTests.failed} test(s) failed`,
          '',
          'Resolve this breakpoint to accept the current state and continue.',
          'To abort, leave the breakpoint unresolved and cancel the run.'
        ].join('\n'),
        title: 'Finishing Gate Escalation',
        context: { runId: ctx.runId }
      });
      // BUG-1 fix: return after escalation to prevent fall-through to completion options
      return { testResult: finalTests };
    } else {
      const details = finalTests.failureDetails || finalTests.output || `${finalTests.failed} test(s) failed out of ${finalTests.total}`;
      ctx.log(`Tests failing: ${finalTests.failed} failures. Triggering debugging phase.`);
      await debuggingPhase(ctx, `Test failures: ${details}`);

      // Re-run tests after fix
      return await finishingGate(inputs, ctx, attempt + 1);
    }
  }

  // Tests pass - present completion gate
  await ctx.breakpoint({
    question: [
      `Implementation complete. Tests: ${finalTests.passed}/${finalTests.total} passing.`,
      '',
      'Resolve this breakpoint to finish the run.',
      'Post-run: merge, create PR, or keep branch manually.'
    ].join('\n'),
    title: 'Finishing Gate',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/verification-report.md', format: 'markdown' },
        { path: 'artifacts/plan.md', format: 'markdown' }
      ]
    }
  });

  return { testResult: finalTests };
}
