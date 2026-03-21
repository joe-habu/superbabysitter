/**
 * @process superbabysitter/quality-gated-development
 * @description Full development workflow with superpowers quality gates at every phase. Composes all 6 phases: design -> planning -> TDD loop -> verification -> (conditional debugging) -> finishing. Uses babysitter-state MCP tools for persistent state management.
 * @inputs { feature: string, codebasePath: string }
 * @outputs { success: boolean, feature: string, tasksCompleted: number }
 */

import { designGate, contextExplorerTask, designProposalTask } from './design-gate.js';
import { planningGate, planWriterTask, planVerifierTask } from './planning-gate.js';
import { subagentTddLoop, subagentImplementerTask, subagentFixerTask, subagentSpecReviewerTask, subagentQualityReviewerTask } from './subagent-tdd-loop.js';
import { verificationGate, verificationTask } from './verification-gate.js';
import { debuggingPhase, rootCauseInvestigationTask, patternAnalysisTask, hypothesisTestingTask } from './debugging-phase.js';
import { finishingGate, testRunnerTask } from './finishing-gate.js';
// Re-export all task definitions for consumers that need them
export {
  contextExplorerTask, designProposalTask,
  planWriterTask, planVerifierTask,
  subagentImplementerTask, subagentFixerTask, subagentSpecReviewerTask, subagentQualityReviewerTask,
  verificationTask,
  rootCauseInvestigationTask, patternAnalysisTask, hypothesisTestingTask,
  testRunnerTask
};

// Re-export all phase functions for consumers that need them
export {
  designGate, planningGate, subagentTddLoop,
  verificationGate, debuggingPhase, finishingGate
};

export async function process(inputs, ctx) {
  const log = (ctx.log || (() => {})).bind(ctx);
  const { feature, codebasePath = '.' } = inputs;
  const project = codebasePath;

  // Create persistent run via MCP (agents will use runId to query/record state)
  // The first agent in design gate will call create_run and pass runId forward.
  // We generate a placeholder here; the design gate creates the actual run.

  // ========================================================================
  // PHASE 1: DESIGN GATE (superpowers:brainstorming)
  //   Creates the MCP run and returns runId for all subsequent phases.
  // ========================================================================

  const { designResult, runId } = await designGate({ feature, codebasePath, project }, ctx);

  // ========================================================================
  // PHASE 2: PLANNING GATE (superpowers:writing-plans)
  // ========================================================================

  const { planResult } = await planningGate({ feature, designResult, runId }, ctx);

  // ========================================================================
  // PHASE 3: TDD IMPLEMENTATION LOOP
  //   (superpowers:subagent-driven-development + test-driven-development)
  // ========================================================================

  const { completedTasks } = await subagentTddLoop(planResult.tasks, runId, ctx);

  // ========================================================================
  // PHASE 4: VERIFICATION GATE (superpowers:verification-before-completion)
  // ========================================================================

  const { verificationResult } = await verificationGate({ feature, planResult, runId }, ctx);

  // ========================================================================
  // PHASE 5: DEBUGGING (conditional - superpowers:systematic-debugging)
  // ========================================================================

  if (!verificationResult.passed) {
    const MAX_REVERIFY_ATTEMPTS = 2;
    let currentVerification = verificationResult;

    for (let reverifyAttempt = 1; reverifyAttempt <= MAX_REVERIFY_ATTEMPTS; reverifyAttempt++) {
      log(`Phase 5: Debugging Phase (re-verify attempt ${reverifyAttempt}/${MAX_REVERIFY_ATTEMPTS})`);

      for (const failedReq of currentVerification.requirements.filter(r => r.verdict !== 'PASS')) {
        await debuggingPhase(ctx, `Requirement failed: ${failedReq.requirement}\nEvidence: ${failedReq.output}`, 1, runId);
      }

      const reVerification = await verificationGate({ feature, planResult, runId }, ctx);
      currentVerification = reVerification.verificationResult;

      if (currentVerification.passed) break;

      if (reverifyAttempt >= MAX_REVERIFY_ATTEMPTS) {
        const failingReqs = currentVerification.requirements
          .filter(r => r.verdict !== 'PASS')
          .map(r => `  - ${r.requirement}`);
        await ctx.breakpoint({
          question: [
            `Re-verification still has failures after ${MAX_REVERIFY_ATTEMPTS} debug/re-verify cycles.`,
            '',
            'Failing requirements:',
            ...failingReqs,
            '',
            'Resolve this breakpoint to continue to the finishing gate (which will run its own test/debug cycle).',
            'To abort, leave the breakpoint unresolved and cancel the run.'
          ].join('\n'),
          title: 'Re-verification Failures',
          context: { runId }
        });
      }
    }
  }

  // ========================================================================
  // PHASE 6: FINISHING GATE (superpowers:finishing-a-development-branch)
  // ========================================================================

  await finishingGate({ runId }, ctx);

  // Ensure MCP run is marked complete (fallback if finishing gate agent didn't do it)
  if (runId) {
    await ctx.task({
      name: 'mcp-run-closer',
      instructions: [`Call complete_run(run_id=${runId}, status="completed", outcome="Workflow finished")`],
      outputFormat: 'Confirm complete_run was called',
      outputSchema: { type: 'object', properties: { completed: { type: 'boolean' } } }
    });
  }

  return {
    success: true,
    feature,
    tasksCompleted: completedTasks.length,
    completedTasks,
    runId,
    artifacts: {
      design: 'artifacts/design.md',
      plan: 'artifacts/plan.md',
      verification: 'artifacts/verification-report.md'
    }
  };
}
