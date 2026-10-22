/**
 * The signed-in user's workspaces and the session's active one (decisions §3, §4). The API is the
 * source of truth: `load()` reads `GET /api/workspaces`, `select()` switches with
 * `PUT /api/workspaces/active`, and `reset()` forgets everything (sign-out, revoked access).
 */
import type { Workspace } from '@ats/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError, CLIENT_ERROR_CODES } from '../../lib/api';
import { workspacesApi } from './workspaces.api';

/** `idle` until the first `load()`; `error` when the last one failed (see `errorCode`). */
export type WorkspaceStatus = 'idle' | 'loading' | 'ready' | 'error';

function codeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : CLIENT_ERROR_CODES.unknown;
}

export const useWorkspaceStore = defineStore('workspaces', () => {
  const workspaces = ref<Workspace[]>([]);
  const activeWorkspaceId = ref<string | null>(null);
  const status = ref<WorkspaceStatus>('idle');
  /** Code of the last failed `load()`; a body that does not match the schema is `UNKNOWN_ERROR`. */
  const errorCode = ref<string | null>(null);

  // Only the latest load (or a reset) may write the state, so a slow earlier answer never wins.
  let generation = 0;

  /** Reads the list. Failures are reported in `status` and `errorCode`, never thrown. */
  async function load(): Promise<void> {
    const current = ++generation;
    status.value = 'loading';
    try {
      const list = await workspacesApi.getList();
      if (current !== generation) return;
      workspaces.value = list.workspaces;
      activeWorkspaceId.value = list.activeWorkspaceId;
      errorCode.value = null;
      status.value = 'ready';
    } catch (error) {
      if (current !== generation) return;
      errorCode.value = codeOf(error);
      status.value = 'error';
    }
  }

  /**
   * Makes `id` the session's active workspace. Throws the `ApiError` of a refusal (404
   * `WORKSPACE_UNAVAILABLE` for one the user cannot enter) and leaves the state as it was.
   */
  async function select(id: string): Promise<void> {
    const workspace = await workspacesApi.switch(id);
    activeWorkspaceId.value = workspace.id;
  }

  function reset(): void {
    generation++;
    workspaces.value = [];
    activeWorkspaceId.value = null;
    errorCode.value = null;
    status.value = 'idle';
  }

  return { workspaces, activeWorkspaceId, status, errorCode, load, select, reset };
});
