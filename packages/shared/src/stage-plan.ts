import { z } from 'zod';
import {
  STAGE_NAME_INVALID,
  STAGE_PLAN_NO_ACTIVE_STAGE,
  STAGE_RETIRE_TARGET_INVALID,
  type StagePlanErrorCode,
} from './errors.js';

/** Longest stage name accepted, after trimming. Names need not be unique: stages have identity. */
export const STAGE_NAME_MAX_LENGTH = 100;

/** A stage name: trimmed, 1–100 characters. Stored as data, never translated per viewer. */
export const stageNameSchema = z.string().trim().min(1).max(STAGE_NAME_MAX_LENGTH);

/**
 * One stage of a job's draft plan in the Quy trình tab (decisions §6). Active stages are numbered
 * 1…n without gaps; a retired stage keeps the position it last had while active, so the retire
 * dialog can tell whether its target is earlier. Stages are never deleted. `retireTargetId` is
 * where Save moves the stage's active candidates; `isNew` marks a stage added in this draft, whose
 * `id` is a client-chosen temporary id.
 */
export interface StagePlanItem {
  id: string;
  name: string;
  position: number;
  retired: boolean;
  retireTargetId?: string;
  isNew?: boolean;
}

/** A job's stages: active ones first in order, then retired ones. */
export type StagePlan = readonly StagePlanItem[];

/** One problem `validateStagePlan` found; `stageId` names the stage it is about, if any. */
export interface StagePlanError {
  code: StagePlanErrorCode;
  stageId?: string;
}

/** What a draft changes against the saved plan, as stage ids. All empty when nothing changed. */
export interface StagePlanChanges {
  added: string[];
  renamed: string[];
  reordered: string[];
  retired: string[];
  restored: string[];
}

function activeInOrder(plan: StagePlan): StagePlanItem[] {
  return plan.filter((s) => !s.retired).sort((a, b) => a.position - b.position);
}

/** Lists `active` (already ordered) as positions 1…n, then the retired stages of `plan` as they are. */
function arrange(active: readonly StagePlanItem[], plan: StagePlan): StagePlanItem[] {
  const ids = new Set(active.map((s) => s.id));
  return [
    ...active.map((s, index) => (s.position === index + 1 ? s : { ...s, position: index + 1 })),
    ...plan.filter((s) => s.retired && !ids.has(s.id)),
  ];
}

function withoutTarget(item: StagePlanItem): StagePlanItem {
  const rest = { ...item };
  delete rest.retireTargetId;
  return rest;
}

/** Adds a stage named `name` (trimmed) as the last active stage, with the temporary id `tempId`. */
export function addStage(plan: StagePlan, name: string, tempId: string): StagePlan {
  const added: StagePlanItem = {
    id: tempId,
    name: name.trim(),
    position: 0,
    retired: false,
    isNew: true,
  };
  return arrange([...activeInOrder(plan), added], plan);
}

/** Renames a stage (trimmed). Its identity, position and history stay the same. */
export function renameStage(plan: StagePlan, id: string, name: string): StagePlan {
  if (!plan.some((s) => s.id === id)) return plan;
  return plan.map((s) => (s.id === id ? { ...s, name: name.trim() } : s));
}

/**
 * Moves an active stage to `toIndex` among the active stages (clamped). Only the order changes;
 * no candidate moves. Retired stages cannot be moved.
 */
export function moveStage(plan: StagePlan, id: string, toIndex: number): StagePlan {
  const active = activeInOrder(plan);
  const from = active.findIndex((s) => s.id === id);
  if (from === -1) return plan;
  const [moved] = active.splice(from, 1);
  if (moved === undefined) return plan;
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), active.length);
  active.splice(to, 0, moved);
  return arrange(active, plan);
}

/**
 * Retires an active stage, recording where Save moves its active candidates. The stage stays in
 * the plan with its last position; the remaining active stages close the gap.
 */
export function retireStage(plan: StagePlan, id: string, targetId?: string): StagePlan {
  const stage = plan.find((s) => s.id === id);
  if (stage === undefined || stage.retired) return plan;
  const retired: StagePlanItem = {
    ...withoutTarget(stage),
    retired: true,
    ...(targetId === undefined ? {} : { retireTargetId: targetId }),
  };
  const active = activeInOrder(plan).filter((s) => s.id !== id);
  return arrange(active, [...plan.filter((s) => s.id !== id), retired]);
}

/** Restores a retired stage as the last active stage and clears its target. Moves no candidate. */
export function restoreStage(plan: StagePlan, id: string): StagePlan {
  const stage = plan.find((s) => s.id === id);
  if (stage === undefined || !stage.retired) return plan;
  const restored: StagePlanItem = { ...withoutTarget(stage), retired: false };
  return arrange(
    [...activeInOrder(plan), restored],
    plan.filter((s) => s.id !== id),
  );
}

/**
 * The checks a plan must pass before Save (decisions §6): at least one active stage, valid names,
 * and every retire target an existing active stage other than the retired one. Empty when valid.
 */
export function validateStagePlan(plan: StagePlan): StagePlanError[] {
  const errors: StagePlanError[] = [];
  if (!plan.some((s) => !s.retired)) errors.push({ code: STAGE_PLAN_NO_ACTIVE_STAGE });
  for (const stage of plan) {
    if (!stageNameSchema.safeParse(stage.name).success) {
      errors.push({ code: STAGE_NAME_INVALID, stageId: stage.id });
    }
    if (stage.retired && stage.retireTargetId !== undefined) {
      const target = plan.find((s) => s.id === stage.retireTargetId);
      if (target === undefined || target.retired || target.id === stage.id) {
        errors.push({ code: STAGE_RETIRE_TARGET_INVALID, stageId: stage.id });
      }
    }
  }
  return errors;
}

/**
 * Whether moving the candidates of `retiredId` into `targetId` sends them back to an earlier stage,
 * for the retire dialog's warning. Works before and after the retire draft is applied.
 */
export function isEarlierTarget(plan: StagePlan, retiredId: string, targetId: string): boolean {
  const retired = plan.find((s) => s.id === retiredId);
  const target = plan.find((s) => s.id === targetId);
  if (retired === undefined || target === undefined) return false;
  return target.position < retired.position;
}

/**
 * What `draft` changes against `original`, for the save request and the unsaved-changes indicator.
 * A stage added then retired in the same draft is no change; a rename back to the saved name is
 * none either; the shift of positions after a retire is not a reorder.
 */
export function stagePlanChanges(original: StagePlan, draft: StagePlan): StagePlanChanges {
  const saved = new Map(original.map((s) => [s.id, s]));
  const changes: StagePlanChanges = {
    added: [],
    renamed: [],
    reordered: [],
    retired: [],
    restored: [],
  };
  for (const stage of draft) {
    const before = saved.get(stage.id);
    if (before === undefined) {
      if (!stage.retired) changes.added.push(stage.id);
      continue;
    }
    if (before.name.trim() !== stage.name.trim()) changes.renamed.push(stage.id);
    if (!before.retired && stage.retired) changes.retired.push(stage.id);
    if (before.retired && !stage.retired) changes.restored.push(stage.id);
  }
  const keptActive = (plan: StagePlan, other: StagePlan): string[] =>
    activeInOrder(plan)
      .map((s) => s.id)
      .filter((id) => other.some((s) => s.id === id && !s.retired));
  const before = keptActive(original, draft);
  const after = keptActive(draft, original);
  changes.reordered = after.filter((id, index) => before[index] !== id);
  return changes;
}

/** Whether a draft has anything to save. */
export function hasStagePlanChanges(changes: StagePlanChanges): boolean {
  return Object.values(changes).some((ids: string[]) => ids.length > 0);
}

const stagePlanSaveStageSchema = z
  .strictObject({
    id: z.string().min(1).optional(),
    tempId: z.string().min(1).optional(),
    name: stageNameSchema,
    retired: z.boolean(),
    retireTargetId: z.string().min(1).optional(),
  })
  .refine((s) => (s.id === undefined) !== (s.tempId === undefined), {
    message: 'Exactly one of id and tempId',
  })
  .refine((s) => s.retired || s.retireTargetId === undefined, {
    message: 'Only a retired stage has a target',
  });

/**
 * Body of the future stage-plan save request: the plan's `version` as read (a stale one is
 * rejected) and every stage in order, active first. Existing stages carry `id`, new ones `tempId`;
 * a retired stage may name a target (an `id` or a `tempId`) for its active candidates.
 */
export const stagePlanSaveSchema = z.strictObject({
  version: z.number().int().min(0),
  stages: z.array(stagePlanSaveStageSchema),
});

export type StagePlanSave = z.infer<typeof stagePlanSaveSchema>;
