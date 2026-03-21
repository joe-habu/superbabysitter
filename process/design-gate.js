/**
 * @process superbabysitter/design-gate
 * @description Phase 1: Design Gate - explore context, propose approaches, get human approval
 * @inputs { feature: string, codebasePath: string }
 * @outputs { contextResult: object, designResult: object }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { mcpStateInstructions } from './mcp-state-helpers.js';

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
        'Summarize findings for design proposal',
        ...(args.mcpInstructions || [])
      ],
      outputFormat: 'JSON with patterns, conventions, constraints, integrationPoints, priorRunInsights (array of strings from prior runs, empty if none), runId (if you created a new run)'
    },
    outputSchema: {
      type: 'object',
      required: ['patterns', 'constraints'],
      properties: {
        patterns: { type: 'array', items: { type: 'string' } },
        conventions: { type: 'array', items: { type: 'string' } },
        constraints: { type: 'array', items: { type: 'string' } },
        integrationPoints: { type: 'array', items: { type: 'string' } },
        priorRunInsights: { type: 'array', items: { type: 'string' } },
        runId: { type: 'number' }
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
  const log = (ctx.log || (() => {})).bind(ctx);
  log('Phase 1: Design Gate');

  // Create MCP run for persistent state tracking
  const runId = inputs.runId || null;
  const project = inputs.project || inputs.codebasePath || '.';
  const mcpCreateInstructions = runId ? [] : [
    '',
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    `1. Call search_prior_runs(project="${project}", feature="${inputs.feature}")`,
    '   PURPOSE: Find prior workflow runs for this project/feature.',
    '   USE THIS TO: Learn from previous attempts - what worked, what failed, what decisions were made.',
    '',
    '2. If prior runs exist, call get_run_summary(run_id=<most recent run ID>) to get its summary.',
    '   THEN: Call search_results(run_id=<that run ID>, result_type="decision")',
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full architectural decisions.',
    '   PURPOSE: Recover prior architectural decisions with full rationale.',
    '   USE THIS TO: Carry forward good decisions and avoid repeating mistakes.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    `3. Call create_run(feature="${inputs.feature}", project="${project}") to start tracking this workflow.`,
    '   Record the returned run_id - it will be used throughout this workflow.',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    '  run_id: <the run_id from create_run>',
    '  phase: "design"',
    '  result_type: "context_exploration"',
    '  title: (brief title of context exploration)',
    '  narrative: (detailed findings)',
    '  stateContextUsed: (what you learned from prior runs and how it influenced your exploration)',
    '=== END STATE RECORDING ===',
    ''
  ];

  const contextResult = await ctx.task(contextExplorerTask, {
    feature: inputs.feature,
    codebasePath: inputs.codebasePath,
    mcpInstructions: runId
      ? mcpStateInstructions({ runId, phase: 'design', resultType: 'context_exploration', queryInstructions: { getRunSummary: true, searchDecisions: true } })
      : mcpCreateInstructions
  });

  // Extract runId from context result if it was created by the agent
  const effectiveRunId = runId || contextResult.runId || null;

  const designMcpInstructions = effectiveRunId
    ? mcpStateInstructions({
        runId: effectiveRunId,
        phase: 'design',
        resultType: 'design_proposal',
        queryInstructions: { searchPhase: 'design', searchDecisions: true, getRunSummary: true }
      })
    : [];

  const designResult = await ctx.task(designProposalTask, {
    feature: inputs.feature,
    context: contextResult,
    instructions: [
      'IRON LAW: Do NOT propose implementation details. Propose DESIGN only.',
      'Explore project context: files, docs, recent commits',
      'Propose 2-3 approaches with trade-offs and your recommendation',
      'Present design covering: architecture, components, data flow, error handling, testing',
      'Write design to artifacts/design.md',
      ...designMcpInstructions,
      ...(effectiveRunId ? [`Also call save_artifact(run_id=${effectiveRunId}, name="design.md", content=<the design doc>)`] : [])
    ]
  });

  // HARD GATE: Human must approve design before proceeding
  await ctx.breakpoint({
    question: `Review the proposed design for "${inputs.feature}". Approve to proceed to planning?`,
    title: 'Design Approval Gate',
    context: {
      runId: effectiveRunId || ctx.runId,
      files: [{ path: 'artifacts/design.md', format: 'markdown' }]
    }
  });

  return { contextResult, designResult, runId: effectiveRunId };
}
