/**
 * Which sidebar destinations a workspace role sees, in order (decisions §3, §4, §13). A UI convenience
 * only: the API enforces every permission, and hidden pages also redirect in the router.
 *
 * - Admin and recruiter: Ứng tuyển, Ứng viên, Vị trí tuyển dụng.
 * - Collaborator: Ứng tuyển của tôi, Vị trí của tôi (no Candidates page).
 * - "Cài đặt không gian làm việc" is admin only. The Reports item is hidden in v1.
 *
 * The design draws a briefcase for every item; the ATS icon set has none, so the archive box stands
 * in for it, with the person icon for Ứng viên.
 */
import type { WorkspaceRole } from '@ats/shared';
import type { IconName } from '../components/ui/icons';

export interface NavItem {
  /** Route path of the destination. */
  to: string;
  /** vue-i18n key of the label. */
  labelKey: string;
  icon: IconName;
}

const APPLICATIONS: NavItem = {
  to: '/applications',
  labelKey: 'shell.nav.applications',
  icon: 'archive-box',
};
const CANDIDATES: NavItem = {
  to: '/candidates',
  labelKey: 'shell.nav.candidates',
  icon: 'profile',
};
const JOBS: NavItem = { to: '/jobs', labelKey: 'shell.nav.jobs', icon: 'archive-box' };
const MY_APPLICATIONS: NavItem = { ...APPLICATIONS, labelKey: 'shell.nav.myApplications' };
const MY_JOBS: NavItem = { ...JOBS, labelKey: 'shell.nav.myJobs' };

/** Pinned near the bottom of the sidebar, for admins only (see `showWorkspaceSettings`). */
export const WORKSPACE_SETTINGS_ITEM: NavItem = {
  to: '/settings/workspace',
  labelKey: 'shell.nav.workspaceSettings',
  icon: 'archive-box',
};

/** The main destinations for `role`, in sidebar order. No role (no active workspace): none. */
export function navItemsFor(role: WorkspaceRole | null): NavItem[] {
  switch (role) {
    case 'admin':
    case 'recruiter':
      return [APPLICATIONS, CANDIDATES, JOBS];
    case 'collaborator':
      return [MY_APPLICATIONS, MY_JOBS];
    default:
      return [];
  }
}

/** Workspace settings are admin only (decisions §4). */
export function showWorkspaceSettings(role: WorkspaceRole | null): boolean {
  return role === 'admin';
}
