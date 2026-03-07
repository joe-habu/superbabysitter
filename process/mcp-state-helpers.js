/**
 * @module superbabysitter/mcp-state-helpers
 * @description Helper functions for generating MCP state tool instructions for agents.
 * These instructions are injected into agent prompts so they know how to query and record
 * workflow state via the babysitter-state MCP tools.
 */

/**
 * Generate MCP state instructions for an agent to include in its prompt.
 * @param {object} opts
 * @param {number} opts.runId - The current run ID
 * @param {string} opts.phase - Current phase (design|planning|tdd|verification|debugging|finishing)
 * @param {string} opts.resultType - Expected result type to record
 * @param {object} [opts.queryInstructions] - Additional query instructions
 * @returns {string[]} Array of instruction strings to append to agent instructions
 */
export function mcpStateInstructions({ runId, phase, resultType, queryInstructions = {} }) {
  const instructions = [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    ''
  ];

  // Query instructions (what to read before starting)
  if (queryInstructions.getRunSummary) {
    instructions.push(
      'BEFORE STARTING:',
      `1. Call get_run_summary(run_id=${runId}) to understand current run state`
    );
  }

  if (queryInstructions.searchDecisions) {
    instructions.push(
      `2. Call search_results(run_id=${runId}, result_type="decision") for architectural decisions`
    );
  }

  if (queryInstructions.searchPhase) {
    instructions.push(
      `3. Call search_results(run_id=${runId}, phase="${queryInstructions.searchPhase}") for prior phase results`
    );
  }

  if (queryInstructions.searchResultType) {
    instructions.push(
      `4. Call search_results(run_id=${runId}, result_type="${queryInstructions.searchResultType}") for specific results`
    );
  }

  if (queryInstructions.custom) {
    instructions.push(...queryInstructions.custom);
  }

  // Record instructions (what to write after completing)
  instructions.push(
    '',
    'AFTER COMPLETING YOUR WORK:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "${phase}"`,
    `  result_type: "${resultType}"`,
    `  title: (brief title of what you did)`,
    `  narrative: (detailed description)`,
    `  files_changed: (array of file paths you modified)`,
    `  architectural_decisions: (array of decisions you made)`,
    `  concerns: (array of open concerns)`,
    '--- END MCP STATE ---',
    ''
  );

  return instructions;
}

/**
 * Generate MCP instructions for the TDD implementer agent.
 * Includes scene context queries and result recording.
 */
export function mcpImplementerInstructions(runId, taskNumber, taskName) {
  return [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    '',
    'BEFORE STARTING:',
    `1. Call get_run_summary(run_id=${runId}) to understand current run state (completed tasks, decisions, files changed)`,
    `2. Call search_results(run_id=${runId}, result_type="decision") for all architectural decisions made so far`,
    `3. Call search_results(run_id=${runId}, result_type="implementation") for prior task implementations`,
    'Use this context to understand where your task fits and follow established patterns.',
    '',
    'AFTER COMPLETING YOUR WORK:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "tdd"`,
    `  result_type: "implementation"`,
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    `  title: (brief title of what you implemented)`,
    `  narrative: (detailed description of implementation)`,
    `  files_changed: (array of file paths you modified)`,
    `  files_read: (array of file paths you read for context)`,
    `  architectural_decisions: (array of any decisions you made)`,
    `  concerns: (array of open concerns or risks)`,
    `  dependencies: (array of task numbers this depends on)`,
    '--- END MCP STATE ---',
    ''
  ];
}

/**
 * Generate MCP instructions for reviewer agents.
 */
export function mcpReviewerInstructions(runId, taskNumber, taskName, reviewType) {
  return [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    '',
    'BEFORE REVIEWING:',
    `1. Call search_results(run_id=${runId}, result_type="implementation", task_number=${taskNumber}) to see what was implemented`,
    `2. Call search_results(run_id=${runId}, result_type="decision") for architectural decisions to check consistency`,
    '',
    'AFTER REVIEWING:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "tdd"`,
    `  result_type: "${reviewType === 'spec' ? 'spec_review' : 'quality_review'}"`,
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    `  title: "${reviewType} review for task ${taskNumber}"`,
    `  status: "pass" or "fail"`,
    `  review_issues: (array of issues found, empty if pass)`,
    '--- END MCP STATE ---',
    ''
  ];
}

/**
 * Generate MCP instructions for TDD fixer agents during review fix loops.
 * Uses result_type="fix" but includes task context to distinguish from debugging fixes.
 */
export function mcpTddFixerInstructions(runId, taskNumber, taskName, reviewType) {
  const reviewResultType = reviewType === 'spec' ? 'spec_review' : 'quality_review';
  return [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    '',
    'BEFORE FIXING:',
    `1. Call get_run_summary(run_id=${runId}) to understand full run state`,
    `2. Call search_results(run_id=${runId}, result_type="${reviewResultType}", task_number=${taskNumber}) for the review that identified these issues`,
    '',
    'AFTER FIXING:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "tdd"`,
    `  result_type: "fix"`,
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    `  title: (brief description of what you fixed)`,
    `  narrative: (detailed description of the fix)`,
    `  files_changed: (array of file paths you modified)`,
    '--- END MCP STATE ---',
    ''
  ];
}

/**
 * Generate MCP instructions for fix implementation during debugging.
 * Uses result_type="fix" to distinguish from investigation results.
 */
export function mcpFixInstructions(runId) {
  return [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    '',
    'BEFORE FIXING:',
    `1. Call get_run_summary(run_id=${runId}) to understand full run state`,
    `2. Call search_results(run_id=${runId}, result_type="root_cause_investigation") for the investigation that identified this root cause`,
    `3. Call search_results(run_id=${runId}, result_type="pattern_analysis") for pattern analysis results`,
    `4. Call search_results(run_id=${runId}, result_type="hypothesis_test") for hypothesis testing results`,
    '',
    'AFTER FIXING:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "debugging"`,
    `  result_type: "fix"`,
    `  title: (brief description of what you fixed)`,
    `  narrative: (detailed description of the fix and regression test)`,
    `  files_changed: (array of file paths you modified)`,
    '--- END MCP STATE ---',
    ''
  ];
}

/**
 * Generate MCP instructions for debugging agents.
 */
export function mcpDebuggingInstructions(runId, resultType = 'debug_investigation') {
  return [
    '',
    '--- MCP STATE MANAGEMENT ---',
    `You have access to babysitter-state MCP tools for run ${runId}.`,
    '',
    'BEFORE INVESTIGATING:',
    `1. Call get_run_summary(run_id=${runId}) to understand full run state`,
    `2. Call search_results(run_id=${runId}, result_type="decision") for all architectural decisions`,
    `3. Call search_results(run_id=${runId}, phase="tdd") for all implementation results`,
    `4. Call search_results(run_id=${runId}, result_type="verification") for verification results`,
    'Use this context to inform your root cause investigation.',
    '',
    'AFTER INVESTIGATING:',
    `Call record_result with:`,
    `  run_id: ${runId}`,
    `  phase: "debugging"`,
    `  result_type: "${resultType}"`,
    `  title: (brief description of what you found)`,
    `  narrative: (detailed hypothesis and evidence)`,
    '--- END MCP STATE ---',
    ''
  ];
}
