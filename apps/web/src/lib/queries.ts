// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// Days 2-5 fetched data the "manual" way in every page:
//     const [data, setData] = useState(...)
//     useEffect(() => { fetchThing().then(setData) }, [])
// That works, but every page had to reinvent loading state, error state,
// and "refetch after a mutation" by hand.
//
// This file is where TanStack Query (installed since Day 1, unused until
// today) finally gets put to work - ONE small custom hook per piece of
// data, each just a thin wrapper around `useQuery` or `useMutation`. Pages
// call these hooks instead of lib/api.ts's functions directly, and get
// `{ data, isLoading, isError }` (or, for mutations, `{ mutate, isPending }`)
// for free.
//
// QUERY KEYS, EXPLAINED: every `useQuery` needs a `queryKey` - an array
// that names WHAT is being fetched (`["organizations"]`,
// `["organizations", id, "roles"]`, ...). TanStack Query uses this key to
// cache results AND to know what to re-fetch after a mutation - see
// `invalidateQueries` calls below, which say "this key's cached data is now
// stale, go fetch it again" instead of us manually calling a refresh
// function after every create/delete like Days 4-5 did by hand.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type {
  CreateOrganizationInput,
  CreateRoleInput,
  CreateDepartmentInput,
  CreateTeamInput,
  CreateOrgInvitationInput,
  CreateProjectInput,
  UpdateProjectInput,
  AddProjectMemberInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "@opssphere/validation";

// ----------------------------------------------------------------------------
// ME / AUTH
// ----------------------------------------------------------------------------
export function useMeQuery() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    // Don't automatically retry a failed "am I logged in" check - if it
    // fails once, it's because there's no valid cookie, and retrying the
    // exact same request won't change that.
    retry: false,
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.logoutUser,
    onSuccess: () => {
      // Logging out invalidates EVERYTHING - every org, role, session
      // belonged to the person who just logged out. `clear()` empties the
      // whole cache rather than picking individual keys to invalidate.
      queryClient.clear();
    },
  });
}

// ----------------------------------------------------------------------------
// SESSIONS
// ----------------------------------------------------------------------------
export function useSessionsQuery() {
  return useQuery({ queryKey: ["sessions"], queryFn: api.listSessions });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useRevokeOtherSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

// ----------------------------------------------------------------------------
// ORGANIZATIONS
// ----------------------------------------------------------------------------
export function useOrganizationsQuery() {
  return useQuery({ queryKey: ["organizations"], queryFn: api.listOrganizations });
}

export function useOrganizationQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId],
    queryFn: () => api.getOrganization(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => api.createOrganization(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

// ----------------------------------------------------------------------------
// MEMBERS, ROLES, DEPARTMENTS, TEAMS  (all scoped to one organizationId)
// ----------------------------------------------------------------------------
export function useOrganizationMembersQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "members"],
    queryFn: () => api.listOrganizationMembers(organizationId),
    enabled: Boolean(organizationId), // don't fire until we actually have an id
  });
}

export function useOrganizationRolesQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "roles"],
    queryFn: () => api.listRoles(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationDepartmentsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "departments"],
    queryFn: () => api.listDepartments(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useOrganizationTeamsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "teams"],
    queryFn: () => api.listTeams(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useCreateRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => api.createRole(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "roles"] }),
  });
}

export function useDeleteRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => api.deleteRole(organizationId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "roles"] }),
  });
}

export function useCreateDepartmentMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => api.createDepartment(organizationId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "departments"] }),
  });
}

export function useDeleteDepartmentMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (departmentId: string) => api.deleteDepartment(organizationId, departmentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "departments"] }),
  });
}

export function useCreateTeamMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => api.createTeam(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "teams"] }),
  });
}

export function useDeleteTeamMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => api.deleteTeam(organizationId, teamId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "teams"] }),
  });
}

export function useUpdateMemberRoleMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: string; roleId: string }) =>
      api.updateMemberRole(organizationId, membershipId, roleId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] }),
  });
}

export function useCreateOrgInvitationMutation(organizationId: string) {
  return useMutation({
    mutationFn: (input: CreateOrgInvitationInput) => api.createOrgInvitation(organizationId, input),
    // No invalidation needed - sending an invitation doesn't change
    // anything the CURRENT org's queries (members/roles/etc) show yet; the
    // invitee only shows up as a real member once they accept it.
  });
}

// ----------------------------------------------------------------------------
// PROJECTS  (Day 7)
// ----------------------------------------------------------------------------
export function useProjectsQuery(organizationId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects"],
    queryFn: () => api.listProjects(organizationId),
    enabled: Boolean(organizationId),
  });
}

export function useProjectQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId],
    queryFn: () => api.getProject(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateProjectMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.createProject(organizationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] }),
  });
}

export function useUpdateProjectMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => api.updateProject(organizationId, projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects", projectId] });
    },
  });
}

export function useProjectMembersQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "members"],
    queryFn: () => api.listProjectMembers(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useAddProjectMemberMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddProjectMemberInput) => api.addProjectMember(organizationId, projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "members"],
      });
      // Adding a member changes the project's memberCount too, shown on
      // both the list page and this project's own summary.
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
    },
  });
}

export function useRemoveProjectMemberMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.removeProjectMember(organizationId, projectId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "members"],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "projects"] });
    },
  });
}

export function useMilestonesQuery(organizationId: string, projectId: string) {
  return useQuery({
    queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
    queryFn: () => api.listMilestones(organizationId, projectId),
    enabled: Boolean(organizationId) && Boolean(projectId),
  });
}

export function useCreateMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => api.createMilestone(organizationId, projectId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}

export function useUpdateMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, input }: { milestoneId: string; input: UpdateMilestoneInput }) =>
      api.updateMilestone(organizationId, projectId, milestoneId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}

export function useDeleteMilestoneMutation(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: string) => api.deleteMilestone(organizationId, projectId, milestoneId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "projects", projectId, "milestones"],
      }),
  });
}
