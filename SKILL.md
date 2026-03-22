---
name: superbabysitter
description: Use when orchestrating multi-step development workflows via babysitter that need superpowers quality gates - enforces design-before-code, TDD, two-stage review, and verification-before-completion within babysitter process files. Modular phases can be composed individually.
---

# Superbabysitter

## Overview

**Babysitter controls the flow. Superpowers controls the quality. Modular files enable composition.**

Quality-gated development workflow with each phase as a standalone ES module. Use the full orchestrator for end-to-end development, or import individual phases into custom processes.

**Announce at start:** "I'm using the superbabysitter skill to build a quality-gated orchestration process with composable phases."

## Setup

The skill directory requires a one-time `npm install` to provide ESM scope and the babysitter SDK:

```bash
cd ~/.claude/skills/superbabysitter && npm install
```

This creates `package.json` (with `"type": "module"`) and `node_modules/` so that:
1. Node treats `.js` files as ES modules (enabling `import/export` syntax)
2. `@a5c-ai/babysitter-sdk` resolves from the skill's own `node_modules/`

Without this, files imported from outside `.a5c/` will fail with ERR_REQUIRE_ESM or MODULE_NOT_FOUND.

## Process Files

### Entry Point

| File | Exports | Purpose |
|------|---------|---------|
| `process/quality-gated-development.js` | `process()`, all phase functions, all task definitions | Main orchestrator - use with `babysitter run:create --entry` |

### Individual Phases

| File | Phase | Exports | Iron Law |
|------|-------|---------|----------|
| `process/design-gate.js` | 1 | `designGate()`, `contextExplorerTask`, `designProposalTask` | No implementation without approved design |
| `process/planning-gate.js` | 2 | `planningGate()`, `planWriterTask`, `planVerifierTask` | No code without bite-sized TDD plan |
| `process/subagent-tdd-loop.js` | 3 | `subagentTddLoop()`, `subagentImplementerTask`, `subagentFixerTask`, `subagentSpecReviewerTask`, `subagentQualityReviewerTask` | No production code without failing test first; Do not trust reports; Spec before quality |
| `process/parallel-task-helpers.js` | shared | `hasParallelCapableTasks()`, `validateDependencies()`, `buildParallelBatches()` | Dependency-aware parallel task batching for Phase 3 |
| `process/mcp-state-helpers.js` | shared | `mcpStateInstructions()`, `mcpImplementerInstructions()`, `mcpReviewerInstructions()`, `mcpTddFixerInstructions()`, `mcpFixInstructions()`, `mcpDebuggingInstructions()` | MCP instruction generators for agent prompts |
| `process/verification-gate.js` | 4 | `verificationGate()`, `verificationTask` | No completion claims without fresh verification evidence |
| `process/debugging-phase.js` | 5 | `debuggingPhase(ctx, issue, attempt?)`, `rootCauseInvestigationTask`, `patternAnalysisTask`, `hypothesisTestingTask` | No fixes without root cause investigation first; Max 3 debug attempts before escalation |
| `process/finishing-gate.js` | 6 | `finishingGate(inputs, ctx, attempt?)`, `testRunnerTask` | Verify tests pass before presenting finish options; Max 3 test/debug cycles before escalation |

### Dependencies Between Phases

- `debugging-phase.js` imports `subagentImplementerTask` from `subagent-tdd-loop.js` (for TDD fix after root cause confirmed)
- `finishing-gate.js` imports `debuggingPhase` from `debugging-phase.js` (for auto-debugging when tests fail)
- `quality-gated-development.js` imports all 6 phases

### State Management (MCP)

Workflow state is managed by the `superbabysitter-state` MCP plugin. Agents are active participants in state management -- they query prior decisions and record results via MCP tools. This replaces the previous in-memory build manifest approach, solving context loss between phases and enabling cross-session persistence.

Agents use `get_run_summary()` and `search_results()` before starting work, and `record_result()` after completing work. The `mcp-state-helpers.js` module generates the MCP instructions injected into each agent's prompt.

## Usage

### Full Orchestration

```bash
babysitter run:create --entry process/quality-gated-development.js
```

### Importing Individual Phases into Custom Processes

```javascript
import { designGate } from './design-gate.js';
import { planningGate } from './planning-gate.js';
import { subagentTddLoop } from './subagent-tdd-loop.js';

export async function process(inputs, ctx) {
  // Use only the phases you need
  const { designResult, runId } = await designGate({ feature: inputs.feature, codebasePath: '.' }, ctx);
  const { planResult } = await planningGate({ feature: inputs.feature, designResult, runId }, ctx);
  const { completedTasks } = await subagentTddLoop(planResult.tasks, runId, ctx);

  return { success: true, tasksCompleted: completedTasks.length, runId };
}
```

### Using Task Definitions Directly

```javascript
import { subagentImplementerTask, subagentSpecReviewerTask } from './subagent-tdd-loop.js';
import { verificationTask } from './verification-gate.js';

// Use individual task definitions in your own orchestration logic
const result = await ctx.task(subagentImplementerTask, {
  taskNumber: 1,
  taskName: 'My custom task',
  taskDescription: 'Full task description here',
  sceneContext: 'Where this fits',
  instructions: ['IRON LAW: No production code without a failing test first.', ...]
});
```

## Iron Laws

These are non-negotiable. Every process built with this skill must enforce all of them structurally via babysitter tasks and breakpoints.

| Iron Law | Source | Enforcement |
|----------|--------|-------------|
| No implementation without approved design | `superpowers:brainstorming` | Design Gate breakpoint blocks Phase 2+ |
| No code without bite-sized TDD plan | `superpowers:writing-plans` | Planning Gate breakpoint blocks Phase 3+ |
| No production code without failing test first | `superpowers:test-driven-development` | Implementer agent prompt instruction |
| Do not trust reports - read actual code | `superpowers:subagent-driven-development` | Spec reviewer agent prompt instruction |
| Spec compliance before code quality review | `superpowers:subagent-driven-development` | Sequential task ordering in process JS |
| No completion claims without fresh verification evidence | `superpowers:verification-before-completion` | Verification Gate agent runs commands, reads output |
| No fixes without root cause investigation first | `superpowers:systematic-debugging` | Debugging phase enforces 4-phase investigation |
| Verify tests pass before presenting finish options | `superpowers:finishing-a-development-branch` | Finishing Gate runs tests before breakpoint |
| Parallel tasks must not modify overlapping files | `parallel-task-helpers.js` | Dependency validation + plan verifier checks + scene context warnings |
| Max 3 retry attempts before human escalation | All retry loops | Escalation breakpoints in spec review, quality review, debugging, and finishing phases |

## Quality Gate Definitions

| Gate | Phase | Type | Blocks | Enforcement |
|------|-------|------|--------|-------------|
| Design Approval | 1 | Breakpoint | Phases 2-6 | Human reviews design doc, approves or requests changes |
| Plan Approval | 2 | Breakpoint | Phases 3-6 | Human reviews plan + verification report, approves |
| Spec Compliance | 3 (per task) | Agent review | Code quality review | Reviewer reads actual code, compares to spec line-by-line |
| Spec Escalation | 3 (per task) | Breakpoint | Continuation | After 3 failed spec reviews, escalates to human with issues list |
| Code Quality | 3 (per task) | Agent review | Next task | Reviewer checks quality after spec compliance passes |
| Quality Escalation | 3 (per task) | Breakpoint | Continuation | After 3 failed quality reviews, escalates to human with issues list |
| Verification Evidence | 4 | Agent + Breakpoint | Phase 6 | Agent runs commands, records output; human reviews evidence |
| Debugging Escalation | 5 | Breakpoint | Continuation | After 3 failed hypothesis cycles, escalates to human with last hypothesis |
| Test Verification | 6 | Agent | Finish options | Agent runs full suite, reports exact counts; must be 0 failures |
| Finishing Escalation | 6 | Breakpoint | Completion | After 3 failed test/debug cycles, escalates to human with failure details |
| Finish Decision | 6 | Breakpoint | Completion | Human chooses from exactly 4 options |

## Parallel Task Execution

Phase 3 supports dependency-aware parallel task batching. When the plan writer includes `dependsOn` arrays on tasks, the TDD loop groups independent tasks into batches that execute concurrently via `ctx.parallel.map()`.

**How it works:**
1. Plan writer declares `dependsOn: [taskNumbers]` for each task (1-based)
2. `validateDependencies()` checks for valid refs, self-references, and cycles (Kahn's algorithm)
3. `buildParallelBatches()` groups tasks by topological level with maxBatchSize cap (default 5)
4. Each batch executes via `ctx.parallel.map()` — tasks in a batch share a frozen manifest snapshot
5. Results merge in taskNumber order after each batch completes

**Backward compatibility:**
- Tasks without `dependsOn` fields trigger sequential execution (identical to original)
- Invalid dependencies show a breakpoint warning and fall back to sequential
- Single-task batches skip parallel overhead

**Scene context in parallel mode:**
- Shows "Running Concurrently" peers with file-conflict warning instead of "Upcoming Tasks"
- Shows "Upcoming Batches" with batch numbers for future work

## Critical Rules

**From babysitter:**
- The completion secret is emitted only when the run is completed. Do NOT output `<promise>SECRET</promise>` until the run is genuinely done.
- Never approve breakpoints yourself. They are for human approval only.
- Never write `result.json` directly. Write to `output.json`, then post via `task:post`.
- Do not use the babysit skill inside delegated tasks.
- Never build wrapper scripts to orchestrate runs. Use the CLI.

**From superpowers:**
- No implementation without approved design (Phase 1 breakpoint).
- No code without bite-sized TDD plan (Phase 2 breakpoint).
- No production code without failing test first (implementer prompt instruction).
- Do not trust reports - read actual code (reviewer prompt instruction).
- Spec compliance review before code quality review (sequential ordering).
- No completion claims without fresh verification evidence (Phase 4 gate).
- No fixes without root cause investigation (Phase 5 prerequisite).
- Verify tests pass before presenting finish options (Phase 6 prerequisite).

**Combined:**
- Every superpowers hard gate becomes a babysitter breakpoint.
- Two-stage review is enforced by sequential task ordering (spec reviewer task must complete before code quality reviewer task begins).
- Iron laws are embedded as the first instruction in every agent prompt.
- Fix-and-re-review loops have a max of 3 attempts before escalating to human via breakpoint (enforced in all 4 retry locations: spec review, quality review, debugging, finishing).
- Recursive phases (`debuggingPhase`, `finishingGate`) accept an `attempt` parameter with bounded recursion depth.

## Red Flags

Stop and reassess if you catch yourself:

| Thought | Reality |
|---------|---------|
| "Skip the design gate, requirements are clear" | Design gate applies to EVERY project |
| "Skip spec review, implementation looks right" | Spec review catches 40%+ of issues |
| "Run quality review before spec review" | Wrong order. Spec first, always. |
| "Tests should pass" | Run them. Read the output. Then claim. |
| "Just try this fix" | Investigate root cause first |
| "One more fix attempt" (after 2+ failures) | Question the architecture |
| "Trust the agent report" | Verify independently |
| "This is too simple for all six phases" | Use fewer phases, but never skip the ones you use |
| "Approve the breakpoint myself to save time" | Breakpoints are for humans only |

## Integration

**Required skills (referenced, not duplicated):**

| Skill | Used By | Purpose |
|-------|---------|---------|
| `superpowers:brainstorming` | Phase 1 | Design exploration methodology |
| `superpowers:writing-plans` | Phase 2 | Plan structure and bite-sized task format |
| `superpowers:test-driven-development` | Phase 3 | RED-GREEN-REFACTOR cycle enforcement |
| `superpowers:subagent-driven-development` | Phase 3 | Two-stage review pattern and prompt templates |
| `superpowers:verification-before-completion` | Phase 4 | Evidence-before-claims gate function |
| `superpowers:systematic-debugging` | Phase 5 | 4-phase root cause investigation |
| `superpowers:finishing-a-development-branch` | Phase 6 | 4-option completion workflow |

**Prompt templates (from `superpowers:subagent-driven-development`):**
- `implementer-prompt.md` - Implementer dispatch template
- `spec-reviewer-prompt.md` - Spec compliance reviewer template
- `code-quality-reviewer-prompt.md` - Code quality reviewer template

**Babysitter infrastructure:**
- `babysit` skill - Process creation, CLI orchestration loop, in-session loop mechanism
- `@a5c-ai/babysitter-sdk` - `defineTask`, `ctx.task`, `ctx.breakpoint`, `ctx.parallel.all`
