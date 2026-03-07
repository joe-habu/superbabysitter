/**
 * @process superbabysitter/group-profile-apis
 * @description Group Profile APIs (Milestone 3) - skips design/planning gates (pre-approved plan), implements via subagent TDD loop, then verification + finishing.
 * @inputs { runId?: number, moonrakerPath?: string, unhygienixPath?: string }
 * @outputs { success: boolean, tasksCompleted: number }
 */

import { subagentTddLoop } from './subagent-tdd-loop.js';
import { verificationGate } from './verification-gate.js';
import { debuggingPhase } from './debugging-phase.js';
import { finishingGate } from './finishing-gate.js';

function buildTasks(MOONRAKER, UNHYGIENIX) {
  return [
  // =====================================================================
  // TASK 1: Moonraker Proto Changes + Regeneration
  // =====================================================================
  {
    name: 'Moonraker Proto: Add pagination to GetOrganizationGroupMembers',
    fullText: `## Objective
Add pagination fields (limit, offset) to the GetOrganizationGroupMembers.Request message in moonraker.proto, then regenerate proto files.

## Working Directory
${MOONRAKER}

## Proto Changes (proto/moonraker.proto)

Find the GetOrganizationGroupMembers message (around line 2744) and add pagination fields to the Request:

BEFORE:
\`\`\`protobuf
message GetOrganizationGroupMembers {
    message Request {
        string organizationID = 1;
        string groupID = 2;
    }
    message Response {
        repeated OrganizationUser users = 1;
        int64 count = 2;
    }
}
\`\`\`

AFTER:
\`\`\`protobuf
message GetOrganizationGroupMembers {
    message Request {
        string organizationID = 1;
        string groupID = 2;
        uint32 limit = 3;
        uint32 offset = 4;
    }
    message Response {
        repeated OrganizationUser users = 1;
        int64 count = 2;
    }
}
\`\`\`

The Response already has \`int64 count = 2\` which serves as the total count for pagination. No Response changes needed.
The \`OrganizationUser\` message already has \`string roleName = 2\` at field 2 (line 1347-1352). No message changes needed.

## Proto Regeneration

Run: \`cd ${MOONRAKER} && make build-protos\`
This runs \`go generate proto/proto.go\` which regenerates all .pb.go and .pb.gw.go files.

## Verification

Run: \`cd ${MOONRAKER} && go build ./...\`
Must compile cleanly.

## TDD Note
This is a proto change task. There are no behavioral tests for proto definitions. The "test" is that the project compiles after regeneration. Write a simple test that verifies the new fields exist on the generated struct (e.g., check that GetOrganizationGroupMembers_Request has Limit and Offset fields).`,
    context: 'This is Task 1 of 6. It adds pagination fields to an existing proto message. The generated code will be used by Task 2 (DB layer) and Task 3 (handler).'
  },

  // =====================================================================
  // TASK 2: Moonraker DB Functions + Tests
  // =====================================================================
  {
    name: 'Moonraker DB: GetGroupUsersWithRoles + GetGroupUserCount',
    fullText: `## Objective
Add two new DB functions to db/organization_groups.go that query group members with their direct org role names, with pagination support.

## Working Directory
${MOONRAKER}

## Function 1: GetGroupUsersWithRoles

Add to db/organization_groups.go:

\`\`\`go
func GetGroupUsersWithRoles(db *gorm.DB, orgID, groupID string, limit, offset uint32) ([]*proto.OrganizationUser, error)
\`\`\`

SQL logic:
- SELECT users.id, users.name, users.nick_name, users.email, users.user_type, organization_roles.name
- FROM users
- JOIN organization_group_users ON users.id = organization_group_users.user_id
- JOIN organization_users ON users.id = organization_users.user_id AND organization_users.organization_id = orgID
- JOIN organization_roles ON organization_users.role_id = organization_roles.id
- WHERE organization_group_users.group_id = groupID AND organization_group_users.organization_id = orgID AND organization_group_users.is_deleted = false
- Also filter organization_users.deleted_at IS NULL and organization_roles.deleted_at IS NULL
- Apply LIMIT/OFFSET when limit > 0
- ORDER BY users.name ASC (or users.email ASC for consistency)

**CRITICAL PATTERN TO REUSE:** Look at \`extractAndReturnOrgUsers()\` in db/organizations.go (around line 509). It scans rows with exactly these 6 columns (id, name, nick_name, email, user_type, role_name) and returns []*proto.OrganizationUser. You MUST reuse this function rather than duplicating the scanning logic.

Also look at \`GetOrganizationAdministrators()\` in db/organizations.go (around line 275) for the JOIN pattern between users, organization_users, and organization_roles.

## Function 2: GetGroupUserCount

\`\`\`go
func GetGroupUserCount(db *gorm.DB, orgID, groupID string) (int64, error)
\`\`\`

COUNT query matching the same WHERE conditions as GetGroupUsersWithRoles but without LIMIT/OFFSET. This returns the total count needed for pagination responses.

## Tests

Add tests in db/organization_groups_test.go:

1. TestGetGroupUsersWithRoles_ReturnsUsersWithRoleNames - verify users returned with their direct org role name populated
2. TestGetGroupUsersWithRoles_Pagination - verify limit/offset work correctly
3. TestGetGroupUsersWithRoles_ExcludesDeletedMembers - verify is_deleted = true members are excluded
4. TestGetGroupUserCount - verify correct total count

Look at existing test patterns in db/organization_groups_test.go for setup/teardown patterns and test DB usage.

## Verification
\`cd ${MOONRAKER} && go test ./db/... -run TestGetGroupUsersWithRoles -v\`
\`cd ${MOONRAKER} && go test ./db/... -run TestGetGroupUserCount -v\`
\`cd ${MOONRAKER} && go build ./...\``,
    context: 'This is Task 2 of 6. It depends on Task 1 (proto regeneration) for the proto.OrganizationUser type. The DB functions will be consumed by Task 3 (handler update). Key pattern: reuse extractAndReturnOrgUsers() from db/organizations.go.'
  },

  // =====================================================================
  // TASK 3: Moonraker Handler Update
  // =====================================================================
  {
    name: 'Moonraker Handler: Update GetOrganizationGroupMembers',
    fullText: `## Objective
Update the GetOrganizationGroupMembers handler in api/server/organization_groups.go to use the new DB functions (GetGroupUsersWithRoles + GetGroupUserCount) and support pagination.

## Working Directory
${MOONRAKER}

## Current Handler (api/server/organization_groups.go)

Find the GetOrganizationGroupMembers method. Currently it:
1. Calls db.GetGroupUsers() which returns just user IDs/basic info
2. Manually wraps results into OrganizationUser protos WITHOUT populating roleName
3. Returns the response

## Updated Handler

Replace with:
1. Read limit/offset from request: \`req.GetLimit()\`, \`req.GetOffset()\`
2. Call \`db.GetGroupUserCount(s.DB, req.GetOrganizationID(), req.GetGroupID())\` for total count
3. Call \`db.GetGroupUsersWithRoles(s.DB, req.GetOrganizationID(), req.GetGroupID(), req.GetLimit(), req.GetOffset())\` for paginated users with roles
4. Return response with users and count

The handler should be simpler after this change since the DB layer now handles the JOIN and the manual wrapping loop is removed.

## Verification
\`cd ${MOONRAKER} && go build ./...\`
Must compile cleanly.

## TDD Note
Handler-level tests in this codebase typically require a full server setup. At minimum, verify the handler compiles and the build succeeds. If there are existing handler tests in the file, follow their pattern.`,
    context: 'This is Task 3 of 6. It depends on Task 2 (DB functions). After this task, the moonraker side is complete. The handler now returns members with their direct org role names and supports pagination.'
  },

  // =====================================================================
  // TASK 4: Unhygienix Proto Changes + Regeneration
  // =====================================================================
  {
    name: 'Unhygienix Proto: Add GetGroupCleanRoomMemberships',
    fullText: `## Objective
Add a new GetGroupCleanRoomMemberships message and RPC to unhygienix cleanroom.proto, then regenerate proto files.

## Working Directory
${UNHYGIENIX}

## Proto Changes (proto/cleanroom.proto)

### New Message

Add after the BulkRemoveCleanRoomGroup message (around line 2975, after the existing bulk group operations):

\`\`\`protobuf
// Get all clean room memberships for a specific group (reverse lookup)
message GetGroupCleanRoomMemberships {
    message Request {
        // Organization Identifier
        string organizationID = 1;
        // Group Identifier (moonraker organization_groups.id)
        string groupID = 2;
        // Pagination limit (0 = no limit)
        uint32 limit = 3;
        // Pagination offset
        uint32 offset = 4;
    }
    message Response {
        // List of clean room memberships for this group
        repeated CleanRoomGroupMembership memberships = 1;
        // Total count of memberships (for pagination)
        uint32 count = 2;
    }
}
\`\`\`

This reuses the existing CleanRoomGroupMembership message from domain.proto (line 1964-1979) which already has all the fields needed (ID, groupID, groupName, memberCount, role, cleanRoomID, cleanRoomName).

### New RPC

Add to the CleanRoomService RPC list, after the BulkRemoveCleanRoomGroup RPC (around line 5822):

\`\`\`protobuf
    // Get all clean room memberships for a specific group (reverse lookup)
    rpc GetGroupCleanRoomMemberships (GetGroupCleanRoomMemberships.Request) returns (GetGroupCleanRoomMemberships.Response) {
        option (google.api.http) = {
            get: "/unhygienix/organization/{organizationID}/group/{groupID}/clean-room-memberships"
        };
    }
\`\`\`

Note the URL pattern follows the bulk operations pattern: /organization/{orgID}/group/{groupID}/... (group-centric, no cleanRoomID).

## Proto Regeneration

Run: \`cd ${UNHYGIENIX} && make build-protos\`

## Verification

Run: \`cd ${UNHYGIENIX} && go build ./...\`
Must compile cleanly (handler stub will be needed - the build will fail until Task 6 adds the handler implementation, so for now just add an empty stub method on the server struct to satisfy the interface).

## TDD Note
Add a compile-time interface check or a simple test verifying the new generated types exist.`,
    context: 'This is Task 4 of 6. This creates the proto contract for the new endpoint. Tasks 5 (DB) and 6 (handler) depend on this. The message reuses existing CleanRoomGroupMembership from domain.proto.'
  },

  // =====================================================================
  // TASK 5: Unhygienix DB Functions + Tests
  // =====================================================================
  {
    name: 'Unhygienix DB: GetGroupCleanRoomMemberships + CountGroupCleanRoomMemberships',
    fullText: `## Objective
Add DB functions to query clean room memberships for a specific group (reverse lookup), with pagination support.

## Working Directory
${UNHYGIENIX}

## Result Struct

Add to db/cleanroom_group.go:

\`\`\`go
type GroupCleanRoomMembershipWithRole struct {
    models.CleanRoomGroup
    CleanRoomRoleID *string
    CleanRoomName   string
}
\`\`\`

## Function 1: GetGroupCleanRoomMemberships

\`\`\`go
func GetGroupCleanRoomMemberships(db *gorm.DB, orgID, groupID string, limit, offset uint32) ([]GroupCleanRoomMembershipWithRole, error)
\`\`\`

SQL logic:
- SELECT clean_room_groups.*, clean_room_group_roles.clean_room_role_id, clean_rooms.name AS clean_room_name
- FROM clean_room_groups
- LEFT JOIN clean_room_group_roles ON clean_room_groups.id = clean_room_group_roles.clean_room_group_id AND clean_room_group_roles.deleted_at IS NULL
- JOIN clean_rooms ON clean_room_groups.clean_room_id = clean_rooms.id AND clean_rooms.deleted_at IS NULL
- WHERE clean_room_groups.group_id = groupID AND clean_room_groups.organization_id = orgID AND clean_room_groups.deleted_at IS NULL
- ORDER BY clean_rooms.name ASC
- Apply LIMIT/OFFSET when limit > 0

**CRITICAL PATTERN:** Look at \`GetCleanRoomGroupsWithRoles()\` in db/cleanroom_group.go (around line 151) for the LEFT JOIN pattern between clean_room_groups and clean_room_group_roles. The new function is similar but queries by group_id instead of clean_room_id, and also JOINs clean_rooms to get the CR name.

## Function 2: CountGroupCleanRoomMemberships

\`\`\`go
func CountGroupCleanRoomMemberships(db *gorm.DB, orgID, groupID string) (int64, error)
\`\`\`

COUNT query with same WHERE/JOIN conditions but without LIMIT/OFFSET. Must JOIN clean_rooms to exclude deleted CRs from the count.

## Tests

Add tests in db/cleanroom_group_test.go (or create if needed):

1. TestGetGroupCleanRoomMemberships_ReturnsMembershipsWithRoles
2. TestGetGroupCleanRoomMemberships_Pagination
3. TestGetGroupCleanRoomMemberships_ExcludesDeletedCRs
4. TestCountGroupCleanRoomMemberships

Look at existing test patterns in db/ for setup/teardown.

## Verification
\`cd ${UNHYGIENIX} && go test ./db/... -run TestGetGroupCleanRoomMemberships -v\`
\`cd ${UNHYGIENIX} && go test ./db/... -run TestCountGroupCleanRoomMemberships -v\`
\`cd ${UNHYGIENIX} && go build ./...\``,
    context: 'This is Task 5 of 6. Depends on Task 4 (proto). The DB functions will be consumed by Task 6 (handler). Key pattern: reuse GetCleanRoomGroupsWithRoles() LEFT JOIN pattern from db/cleanroom_group.go.'
  },

  // =====================================================================
  // TASK 6: Unhygienix Handler + Security + Tests
  // =====================================================================
  {
    name: 'Unhygienix Handler: GetGroupCleanRoomMemberships + Security',
    fullText: `## Objective
Implement the GetGroupCleanRoomMemberships handler, add the security exclusion comment, and write handler tests.

## Working Directory
${UNHYGIENIX}

## Security (api/server/security.go)

Add a comment block in the cleanRoomPermissions map. Find the existing comment at line 232-234:
\`\`\`go
// BulkAddCleanRoomGroup and BulkRemoveCleanRoomGroup use repeated cleanRoomIDs
// (not singular cleanRoomID), so they don't implement CleanRoomAPIRequest.
// Authorization is handled inside the handlers via UserPermissionCheck.
\`\`\`

Add after this comment (before the FetchCleanRoomPermissions entry):
\`\`\`go
// GetGroupCleanRoomMemberships has no cleanRoomID field (group-centric lookup),
// so it doesn't implement CleanRoomAPIRequest.
// Authorization is handled inside the handler via UserPermissionCheck.
\`\`\`

## Handler (api/server/cleanroom_groups.go)

Add the GetGroupCleanRoomMemberships method to the server struct:

\`\`\`go
func (s *Server) GetGroupCleanRoomMemberships(ctx context.Context, req *proto.GetGroupCleanRoomMemberships_Request) (*proto.GetGroupCleanRoomMemberships_Response, error) {
    // 1. Manual auth check (no cleanRoomID available for standard interceptor)
    if err := s.UserPermissionCheck(ctx, req.GetOrganizationID(), []string{CleanRoomManagement}); err != nil {
        return nil, err
    }

    // 2. Get total count
    count, err := db.CountGroupCleanRoomMemberships(s.DB, req.GetOrganizationID(), req.GetGroupID())
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to count memberships: %v", err)
    }

    // 3. Get paginated memberships
    memberships, err := db.GetGroupCleanRoomMemberships(s.DB, req.GetOrganizationID(), req.GetGroupID(), req.GetLimit(), req.GetOffset())
    if err != nil {
        return nil, status.Errorf(codes.Internal, "failed to get memberships: %v", err)
    }

    // 4. Enrich with role details and group metadata
    // For each membership with a role ID, call GetCleanRoomRoleProto to enrich
    // Batch-enrich group metadata from moonraker via GetOrganizationGroupsMap
    // See FetchCleanRoomGroups handler (around line 110) for the enrichment pattern

    // 5. Return response
    return &proto.GetGroupCleanRoomMemberships_Response{
        Memberships: protoMemberships,
        Count:       uint32(count),
    }, nil
}
\`\`\`

**CRITICAL PATTERNS TO FOLLOW:**
1. Look at \`FetchCleanRoomGroups\` handler in api/server/cleanroom_groups.go (around line 110) for the full enrichment pattern: fetching role details via GetCleanRoomRoleProto, batch-fetching group metadata from moonraker via GetOrganizationGroupsMap.
2. Look at \`BulkAddCleanRoomGroup\` handler for the manual UserPermissionCheck pattern.
3. For role enrichment: if a membership has a CleanRoomRoleID, call GetCleanRoomRoleProto(s.DB, *roleID) to get the full CleanRoomRole with permissions.

## Handler Tests

Add tests in api/server/cleanroom_groups_test.go (or create if needed). Follow existing test patterns in the api/server/ package.

## Verification
\`cd ${UNHYGIENIX} && go build ./...\`
\`cd ${UNHYGIENIX} && go test ./api/server/... -run TestGetGroupCleanRoomMemberships -v\``,
    context: 'This is Task 6 of 6 (final task). Depends on Tasks 4 (proto) and 5 (DB). This completes the unhygienix side. The handler follows the same patterns as FetchCleanRoomGroups and BulkAddCleanRoomGroup.'
  }
  ];
}

export async function process(inputs, ctx) {
  const log = (ctx.log || (() => {})).bind(ctx);
  log('Group Profile APIs (Milestone 3) - Pre-approved plan, starting at Phase 3');

  const {
    runId = null,
    moonrakerPath = '/Users/coleman/GolandProjects/moonraker',
    unhygienixPath = '/Users/coleman/GolandProjects/unhygienix'
  } = inputs;

  if (!runId) {
    log('WARNING: No runId provided. MCP state tracking is disabled for this run.');
  }

  const tasks = buildTasks(moonrakerPath, unhygienixPath);

  // ========================================================================
  // PHASE 3: TDD IMPLEMENTATION LOOP (plan already designed and approved)
  // ========================================================================

  const { completedTasks } = await subagentTddLoop(tasks, runId, ctx);

  // ========================================================================
  // PHASE 4: VERIFICATION GATE
  // ========================================================================

  const verificationPlan = {
    feature: 'Group Profile APIs (Milestone 3)',
    tasks: tasks.map(t => t.name),
    verificationCommands: [
      `cd ${moonrakerPath} && go build ./...`,
      `cd ${moonrakerPath} && go test ./db/... -run TestGetGroupUsersWithRoles -v`,
      `cd ${moonrakerPath} && go test ./db/... -run TestGetGroupUserCount -v`,
      `cd ${unhygienixPath} && go build ./...`,
      `cd ${unhygienixPath} && go test ./db/... -run TestGetGroupCleanRoomMemberships -v`,
      `cd ${unhygienixPath} && go test ./db/... -run TestCountGroupCleanRoomMemberships -v`,
      `cd ${unhygienixPath} && go test ./api/server/... -run TestGetGroupCleanRoomMemberships -v`
    ]
  };

  const { verificationResult } = await verificationGate({
    feature: 'Group Profile APIs (Milestone 3)',
    planResult: verificationPlan,
    runId
  }, ctx);

  // ========================================================================
  // PHASE 5: DEBUGGING (conditional)
  // ========================================================================

  if (!verificationResult.passed) {
    log('Phase 5: Debugging Phase (verification failed)');
    for (const failedReq of verificationResult.requirements.filter(r => r.verdict !== 'PASS')) {
      await debuggingPhase(ctx, `Requirement failed: ${failedReq.requirement}\nEvidence: ${failedReq.output}`, 1, runId);
    }
    const reVerification = await verificationGate({
      feature: 'Group Profile APIs (Milestone 3)',
      planResult: verificationPlan,
      runId
    }, ctx);
    if (!reVerification.verificationResult.passed) {
      const failingReqs = reVerification.verificationResult.requirements
        .filter(r => r.verdict !== 'PASS')
        .map(r => `  - ${r.requirement}`);
      await ctx.breakpoint({
        question: [
          'Re-verification still has failures after debugging.',
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

  // ========================================================================
  // PHASE 6: FINISHING GATE
  // ========================================================================

  await finishingGate({ runId }, ctx);

  return {
    success: true,
    feature: 'Group Profile APIs (Milestone 3)',
    tasksCompleted: completedTasks.length,
    completedTasks
  };
}
