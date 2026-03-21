/**
 * @process superbabysitter/subagent-tdd-loop
 * @description Phase 3: Subagent TDD Implementation Loop - merges babysitter orchestration with superpowers subagent-driven-development pattern. Each task gets scene-setting context, dedicated fixer subagents, and enhanced reviewer prompts that distrust implementer reports.
 * @inputs { tasks: Array<{name, fullText, context}> }
 * @outputs { completedTasks: Array<{name, specAttempts, qualityAttempts}> }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { mcpImplementerInstructions, mcpReviewerInstructions, mcpTddFixerInstructions } from './mcp-state-helpers.js';

// === INSTRUCTION CONSTANTS ===

const implementerInstructions = [
  'IRON LAW: No production code without a failing test first.',
  'CONTEXT: Read the scene context carefully. It tells you where this task fits in the plan, what prior tasks built, and what comes next. Follow established architectural decisions. Do NOT implement work belonging to other tasks.',
  'BEFORE YOU BEGIN: If you have questions about requirements, approach, dependencies, or assumptions - ask them now. It is always OK to pause and clarify. Do not guess or make assumptions.',
  'RED: Write a failing test first. Run it. Verify it FAILS.',
  'GREEN: Write MINIMAL code to pass. Run it. Verify it PASSES.',
  'REFACTOR: Clean up while staying green.',
  'SELF-REVIEW: Before reporting, review your work with fresh eyes. Check completeness (did you implement everything in spec?), quality (clean, maintainable, good names?), discipline (no overbuilding, followed existing patterns?), and testing (tests verify behavior, not mock behavior?).',
  'If you find issues during self-review, fix them now before reporting.',
  'Commit your work.',
  'REPORT: What you implemented, test results, files changed, self-review findings, concerns, architecturalDecisions, dependsOn.'
];

function fixerInstructions(reviewType) {
  return [
    `IRON LAW: No production code without a failing test first.`,
    `You are fixing issues found by the ${reviewType} reviewer. Fix ONLY the listed issues. Do not refactor unrelated code. Do not add features.`,
    'For any new code required by the fix, follow TDD: write failing test, make it pass, clean up.',
    'SELF-REVIEW: After fixing, verify each listed issue is resolved. Read the actual code to confirm.',
    'Commit your fixes.',
    'REPORT: What you fixed, test results, files changed, any remaining concerns.'
  ];
}

const specReviewerInstructions = [
  'IRON LAW: Do NOT trust the implementer report. Read actual code.',
  'The implementer finished suspiciously quickly. Their report may be incomplete, inaccurate, or optimistic. You MUST verify everything independently.',
  'DO NOT: Take their word for what they implemented. Trust their claims about completeness. Accept their interpretation of requirements.',
  'DO: Read the actual code they wrote. Compare actual implementation to requirements line by line. Check for missing pieces they claimed to implement. Look for extra features they did not mention.',
  'Check for MISSING requirements: Did they implement everything requested? Are there requirements they skipped?',
  'Check for EXTRA work: Did they build things not requested? Did they over-engineer?',
  'Check for MISUNDERSTANDINGS: Did they interpret requirements differently than intended? Did they solve the wrong problem?',
  'CONTEXT: You MUST call search_results(result_type="implementation") and search_results(result_type="decision"), then call get_results(ids=[...]) to fetch full details. This tells you what prior tasks built and what patterns to follow. Skipping this means you will miss context and make incorrect judgments.',
  'Report: PASS or FAIL with specific issues and file:line references for each issue found.'
];

const qualityReviewerInstructions = [
  'IRON LAW: Do NOT trust the implementer report. Read actual code.',
  'CONTEXT: You MUST call search_results(result_type="decision"), then call get_results(ids=[...]) to fetch full architectural decisions with rationale. Skipping this means you will miss established patterns and make incorrect quality judgments.',
  'Review: code cleanliness, naming accuracy (names match what things do, not how they work), maintainability, test quality (tests verify behavior, not mock behavior).',
  'Classify issues by severity: Critical (breaks correctness, security, or architecture), Important (significant quality concern), Minor (style, preference).',
  'Only FAIL for Critical or Important issues. Minor issues should be noted but not block progress.',
  'Report: PASS or FAIL with issues categorized by severity, plus strengths observed.'
];

// === HELPER FUNCTIONS ===
// buildMinimalSceneContext provides position/upcoming task context.
// MCP state handles prior task context -- agents call get_run_summary() and search_results().

function buildMinimalSceneContext(task, taskIndex, allTasks) {
  const lines = [];
  const taskNumber = taskIndex + 1;
  const totalTasks = allTasks.length;

  lines.push(`## Position in Plan`);
  lines.push(`You are implementing Task ${taskNumber} of ${totalTasks}: "${task.name}"`);
  lines.push('');

  // Upcoming tasks (static - doesn't need MCP)
  if (taskIndex < totalTasks - 1) {
    lines.push('## Upcoming Tasks (do NOT implement their work)');
    for (let i = taskIndex + 1; i < totalTasks; i++) {
      lines.push(`- Task ${i + 1}: ${allTasks[i].name}`);
    }
    lines.push('');
  }

  // Task-specific context from the plan
  if (task.context) {
    lines.push('## Task-Specific Context');
    lines.push(task.context);
    lines.push('');
  }

  lines.push('## Prior Tasks and Decisions');
  lines.push('Query MCP state tools to see completed tasks and architectural decisions.');
  lines.push('');

  return lines.join('\n');
}

// === TASK DEFINITIONS ===

export const subagentImplementerTask = defineTask('subagent-implementer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement Task ${args.taskNumber}: ${args.taskName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior software engineer following strict TDD who asks questions before coding',
      task: `Implement Task ${args.taskNumber}: ${args.taskName}`,
      context: {
        taskDescription: args.taskDescription,
        sceneContext: args.sceneContext,
        ...(args.dependencies ? { dependencies: args.dependencies } : {})
      },
      instructions: args.instructions,
      outputFormat: 'JSON with filesChanged, testResults, summary, concerns, architecturalDecisions, dependsOn, selfReviewFindings'
    },
    outputSchema: {
      type: 'object',
      required: ['filesChanged', 'testResults', 'summary'],
      properties: {
        filesChanged: { type: 'array', items: { type: 'string' } },
        testResults: { type: 'string' },
        summary: { type: 'string' },
        concerns: { type: 'array', items: { type: 'string' } },
        architecturalDecisions: { type: 'array', items: { type: 'string' } },
        dependsOn: { type: 'array', items: { type: 'string' } },
        selfReviewFindings: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const subagentFixerTask = defineTask('subagent-fixer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Fix ${args.reviewType} issues: ${args.taskName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior software engineer fixing specific review issues using TDD',
      task: `Fix ${args.reviewType} review issues for: ${args.taskName}`,
      context: {
        originalTaskDescription: args.originalTaskDescription,
        priorImplementation: args.priorImplementation,
        reviewIssues: args.reviewIssues,
        reviewType: args.reviewType
      },
      instructions: args.instructions,
      outputFormat: 'JSON with filesChanged, testResults, summary, concerns, architecturalDecisions, dependsOn, selfReviewFindings'
    },
    outputSchema: {
      type: 'object',
      required: ['filesChanged', 'testResults', 'summary'],
      properties: {
        filesChanged: { type: 'array', items: { type: 'string' } },
        testResults: { type: 'string' },
        summary: { type: 'string' },
        concerns: { type: 'array', items: { type: 'string' } },
        architecturalDecisions: { type: 'array', items: { type: 'string' } },
        dependsOn: { type: 'array', items: { type: 'string' } },
        selfReviewFindings: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const subagentSpecReviewerTask = defineTask('subagent-spec-reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Spec review: ${args.taskName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'spec compliance auditor who does not trust implementer reports',
      task: 'Verify implementation matches specification exactly - nothing more, nothing less',
      context: {
        specification: args.specification,
        implementerReport: args.implementerReport
      },
      instructions: args.instructions,
      outputFormat: 'JSON with passed (boolean), issues (array of strings), evidence (string)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'issues'],
      properties: {
        passed: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const subagentQualityReviewerTask = defineTask('subagent-quality-reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Quality review: ${args.taskName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior code reviewer focused on quality and architectural consistency',
      task: 'Review implementation for code quality, maintainability, and test quality',
      context: {
        specification: args.specification,
        implementerReport: args.implementerReport
      },
      instructions: args.instructions,
      outputFormat: 'JSON with passed (boolean), issues (array with severity), strengths (array)'
    },
    outputSchema: {
      type: 'object',
      required: ['passed', 'issues'],
      properties: {
        passed: { type: 'boolean' },
        issues: { type: 'array', items: { type: 'string' } },
        strengths: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

// === PHASE FUNCTION ===

export async function subagentTddLoop(tasks, runId, ctx) {
  const log = (ctx.log || (() => {})).bind(ctx);
  log('Phase 3: Subagent TDD Implementation Loop');

  const completedTasks = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const taskNumber = i + 1;
    log(`Task ${taskNumber}/${tasks.length}: ${task.name}`);

    // Build minimal scene context (position + upcoming tasks only)
    // Agents query MCP for completed tasks, decisions, and dependencies
    const sceneContext = buildMinimalSceneContext(task, i, tasks);
    const mcpImplInstructions = runId ? mcpImplementerInstructions(runId, taskNumber, task.name) : [];

    // 3a: TDD Implementation with MCP state access
    let implResult = await ctx.task(subagentImplementerTask, {
      taskNumber,
      taskName: task.name,
      taskDescription: task.fullText,
      sceneContext,
      instructions: [...implementerInstructions, ...mcpImplInstructions]
    });

    // 3b: Spec Compliance Review (MUST come first)
    const mcpSpecInstructions = runId ? mcpReviewerInstructions(runId, taskNumber, task.name, 'spec') : [];
    let specPassed = false;
    let specAttempts = 0;
    while (!specPassed && specAttempts < 3) {
      specAttempts++;
      const specReview = await ctx.task(subagentSpecReviewerTask, {
        taskName: task.name,
        specification: task.fullText,
        implementerReport: implResult,
        instructions: [...specReviewerInstructions, ...mcpSpecInstructions]
      });

      if (specReview.passed) {
        specPassed = true;
      } else if (specAttempts >= 3) {
        await ctx.breakpoint({
          question: [
            `Spec compliance review failed 3 times for Task ${taskNumber}: ${task.name}`,
            '',
            'Latest issues:',
            ...specReview.issues.map(issue => `  - ${issue}`),
            '',
            'Resolve this breakpoint to accept the current state and continue.',
            'To abort, leave the breakpoint unresolved and cancel the run.'
          ].join('\n'),
          title: 'Spec Review Escalation',
          context: { runId: runId || ctx.runId }
        });
        specPassed = true; // Human approved continuation
      } else {
        // Dedicated fixer subagent instead of reusing implementer
        implResult = await ctx.task(subagentFixerTask, {
          taskName: `${task.name} (spec fix #${specAttempts})`,
          originalTaskDescription: task.fullText,
          priorImplementation: implResult,
          reviewIssues: specReview.issues,
          reviewType: 'spec compliance',
          instructions: [...fixerInstructions('spec compliance'), ...(runId ? mcpTddFixerInstructions(runId, taskNumber, task.name, 'spec') : [])]
        });
      }
    }

    // 3c: Code Quality Review (ONLY after spec passes)
    const mcpQualityInstructions = runId ? mcpReviewerInstructions(runId, taskNumber, task.name, 'quality') : [];
    let qualityPassed = false;
    let qualityAttempts = 0;
    while (!qualityPassed && qualityAttempts < 3) {
      qualityAttempts++;
      const qualityReview = await ctx.task(subagentQualityReviewerTask, {
        taskName: task.name,
        specification: task.fullText,
        implementerReport: implResult,
        instructions: [...qualityReviewerInstructions, ...mcpQualityInstructions]
      });

      if (qualityReview.passed) {
        qualityPassed = true;
      } else if (qualityAttempts >= 3) {
        await ctx.breakpoint({
          question: [
            `Code quality review failed 3 times for Task ${taskNumber}: ${task.name}`,
            '',
            'Latest issues:',
            ...qualityReview.issues.map(issue => `  - ${issue}`),
            '',
            'Resolve this breakpoint to accept the current quality and continue.',
            'To abort, leave the breakpoint unresolved and cancel the run.'
          ].join('\n'),
          title: 'Quality Review Escalation',
          context: { runId: runId || ctx.runId }
        });
        qualityPassed = true; // Human approved continuation
      } else {
        // Dedicated fixer subagent instead of reusing implementer
        implResult = await ctx.task(subagentFixerTask, {
          taskName: `${task.name} (quality fix #${qualityAttempts})`,
          originalTaskDescription: task.fullText,
          priorImplementation: implResult,
          reviewIssues: qualityReview.issues,
          reviewType: 'code quality',
          instructions: [...fixerInstructions('code quality'), ...(runId ? mcpTddFixerInstructions(runId, taskNumber, task.name, 'quality') : [])]
        });
      }
    }

    // State is recorded by agents via MCP tools - no manifest accumulation needed

    completedTasks.push({ name: task.name, specAttempts, qualityAttempts });
    log(`Completed Task ${taskNumber}/${tasks.length}: ${task.name}`);
  }

  return { completedTasks };
}
