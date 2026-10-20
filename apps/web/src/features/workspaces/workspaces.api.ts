/**
 * Workspace calls of the web app. `POST /api/workspaces` creates one (decisions §4, §5): the caller
 * sends a client-chosen `Idempotency-Key`, so a retry after a lost answer returns the workspace already
 * created instead of a second one. `GET /api/workspaces` lists the user's active memberships.
 */
import { IDEMPOTENCY_KEY_HEADER, type Workspace, workspaceSchema } from '@ats/shared';
import { type ApiClient, ApiError, api, CLIENT_ERROR_CODES } from '../../lib/api';

/**
 * A success body that does not match the shared schema. The client does not report the 2xx status of
 * a success, so 200 stands for it: the request was answered, the answer is unusable.
 */
function malformed(what: string, cause?: unknown): ApiError {
  return new ApiError(CLIENT_ERROR_CODES.unknown, 200, `Malformed ${what} response`, { cause });
}

/** The workspaces of a `GET /api/workspaces` answer (`{ activeWorkspaceId, workspaces }`). */
function parseWorkspaceList(body: unknown): Workspace[] {
  const list =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).workspaces
      : undefined;
  if (!Array.isArray(list)) throw malformed('GET /api/workspaces');
  return list.map((item) => {
    const parsed = workspaceSchema.safeParse(item);
    if (!parsed.success) throw malformed('GET /api/workspaces', parsed.error);
    return parsed.data;
  });
}

export function createWorkspacesApi(client: ApiClient = api) {
  return {
    /**
     * Creates a workspace named `name`, with the same `idempotencyKey` for every retry of one
     * attempt. A success body that is not a workspace throws `UNKNOWN_ERROR` with status 200.
     */
    async create(name: string, idempotencyKey: string): Promise<Workspace> {
      const body = await client.post<unknown>(
        '/workspaces',
        { name },
        { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
      );
      const parsed = workspaceSchema.safeParse(body);
      if (!parsed.success) throw malformed('POST /api/workspaces', parsed.error);
      return parsed.data;
    },

    /** The workspaces the signed-in user is an active member of. */
    async list(): Promise<Workspace[]> {
      return parseWorkspaceList(await client.get<unknown>('/workspaces'));
    },
  };
}

export type WorkspacesApi = ReturnType<typeof createWorkspacesApi>;

/** App-wide workspace calls on the shared API client. */
export const workspacesApi = createWorkspacesApi();
