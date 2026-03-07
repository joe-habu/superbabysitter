/**
 * @process superbabysitter/subagent-tdd-loop
 * @description Phase 3: Subagent TDD Implementation Loop - merges babysitter orchestration with superpowers subagent-driven-development pattern. Each task gets scene-setting context, dedicated fixer subagents, and enhanced reviewer prompts that distrust implementer reports.
 * @inputs { tasks: Array<{name, fullText, context}> }
 * @outputs { completedTasks: Array<{name, specAttempts, qualityAttempts}>, manifest }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { createEmptyManifest, addTaskToManifest, writeManifestMarkdown, condensedManifestForPrompt } from './build-manifest.js';

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
  'CONTEXT: buildManifest shows what prior tasks built. Verify this task is consistent with established patterns.',
  'Report: PASS or FAIL with specific issues and file:line references for each issue found.'
];

const qualityReviewerInstructions = [
  'IRON LAW: Do NOT trust the implementer report. Read actual code.',
  'CONTEXT: buildManifest shows established patterns and architectural decisions. Flag inconsistencies with prior decisions.',
  'Review: code cleanliness, naming accuracy (names match what things do, not how they work), maintainability, test quality (tests verify behavior, not mock behavior).',
  'Classify issues by severity: Critical (breaks correctness, security, or architecture), Important (significant quality concern), Minor (style, preference).',
  'Only FAIL for Critical or Important issues. Minor issues should be noted but not block progress.',
  'Report: PASS or FAIL with issues categorized by severity, plus strengths observed.'
];

// === HELPER FUNCTIONS ===

function buildSceneContext(task, taskIndex, allTasks, manifest) {
  const lines = [];
  const taskNumber = taskIndex + 1;
  const totalTasks = allTasks.length;

  lines.push(`## Position in Plan`);
  lines.push(`You are implementing Task ${taskNumber} of ${totalTasks}: "${task.name}"`);
  lines.push('');

  // Completed tasks
  if (taskIndex > 0) {
    lines.push('## Completed Tasks');
    for (let i = 0; i < taskIndex; i++) {
      const completed = manifest.tasks[i];
      if (completed) {
        lines.push(`- Task ${i + 1}: ${completed.name} (files: ${(completed.filesChanged || []).join(', ') || 'none'})`);
        if (completed.architecturalDecisions && completed.architecturalDecisions.length > 0) {
          for (const decision of completed.architecturalDecisions) {
            lines.push(`  - Decision: ${decision}`);
          }
        }
      }
    }
    lines.push('');
  }

  // Upcoming tasks
  if (taskIndex < totalTasks - 1) {
    lines.push('## Upcoming Tasks (do NOT implement their work)');
    for (let i = taskIndex + 1; i < totalTasks; i++) {
      lines.push(`- Task ${i + 1}: ${allTasks[i].name}`);
    }
    lines.push('');
  }

  // Architectural decisions from manifest
  const allDecisions = manifest.tasks.flatMap(t => t.architecturalDecisions || []);
  if (allDecisions.length > 0) {
    lines.push('## Established Architectural Decisions');
    lines.push('Follow these decisions made by prior tasks:');
    for (const decision of allDecisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  // Task-specific context from the plan
  if (task.context) {
    lines.push('## Task-Specific Context');
    lines.push(task.context);
    lines.push('');
  }

  return lines.join('\n');
}

function extractDependencies(task, manifest) {
  if (manifest.tasks.length === 0) return null;
  return manifest.tasks.map(t => ({
    name: t.name,
    filesChanged: t.filesChanged || [],
    summary: t.summary || '',
    architecturalDecisions: t.architecturalDecisions || []
  }));
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
        ...(args.dependencies ? { dependencies: args.dependencies } : {}),
        ...(args.buildManifest ? { buildManifest: args.buildManifest } : {})
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
        reviewType: args.reviewType,
        ...(args.buildManifest ? { buildManifest: args.buildManifest } : {})
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
        implementerReport: args.implementerReport,
        ...(args.buildManifest ? { buildManifest: args.buildManifest } : {})
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
        implementerReport: args.implementerReport,
        ...(args.buildManifest ? { buildManifest: args.buildManifest } : {})
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

export async function subagentTddLoop(tasks, ctx) {
  ctx.log('Phase 3: Subagent TDD Implementation Loop');

  const completedTasks = [];
  const manifest = createEmptyManifest();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    ctx.log(`Task ${i + 1}/${tasks.length}: ${task.name}`);

    // Build rich scene context for this task
    const sceneContext = buildSceneContext(task, i, tasks, manifest);
    const dependencies = extractDependencies(task, manifest);
    const condensedManifest = condensedManifestForPrompt(manifest);

    // 3a: TDD Implementation with scene-setting context
    let implResult = await ctx.task(subagentImplementerTask, {
      taskNumber: i + 1,
      taskName: task.name,
      taskDescription: task.fullText,
      sceneContext,
      dependencies,
      buildManifest: condensedManifest,
      instructions: implementerInstructions
    });

    // 3b: Spec Compliance Review (MUST come first)
    let specPassed = false;
    let specAttempts = 0;
    while (!specPassed && specAttempts < 3) {
      specAttempts++;
      const specReview = await ctx.task(subagentSpecReviewerTask, {
        taskName: task.name,
        specification: task.fullText,
        implementerReport: implResult,
        buildManifest: condensedManifest,
        instructions: specReviewerInstructions
      });

      if (specReview.passed) {
        specPassed = true;
      } else if (specAttempts >= 3) {
        await ctx.breakpoint({
          question: [
            `Spec compliance review failed 3 times for Task ${i + 1}: ${task.name}`,
            '',
            'Latest issues:',
            ...specReview.issues.map(issue => `  - ${issue}`),
            '',
            'Resolve this breakpoint to accept the current state and continue.',
            'To abort, leave the breakpoint unresolved and cancel the run.'
          ].join('\n'),
          title: 'Spec Review Escalation',
          context: { runId: ctx.runId }
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
          buildManifest: condensedManifest,
          instructions: fixerInstructions('spec compliance')
        });
      }
    }

    // 3c: Code Quality Review (ONLY after spec passes)
    let qualityPassed = false;
    let qualityAttempts = 0;
    while (!qualityPassed && qualityAttempts < 3) {
      qualityAttempts++;
      const qualityReview = await ctx.task(subagentQualityReviewerTask, {
        taskName: task.name,
        specification: task.fullText,
        implementerReport: implResult,
        buildManifest: condensedManifest,
        instructions: qualityReviewerInstructions
      });

      if (qualityReview.passed) {
        qualityPassed = true;
      } else if (qualityAttempts >= 3) {
        await ctx.breakpoint({
          question: [
            `Code quality review failed 3 times for Task ${i + 1}: ${task.name}`,
            '',
            'Latest issues:',
            ...qualityReview.issues.map(issue => `  - ${issue}`),
            '',
            'Resolve this breakpoint to accept the current quality and continue.',
            'To abort, leave the breakpoint unresolved and cancel the run.'
          ].join('\n'),
          title: 'Quality Review Escalation',
          context: { runId: ctx.runId }
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
          buildManifest: condensedManifest,
          instructions: fixerInstructions('code quality')
        });
      }
    }

    // Accumulate manifest
    const taskEntry = {
      taskNumber: i + 1,
      name: task.name,
      filesChanged: implResult.filesChanged || [],
      architecturalDecisions: implResult.architecturalDecisions || [],
      dependsOn: implResult.dependsOn || [],
      summary: implResult.summary || '',
      concerns: implResult.concerns || []
    };
    addTaskToManifest(manifest, taskEntry);
    writeManifestMarkdown(manifest, 'artifacts/build-manifest.md');

    completedTasks.push({ name: task.name, specAttempts, qualityAttempts });
    ctx.log(`Completed Task ${i + 1}/${tasks.length}: ${task.name}`);
  }

  return { completedTasks, manifest };
}
