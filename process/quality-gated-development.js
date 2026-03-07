/**
 * @process superbabysitter/quality-gated-development
 * @description Full development workflow with superpowers quality gates at every phase. Composes all 6 phases: design -> planning -> TDD loop -> verification -> (conditional debugging) -> finishing.
 * @inputs { feature: string, codebasePath: string, targetQuality: number }
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
  const { feature, codebasePath = '.', targetQuality = 85 } = inputs;

  // ========================================================================
  // PHASE 1: DESIGN GATE (superpowers:brainstorming)
  // ========================================================================

  const { designResult } = await designGate({ feature, codebasePath }, ctx);

  // ========================================================================
  // PHASE 2: PLANNING GATE (superpowers:writing-plans)
  // ========================================================================

  const { planResult } = await planningGate({ feature, designResult }, ctx);

  // ========================================================================
  // PHASE 3: TDD IMPLEMENTATION LOOP
  //   (superpowers:subagent-driven-development + test-driven-development)
  // ========================================================================

  const { completedTasks } = await subagentTddLoop(planResult.tasks, ctx);

  // ========================================================================
  // PHASE 4: VERIFICATION GATE (superpowers:verification-before-completion)
  // ========================================================================

  const { verificationResult } = await verificationGate({ feature, planResult }, ctx);

  // ========================================================================
  // PHASE 5: DEBUGGING (conditional - superpowers:systematic-debugging)
  // ========================================================================

  if (!verificationResult.passed) {
    ctx.log('Phase 5: Debugging Phase (verification failed)');

    for (const failedReq of verificationResult.requirements.filter(r => r.verdict !== 'PASS')) {
      await debuggingPhase(ctx, `Requirement failed: ${failedReq.requirement}\nEvidence: ${failedReq.output}`);
    }

    // Re-verify after fixes - route through full verification gate with breakpoint
    const reVerification = await verificationGate({ feature, planResult }, ctx);
    if (!reVerification.verificationResult.passed) {
      ctx.log('Re-verification still has failures. Finishing gate will handle remaining issues via test/debug cycle.');
    }
  }

  // ========================================================================
  // PHASE 6: FINISHING GATE (superpowers:finishing-a-development-branch)
  // ========================================================================

  await finishingGate({}, ctx);

  return {
    success: true,
    feature,
    tasksCompleted: completedTasks.length,
    completedTasks,
    artifacts: {
      design: 'artifacts/design.md',
      plan: 'artifacts/plan.md',
      verification: 'artifacts/verification-report.md'
    }
  };
}
