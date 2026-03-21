/**
 * @module superbabysitter/mcp-state-helpers
 * @description Helper functions for generating MCP state tool instructions for agents.
 * These instructions are injected into agent prompts so they know how to query and record
 * workflow state via the babysitter-state MCP tools.
 *
 * All query instructions follow the 3-layer pattern:
 *   1. search_results -> returns IDs + titles only
 *   2. get_results(ids=[...]) -> fetches full details (narratives, decisions, files_changed)
 *   3. Use the content to inform your work
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
  const instructions = [];
  const hasAnyQuery = queryInstructions.getRunSummary || queryInstructions.searchDecisions ||
    queryInstructions.searchPhase || queryInstructions.searchResultType || queryInstructions.custom;

  if (hasAnyQuery) {
    instructions.push(
      '',
      '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
      'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
      'or miss context that other agents recorded. Query FIRST, then work.'
    );

    let step = 1;

    if (queryInstructions.getRunSummary) {
      instructions.push(
        `${step}. Call get_run_summary(run_id=${runId})`,
        '   PURPOSE: Get a condensed view of completed phases, task progress, decisions, and files changed.',
        '   USE THIS TO: Orient yourself on what has been done and what remains.'
      );
      step++;
    }

    if (queryInstructions.searchDecisions) {
      instructions.push(
        `${step}. Call search_results(run_id=${runId}, result_type="decision")`,
        '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
        '   PURPOSE: See the rationale behind each architectural decision, not just titles.',
        '   USE THIS TO: Maintain consistency with prior decisions. Flag deviations.'
      );
      step++;
    }

    if (queryInstructions.searchPhase) {
      instructions.push(
        `${step}. Call search_results(run_id=${runId}, phase="${queryInstructions.searchPhase}")`,
        '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
        `   PURPOSE: See what happened in the "${queryInstructions.searchPhase}" phase including narratives and files changed.`,
        '   USE THIS TO: Build on prior work rather than duplicating or contradicting it.'
      );
      step++;
    }

    if (queryInstructions.searchResultType) {
      instructions.push(
        `${step}. Call search_results(run_id=${runId}, result_type="${queryInstructions.searchResultType}")`,
        '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
        `   PURPOSE: See detailed results of type "${queryInstructions.searchResultType}".`,
        '   USE THIS TO: Understand specific outcomes and apply learnings.'
      );
      step++;
    }

    if (queryInstructions.custom) {
      instructions.push(...queryInstructions.custom);
    }

    instructions.push('=== END MANDATORY STATE QUERY ===');
  }

  instructions.push(
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    `  phase: "${phase}"`,
    `  result_type: "${resultType}"`,
    '  title: (brief title of what you did)',
    '  narrative: (detailed description)',
    '  files_changed: (array of file paths you modified)',
    '  architectural_decisions: (array of decisions you made)',
    '  concerns: (array of open concerns)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your work)',
    '=== END STATE RECORDING ===',
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
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call get_run_summary(run_id=${runId})`,
    '   PURPOSE: Get a condensed view of completed tasks, decisions, and files changed so far.',
    '   USE THIS TO: Understand where your task fits in the overall implementation.',
    '',
    `2. Call search_results(run_id=${runId}, result_type="decision")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See the rationale behind each architectural decision, not just titles.',
    '   USE THIS TO: Follow established patterns and flag any inconsistencies.',
    '',
    `3. Call search_results(run_id=${runId}, result_type="implementation")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See prior task implementations including code changes and narratives.',
    '   USE THIS TO: Reuse helpers/patterns from earlier tasks. Avoid duplicating work.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== MID-TASK RECORDING (DO THIS AS YOU WORK) ===',
    'When you make an architectural decision during implementation, record it immediately:',
    '  Call record_result with:',
    `    run_id: ${runId}, phase: "tdd", result_type: "decision"`,
    '    title: (the decision), narrative: (why you chose this approach)',
    'This makes your decision visible to the NEXT agent without waiting for your task to complete.',
    '=== END MID-TASK RECORDING ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "tdd"',
    '  result_type: "implementation"',
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    '  title: (brief title of what you implemented)',
    '  narrative: (detailed description of implementation)',
    '  files_changed: (array of file paths you modified)',
    '  files_read: (array of file paths you read for context)',
    '  architectural_decisions: (array of any decisions you made)',
    '  concerns: (array of open concerns or risks)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    `  dependencies: (array of task numbers this depends on)`,
    '  stateContextUsed: (what you learned from state queries and how it influenced your work)',
    '=== END STATE RECORDING ===',
    ''
  ];
}

/**
 * Generate MCP instructions for reviewer agents.
 */
export function mcpReviewerInstructions(runId, taskNumber, taskName, reviewType) {
  return [
    '',
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call search_results(run_id=${runId}, result_type="implementation", task_number=${taskNumber})`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See the full narrative and files changed for the implementation you are reviewing.',
    '   USE THIS TO: Understand intent and verify completeness against the spec.',
    '',
    `2. Call search_results(run_id=${runId}, result_type="decision")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See all architectural decisions with their rationale.',
    '   USE THIS TO: Check that the implementation is consistent with established decisions.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "tdd"',
    `  result_type: "${reviewType === 'spec' ? 'spec_review' : 'quality_review'}"`,
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    `  title: "${reviewType} review for task ${taskNumber}"`,
    '  status: "pass" or "fail"',
    '  review_issues: (array of issues found, empty if pass)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your review)',
    '=== END STATE RECORDING ===',
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
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call get_run_summary(run_id=${runId})`,
    '   PURPOSE: Get the full picture of the run including completed tasks and decisions.',
    '   USE THIS TO: Understand the broader context of what you are fixing.',
    '',
    `2. Call search_results(run_id=${runId}, result_type="${reviewResultType}", task_number=${taskNumber})`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    `   PURPOSE: See the exact review issues that need fixing, with full narrative.`,
    '   USE THIS TO: Address each issue precisely rather than guessing what the reviewer found.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "tdd"',
    '  result_type: "fix"',
    `  task_number: ${taskNumber}`,
    `  task_name: "${taskName}"`,
    '  title: (brief description of what you fixed)',
    '  narrative: (detailed description of the fix)',
    '  files_changed: (array of file paths you modified)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your fix)',
    '=== END STATE RECORDING ===',
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
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call get_run_summary(run_id=${runId})`,
    '   PURPOSE: Get the full picture of the run including what debugging has uncovered.',
    '   USE THIS TO: Understand the root cause chain that led to this fix.',
    '',
    `2. Call search_results(run_id=${runId}, result_type="root_cause_investigation")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See the full investigation narrative, not just the title.',
    '   USE THIS TO: Understand the diagnosed root cause before attempting a fix.',
    '',
    `3. Call search_results(run_id=${runId}, result_type="pattern_analysis")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See pattern analysis results with full evidence.',
    '   USE THIS TO: Ensure your fix addresses the root pattern, not just symptoms.',
    '',
    `4. Call search_results(run_id=${runId}, result_type="hypothesis_test")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See which hypotheses were tested and their outcomes.',
    '   USE THIS TO: Target your fix at the confirmed hypothesis.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "debugging"',
    '  result_type: "fix"',
    '  title: (brief description of what you fixed)',
    '  narrative: (detailed description of the fix and regression test)',
    '  files_changed: (array of file paths you modified)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your fix)',
    '=== END STATE RECORDING ===',
    ''
  ];
}

/**
 * Generate MCP instructions for debugging agents.
 */
export function mcpDebuggingInstructions(runId, resultType = 'debug_investigation') {
  return [
    '',
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call get_run_summary(run_id=${runId})`,
    '   PURPOSE: Get a condensed view of the entire run state.',
    '   USE THIS TO: Orient yourself on what has been built and where failures occurred.',
    '',
    `2. Call search_results(run_id=${runId}, result_type="decision")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See all architectural decisions with their rationale.',
    '   USE THIS TO: Check if failures stem from violated assumptions in decisions.',
    '',
    `3. Call search_results(run_id=${runId}, phase="tdd")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See all implementation results including files changed and narratives.',
    '   USE THIS TO: Trace the implementation chain and identify where things went wrong.',
    '',
    `4. Call search_results(run_id=${runId}, result_type="verification")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See verification results with full evidence of what passed and failed.',
    '   USE THIS TO: Focus your investigation on the specific failures identified.',
    '',
    `5. Call get_timeline(run_id=${runId}, query="fail")`,
    '   PURPOSE: See chronological context around failures - what happened before/after.',
    '   USE THIS TO: Identify causal chains and temporal patterns.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "debugging"',
    `  result_type: "${resultType}"`,
    '  title: (brief description of what you found)',
    '  narrative: (detailed hypothesis and evidence)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your investigation)',
    '=== END STATE RECORDING ===',
    ''
  ];
}

/**
 * Generate MCP instructions for the finishing gate.
 * Includes complete_run to close the run so search_prior_runs returns it with an outcome.
 */
export function mcpFinishingInstructions(runId) {
  return [
    '',
    '=== MANDATORY STATE QUERY (DO THIS FIRST, BEFORE ANY OTHER WORK) ===',
    'WARNING: Skipping these queries means you will duplicate work, contradict decisions,',
    'or miss context that other agents recorded. Query FIRST, then work.',
    `1. Call get_run_summary(run_id=${runId})`,
    '   PURPOSE: Get a condensed view of the entire run including all phases.',
    '   USE THIS TO: Understand what was built and tested before running final verification.',
    '',
    `2. Call search_results(run_id=${runId}, phase="tdd")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See all implementation results including files changed.',
    '   USE THIS TO: Know what code to test and what test commands to run.',
    '',
    `3. Call search_results(run_id=${runId}, result_type="decision")`,
    '   THEN: Call get_results(ids=[...IDs from search]) to fetch full details.',
    '   PURPOSE: See architectural decisions that inform what to verify.',
    '   USE THIS TO: Ensure test coverage matches the decisions made.',
    '=== END MANDATORY STATE QUERY ===',
    '',
    '=== STATE RECORDING (DO THIS AFTER COMPLETING YOUR WORK) ===',
    'Call record_result with:',
    `  run_id: ${runId}`,
    '  phase: "finishing"',
    '  result_type: "verification"',
    '  title: (brief title of test results)',
    '  narrative: (detailed test output and results)',
    '  facts: (array of key factual discoveries - things that would save the next agent time)',
    '  stateContextUsed: (what you learned from state queries and how it influenced your work)',
    '',
    `THEN: Call complete_run(run_id=${runId}, status="completed"|"failed", outcome="<summary of final state>")`,
    '  PURPOSE: Close the run so search_prior_runs returns it with an outcome.',
    '  Use status="completed" if tests pass, "failed" if tests fail.',
    '=== END STATE RECORDING ===',
    ''
  ];
}