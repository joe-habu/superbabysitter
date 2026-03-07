/**
 * @process superbabysitter/verification-gate
 * @description Phase 4: Verification Gate - run evidence-based verification, get human review
 * @inputs { feature: string, planResult: object }
 * @outputs { verificationResult: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// === TASK DEFINITIONS ===

export const verificationTask = defineTask('verification', (args, taskCtx) => ({
  kind: 'agent',
  title: `Verify: ${args.feature}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'verification engineer who requires evidence for every claim',
      task: 'Run full verification and produce evidence-backed report',
      context: { feature: args.feature, plan: args.plan },
      instructions: args.instructions,
      outputFormat: 'JSON with passed (boolean), requirements (array of {requirement, command, output, verdict}), summary'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'requirements', 'summary'],
      properties: {
        passed: { type: 'boolean' },
        requirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              requirement: { type: 'string' },
              command: { type: 'string' },
              output: { type: 'string' },
              verdict: { type: 'string' }
            }
          }
        },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

export async function verificationGate(inputs, ctx) {
  ctx.log('Phase 4: Verification Gate');

  const verificationResult = await ctx.task(verificationTask, {
    feature: inputs.feature,
    plan: inputs.planResult,
    instructions: [
      'IRON LAW: No completion claims without fresh verification evidence.',
      'For EACH requirement:',
      '  1. IDENTIFY command that proves it',
      '  2. RUN the command (fresh, complete)',
      '  3. READ full output, check exit code',
      '  4. RECORD command, output, and verdict',
      'Run full test suite. Report actual pass/fail counts.',
      'Write report to artifacts/verification-report.md'
    ]
  });

  // HARD GATE: Human reviews verification evidence quality
  await ctx.breakpoint({
    question: [
      'Review verification evidence quality.',
      '',
      `Result: ${verificationResult.passed ? 'ALL PASS' : 'FAILURES DETECTED'}`,
      `Summary: ${verificationResult.summary || 'See artifacts/verification-report.md'}`,
      '',
      verificationResult.passed
        ? 'Resolve to proceed to finishing gate.'
        : 'Resolve to proceed to debugging phase for failing requirements.'
    ].join('\n'),
    title: 'Verification Evidence Review',
    context: {
      runId: ctx.runId,
      files: [{ path: 'artifacts/verification-report.md', format: 'markdown' }]
    }
  });

  return { verificationResult };
}
