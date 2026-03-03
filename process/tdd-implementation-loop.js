/**
 * @process superbabysitter/tdd-implementation-loop
 * @description Phase 3: TDD Implementation Loop - for each task: implement with TDD, spec review, quality review, with fix-and-re-review loops
 * @inputs { tasks: Array<{name, fullText, context}> }
 * @outputs { completedTasks: Array<{name, specAttempts, qualityAttempts}> }
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// === BUILD MANIFEST ===

function createEmptyManifest() {
  return {
    tasks: [],
    allFilesChanged: [],
    openConcerns: []
  };
}

function addTaskToManifest(manifest, taskEntry) {
  manifest.tasks.push(taskEntry);

  const newFiles = (taskEntry.filesChanged || [])
    .filter(f => !manifest.allFilesChanged.includes(f));
  manifest.allFilesChanged.push(...newFiles);

  const newConcerns = (taskEntry.concerns || [])
    .filter(c => !manifest.openConcerns.includes(c));
  manifest.openConcerns.push(...newConcerns);
}

function writeManifestMarkdown(manifest, filePath) {
  const lines = ['# Build Manifest', ''];

  lines.push('## Completed Tasks', '');
  for (const t of manifest.tasks) {
    lines.push(`### Task ${t.taskNumber}: ${t.name}`);
    lines.push(`- **Files:** ${(t.filesChanged || []).join(', ') || '(none)'}`);
    lines.push(`- **Decisions:** ${(t.architecturalDecisions || []).join('; ') || '(none)'}`);
    lines.push(`- **Dependencies:** ${(t.dependsOn || []).join(', ') || '(none)'}`);
    lines.push(`- **Summary:** ${t.summary || '(none)'}`);
    lines.push('');
  }

  lines.push('## All Files Changed', '');
  for (const f of manifest.allFilesChanged) {
    lines.push(`- ${f}`);
  }
  lines.push('');

  lines.push('## Open Concerns', '');
  if (manifest.openConcerns.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of manifest.openConcerns) {
      lines.push(`- ${c}`);
    }
  }
  lines.push('');

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, lines.join('\n'));
}

function condensedManifestForPrompt(manifest) {
  if (manifest.tasks.length === 0) return null;
  return {
    completedTasks: manifest.tasks.map(t => ({
      name: t.name,
      filesChanged: t.filesChanged,
      architecturalDecisions: t.architecturalDecisions
    })),
    allFilesChanged: manifest.allFilesChanged,
    openConcerns: manifest.openConcerns
  };
}

// === TASK DEFINITIONS ===

export const tddImplementerTask = defineTask('tdd-implementer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Implement Task ${args.taskNumber}: ${args.taskName}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior software engineer following strict TDD',
      task: `Implement Task ${args.taskNumber}: ${args.taskName}`,
      context: {
        taskDescription: args.taskDescription,
        architecturalContext: args.sceneContext,
        ...(args.buildManifest ? { buildManifest: args.buildManifest } : {})
      },
      instructions: args.instructions,
      outputFormat: 'JSON with filesChanged, testResults, summary, concerns, architecturalDecisions, dependsOn'
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
        dependsOn: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  }
}));

export const specComplianceReviewerTask = defineTask('spec-compliance-reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Spec review: ${args.taskDescription.substring(0, 50)}...`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'spec compliance auditor who does not trust implementer reports',
      task: 'Verify implementation matches specification exactly - nothing more, nothing less',
      context: {
        specification: args.taskDescription,
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

export const codeQualityReviewerTask = defineTask('code-quality-reviewer', (args, taskCtx) => ({
  kind: 'agent',
  title: `Quality review: ${args.taskDescription.substring(0, 50)}...`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'senior code reviewer focused on quality, not spec compliance',
      task: 'Review implementation for code quality, maintainability, and test quality',
      context: {
        specification: args.taskDescription,
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

export async function tddImplementationLoop(tasks, ctx) {
  ctx.log('Phase 3: TDD Implementation Loop');

  const completedTasks = [];
  const manifest = createEmptyManifest();

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    ctx.log(`Task ${i + 1}/${tasks.length}: ${task.name}`);

    // 3a: TDD Implementation
    let implResult = await ctx.task(tddImplementerTask, {
      taskNumber: i + 1,
      taskName: task.name,
      taskDescription: task.fullText,
      sceneContext: task.context,
      buildManifest: condensedManifestForPrompt(manifest),
      instructions: [
        'IRON LAW: No production code without a failing test first.',
        'CONTEXT: buildManifest shows what prior tasks built. Follow established architectural decisions. Declare your own decisions and file dependencies in architecturalDecisions and dependsOn output fields.',
        'RED: Write failing test. Run it. Verify FAILS.',
        'GREEN: Write MINIMAL code to pass. Run it. Verify PASSES.',
        'REFACTOR: Clean up while staying green.',
        'Self-review before reporting.',
        'Commit your work.',
        'Report: what implemented, test results, files changed, concerns, architecturalDecisions, dependsOn.'
      ]
    });

    // 3b: Spec Compliance Review (MUST come first)
    let specPassed = false;
    let specAttempts = 0;
    while (!specPassed && specAttempts < 3) {
      specAttempts++;
      const specReview = await ctx.task(specComplianceReviewerTask, {
        taskDescription: task.fullText,
        implementerReport: implResult,
        buildManifest: condensedManifestForPrompt(manifest),
        instructions: [
          'IRON LAW: Do NOT trust the implementer report. Read actual code.',
          'CONTEXT: buildManifest shows what prior tasks built. Verify this task is consistent with established patterns.',
          'Compare actual implementation to requirements line by line.',
          'Check for: missing requirements, extra work, misunderstandings.',
          'Report: PASS or FAIL with specific issues and file:line references.'
        ]
      });

      if (specReview.passed) {
        specPassed = true;
      } else if (specAttempts >= 3) {
        // Exhausted retries - escalate to human
        await ctx.breakpoint({
          question: [
            `Spec compliance review failed 3 times for Task ${i + 1}: ${task.name}`,
            '',
            'Latest issues:',
            ...specReview.issues.map(issue => `  - ${issue}`),
            '',
            'Options:',
            '1. Approve and continue (accept current state)',
            '2. Provide guidance for the implementer to retry',
            '3. Abort this task and move to the next one',
          ].join('\n'),
          title: 'Spec Review Escalation',
          context: { runId: ctx.runId }
        });
        specPassed = true; // Human approved continuation
      } else {
        implResult = await ctx.task(tddImplementerTask, {
          taskNumber: i + 1,
          taskName: `${task.name} (spec fix #${specAttempts})`,
          taskDescription: `Fix spec issues:\n${specReview.issues.join('\n')}`,
          sceneContext: task.context,
          buildManifest: condensedManifestForPrompt(manifest),
          instructions: [
            'IRON LAW: No production code without a failing test first.',
            'Fix ONLY the spec issues listed. Nothing else.',
            'Follow TDD for any new code. Commit fixes.'
          ]
        });
      }
    }

    // 3c: Code Quality Review (ONLY after spec passes)
    let qualityPassed = false;
    let qualityAttempts = 0;
    while (!qualityPassed && qualityAttempts < 3) {
      qualityAttempts++;
      const qualityReview = await ctx.task(codeQualityReviewerTask, {
        taskDescription: task.fullText,
        implementerReport: implResult,
        buildManifest: condensedManifestForPrompt(manifest),
        instructions: [
          'IRON LAW: Do NOT trust the implementer report. Read actual code.',
          'CONTEXT: buildManifest shows established patterns. Flag inconsistencies with prior architectural decisions.',
          'Review: cleanliness, naming, maintainability, test quality.',
          'Only FAIL for Critical or Important issues.',
          'Report: PASS or FAIL with issues categorized by severity.'
        ]
      });

      if (qualityReview.passed) {
        qualityPassed = true;
      } else if (qualityAttempts >= 3) {
        // Exhausted retries - escalate to human
        await ctx.breakpoint({
          question: [
            `Code quality review failed 3 times for Task ${i + 1}: ${task.name}`,
            '',
            'Latest issues:',
            ...qualityReview.issues.map(issue => `  - ${issue}`),
            '',
            'Options:',
            '1. Approve and continue (accept current quality)',
            '2. Provide guidance for the implementer to retry',
            '3. Abort this task and move to the next one',
          ].join('\n'),
          title: 'Quality Review Escalation',
          context: { runId: ctx.runId }
        });
        qualityPassed = true; // Human approved continuation
      } else {
        implResult = await ctx.task(tddImplementerTask, {
          taskNumber: i + 1,
          taskName: `${task.name} (quality fix #${qualityAttempts})`,
          taskDescription: `Fix quality issues:\n${qualityReview.issues.join('\n')}`,
          sceneContext: task.context,
          buildManifest: condensedManifestForPrompt(manifest),
          instructions: [
            'IRON LAW: No production code without a failing test first.',
            'Fix ONLY the quality issues listed. Nothing else.',
            'Follow TDD for any new code. Commit fixes.'
          ]
        });
      }
    }

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
