# Superbabysitter

Quality-gated development workflow skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) + [babysitter SDK](https://www.npmjs.com/package/@a5c-ai/babysitter-sdk).

**Babysitter controls the flow. Superpowers controls the quality. Modular files enable composition.**

## What It Does

Superbabysitter orchestrates a 6-phase development workflow where every phase is enforced by a quality gate. Each gate is a babysitter breakpoint requiring human approval before proceeding. The phases are modular ES modules that can be composed individually or used as a full pipeline.

```
Design Gate ──> Planning Gate ──> TDD Loop ──> Verification Gate ──> Debugging Phase ──> Finishing Gate
   (1)             (2)             (3)              (4)                  (5)                (6)
```

## Prerequisites

### Babysitter

Install the [babysitter plugin](https://www.npmjs.com/package/@anthropic-ai/claude-code-babysitter) for Claude Code:

```bash
claude plugins:install @anthropic-ai/claude-code-babysitter
```

### Superpowers Skills

The following 7 [superpowers](https://github.com/anthropics/superpowers) skills must be installed. These provide the methodology that superbabysitter enforces structurally:

| Skill | Used By | Purpose |
|-------|---------|---------|
| `superpowers:brainstorming` | Phase 1 | Design exploration methodology |
| `superpowers:writing-plans` | Phase 2 | Plan structure and bite-sized task format |
| `superpowers:test-driven-development` | Phase 3 | RED-GREEN-REFACTOR cycle enforcement |
| `superpowers:subagent-driven-development` | Phase 3 | Two-stage review pattern and prompt templates |
| `superpowers:verification-before-completion` | Phase 4 | Evidence-before-claims gate function |
| `superpowers:systematic-debugging` | Phase 5 | 4-phase root cause investigation |
| `superpowers:finishing-a-development-branch` | Phase 6 | 4-option completion workflow |

## Installation

```bash
cd ~/.claude/skills
git clone https://github.com/joe-habu/superbabysitter.git
cd superbabysitter
npm install
```

## Architecture

### Process Files

| File | Phase | Exports | Iron Law |
|------|-------|---------|----------|
| `process/design-gate.js` | 1 | `designGate()`, `contextExplorerTask`, `designProposalTask` | No implementation without approved design |
| `process/planning-gate.js` | 2 | `planningGate()`, `planWriterTask`, `planVerifierTask` | No code without bite-sized TDD plan |
| `process/tdd-implementation-loop.js` | 3 | `tddImplementationLoop()`, `tddImplementerTask`, `specComplianceReviewerTask`, `codeQualityReviewerTask` | No production code without failing test first |
| `process/verification-gate.js` | 4 | `verificationGate()`, `verificationTask` | No completion claims without fresh verification evidence |
| `process/debugging-phase.js` | 5 | `debuggingPhase()`, `rootCauseInvestigationTask`, `patternAnalysisTask`, `hypothesisTestingTask` | No fixes without root cause investigation first |
| `process/finishing-gate.js` | 6 | `finishingGate()`, `testRunnerTask` | Verify tests pass before presenting finish options |

### Entry Point

`process/quality-gated-development.js` - Main orchestrator that chains all 6 phases. Use with `babysitter run:create --entry`.

### Dependencies Between Phases

- `debugging-phase.js` imports `tddImplementerTask` from `tdd-implementation-loop.js`
- `finishing-gate.js` imports `debuggingPhase` from `debugging-phase.js`
- `quality-gated-development.js` imports all 6 phases

### Build Manifest (Context Propagation)

The TDD loop maintains a cumulative build manifest that grows after each task, tracking files changed, architectural decisions, inter-task dependencies, and open concerns. Written to `artifacts/build-manifest.md` for crash resilience.

## Usage

### Full Orchestration

```bash
babysitter run:create --entry process/quality-gated-development.js
```

### Importing Individual Phases

```javascript
import { designGate } from './design-gate.js';
import { planningGate } from './planning-gate.js';
import { tddImplementationLoop } from './tdd-implementation-loop.js';

export async function process(inputs, ctx) {
  const { designResult } = await designGate({ feature: inputs.feature, codebasePath: '.' }, ctx);
  const { planResult } = await planningGate({ feature: inputs.feature, designResult }, ctx);
  const { completedTasks } = await tddImplementationLoop(planResult.tasks, ctx);

  return { success: true, tasksCompleted: completedTasks.length };
}
```

### Using Task Definitions Directly

```javascript
import { tddImplementerTask, specComplianceReviewerTask } from './tdd-implementation-loop.js';
import { verificationTask } from './verification-gate.js';

const result = await ctx.task(tddImplementerTask, {
  taskNumber: 1,
  taskName: 'My custom task',
  taskDescription: 'Full task description here',
  sceneContext: 'Where this fits',
  instructions: ['IRON LAW: No production code without a failing test first.']
});
```

## Iron Laws

These are non-negotiable. Every process built with this skill must enforce all of them structurally.

| Iron Law | Enforcement |
|----------|-------------|
| No implementation without approved design | Design Gate breakpoint blocks Phase 2+ |
| No code without bite-sized TDD plan | Planning Gate breakpoint blocks Phase 3+ |
| No production code without failing test first | Implementer agent prompt instruction |
| Do not trust reports - read actual code | Spec reviewer agent prompt instruction |
| Spec compliance before code quality review | Sequential task ordering in process JS |
| No completion claims without fresh verification evidence | Verification Gate agent runs commands, reads output |
| No fixes without root cause investigation first | Debugging phase enforces 4-phase investigation |
| Verify tests pass before presenting finish options | Finishing Gate runs tests before breakpoint |
| Max 3 retry attempts before human escalation | Escalation breakpoints in all retry locations |

## Quality Gates

| Gate | Phase | Type | Blocks |
|------|-------|------|--------|
| Design Approval | 1 | Breakpoint | Phases 2-6 |
| Plan Approval | 2 | Breakpoint | Phases 3-6 |
| Spec Compliance | 3 (per task) | Agent review | Code quality review |
| Spec Escalation | 3 (per task) | Breakpoint | Continuation (after 3 failures) |
| Code Quality | 3 (per task) | Agent review | Next task |
| Quality Escalation | 3 (per task) | Breakpoint | Continuation (after 3 failures) |
| Verification Evidence | 4 | Agent + Breakpoint | Phase 6 |
| Debugging Escalation | 5 | Breakpoint | Continuation (after 3 attempts) |
| Test Verification | 6 | Agent | Finish options |
| Finishing Escalation | 6 | Breakpoint | Completion (after 3 cycles) |
| Finish Decision | 6 | Breakpoint | Completion (4 options) |

## License

MIT
