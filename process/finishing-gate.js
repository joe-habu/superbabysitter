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
          finalTests.failureDetails ? `Failures: ${finalTests.failureDetails.substring(0, 300)}` : '',
          '',
          'Options:',
          '1. Provide guidance and retry',
          '2. Accept current state (some tests failing)',
          '3. Abort the run',
        ].join('\n'),
        title: 'Finishing Gate Escalation',
        context: { runId: ctx.runId }
      });
    } else {
      ctx.log(`Tests failing: ${finalTests.failed} failures. Triggering debugging phase.`);
      await debuggingPhase(ctx, `Test failures: ${finalTests.failureDetails}`);

      // Re-run tests after fix
      return await finishingGate(inputs, ctx, attempt + 1);
    }
  }

  // Tests pass - present 4 options
  await ctx.breakpoint({
    question: [
      `Implementation complete. Tests: ${finalTests.passed}/${finalTests.total} passing.`,
      '',
      '1. Merge back to base branch locally',
      '2. Push and create a Pull Request',
      '3. Keep the branch as-is (handle later)',
      '4. Discard this work',
      '',
      'Which option?'
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
