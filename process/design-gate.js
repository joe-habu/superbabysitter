/**
 * @process superbabysitter/design-gate
 * @description Phase 1: Design Gate - explore context, propose approaches, get human approval
 * @inputs { feature: string, codebasePath: string }
 * @outputs { contextResult: object, designResult: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

// === TASK DEFINITIONS ===

export const contextExplorerTask = defineTask('context-explorer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Explore context for: ${args.feature}`,
  agent: {
    name: 'context-explorer',
    prompt: {
      role: 'senior software architect',
      task: 'Explore project context to inform design decisions',
      context: { feature: args.feature, codebasePath: args.codebasePath },
      instructions: [
        'Check project files, docs, recent commits',
        'Identify relevant existing patterns and conventions',
        'Note dependencies, constraints, and integration points',
        'Summarize findings for design proposal'
      ],
      outputFormat: 'JSON with patterns, conventions, constraints, integrationPoints'
    },
    outputSchema: {
      type: 'object',
      required: ['patterns', 'constraints'],
      properties: {
        patterns: { type: 'array', items: { type: 'string' } },
        conventions: { type: 'array', items: { type: 'string' } },
        constraints: { type: 'array', items: { type: 'string' } },
        integrationPoints: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const designProposalTask = defineTask('design-proposal', (args, taskCtx) => ({
  kind: 'agent',
  title: `Propose design for: ${args.feature}`,
  agent: {
    name: 'design-proposer',
    prompt: {
      role: 'senior software architect',
      task: 'Propose 2-3 design approaches with trade-offs and a recommendation',
      context: { feature: args.feature, projectContext: args.context },
      instructions: args.instructions,
      outputFormat: 'JSON with approaches (array), recommendation (string), designDoc (string - markdown)'
    },
    outputSchema: {
      type: 'object',
      required: ['approaches', 'recommendation', 'designDoc'],
      properties: {
        approaches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              tradeoffs: { type: 'string' }
            }
          }
        },
        recommendation: { type: 'string' },
        designDoc: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

export async function designGate(inputs, ctx) {
  ctx.log('Phase 1: Design Gate');

  const contextResult = await ctx.task(contextExplorerTask, {
    feature: inputs.feature,
    codebasePath: inputs.codebasePath
  });

  const designResult = await ctx.task(designProposalTask, {
    feature: inputs.feature,
    context: contextResult,
    instructions: [
      'IRON LAW: Do NOT propose implementation details. Propose DESIGN only.',
      'Explore project context: files, docs, recent commits',
      'Propose 2-3 approaches with trade-offs and your recommendation',
      'Present design covering: architecture, components, data flow, error handling, testing',
      'Write design to artifacts/design.md'
    ]
  });

  // HARD GATE: Human must approve design before proceeding
  await ctx.breakpoint({
    question: `Review the proposed design for "${inputs.feature}". Approve to proceed to planning?`,
    title: 'Design Approval Gate',
    context: {
      runId: ctx.runId,
      files: [{ path: 'artifacts/design.md', format: 'markdown' }]
    }
  });

  return { contextResult, designResult };
}
