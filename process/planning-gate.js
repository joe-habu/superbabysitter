/**
 * @process superbabysitter/planning-gate
 * @description Phase 2: Planning Gate - create bite-sized TDD plan, verify it, get human approval
 * @inputs { feature: string, designResult: object }
 * @outputs { planResult: object, planVerifyResult: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// === TASK DEFINITIONS ===

export const planWriterTask = defineTask('plan-writer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Write plan for: ${args.feature}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'implementation planner who writes bite-sized TDD task plans',
      task: 'Create detailed implementation plan with bite-sized TDD tasks',
      context: { feature: args.feature, design: args.design },
      instructions: args.instructions,
      outputFormat: 'JSON with taskCount (number), tasks (array of {name, fullText, context}), planDoc (string)'
    },
    outputSchema: {
      type: 'object',
      required: ['taskCount', 'tasks'],
      properties: {
        taskCount: { type: 'number' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              fullText: { type: 'string' },
              context: { type: 'string' }
            }
          }
        },
        planDoc: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const planVerifierTask = defineTask('plan-verifier', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Verify plan completeness',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'plan auditor who does not trust the plan writer',
      task: 'Verify implementation plan covers all requirements with proper TDD structure',
      context: { plan: args.plan, design: args.design },
      instructions: args.instructions,
      outputFormat: 'JSON with passed (boolean), gaps (array), report (string)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'gaps'],
      properties: {
        passed: { type: 'boolean' },
        gaps: { type: 'array', items: { type: 'string' } },
        report: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

export async function planningGate(inputs, ctx) {
  ctx.log('Phase 2: Planning Gate');

  const planResult = await ctx.task(planWriterTask, {
    feature: inputs.feature,
    design: inputs.designResult,
    instructions: [
      'IRON LAW: Every task must be bite-sized (2-5 minutes, ONE action per step)',
      'Assume engineer has zero codebase context',
      'Each task: write failing test -> verify fail -> implement minimal -> verify pass -> commit',
      'Include exact file paths, complete code, exact commands with expected output',
      'DRY. YAGNI. TDD. Frequent commits.',
      'Write plan to artifacts/plan.md'
    ]
  });

  const planVerifyResult = await ctx.task(planVerifierTask, {
    plan: planResult,
    design: inputs.designResult,
    instructions: [
      'IRON LAW: Do not trust the plan writer. Verify independently.',
      'Check: Does plan cover all design requirements?',
      'Check: Is every task truly bite-sized?',
      'Check: Does every task follow TDD?',
      'Check: Are file paths exact and complete?',
      'Write verification to artifacts/plan-verification.md'
    ]
  });

  // HARD GATE: Human must approve plan before implementation
  await ctx.breakpoint({
    question: `Review the implementation plan (${planResult.taskCount} tasks). Approve to begin TDD implementation?`,
    title: 'Plan Approval Gate',
    context: {
      runId: ctx.runId,
      files: [
        { path: 'artifacts/plan.md', format: 'markdown' },
        { path: 'artifacts/plan-verification.md', format: 'markdown' }
      ]
    }
  });

  return { planResult, planVerifyResult };
}
