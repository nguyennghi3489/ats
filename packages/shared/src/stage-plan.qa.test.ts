import { describe, expect, it } from 'vitest';
import {
  addStage,
  isEarlierTarget,
  moveStage,
  renameStage,
  restoreStage,
  retireStage,
  STAGE_NAME_INVALID,
  STAGE_RETIRE_TARGET_INVALID,
  stagePlanChanges,
  validateStagePlan,
  type StagePlan,
} from './index.js';

// QA for #138: edge cases around the acceptance criteria, through the package's public exports.

function defaultPlan(): StagePlan {
  return [
    { id: 'st-new', name: 'New', position: 1, retired: false },
    { id: 'st-screening', name: 'Screening', position: 2, retired: false },
    { id: 'st-interview', name: 'Interview', position: 3, retired: false },
    { id: 'st-offer', name: 'Offer', position: 4, retired: false },
  ];
}

function deepFreeze(plan: StagePlan): StagePlan {
  for (const item of plan) Object.freeze(item);
  return Object.freeze(plan);
}

function activeIds(plan: StagePlan): string[] {
  return plan
    .filter((s) => !s.retired)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.id);
}

function activePositions(plan: StagePlan): number[] {
  return plan
    .filter((s) => !s.retired)
    .map((s) => s.position)
    .sort((a, b) => a - b);
}

describe('stage plan (QA #138)', () => {
  it('keeps active positions 1…n without gaps across a chain of operations', () => {
    let plan = defaultPlan();
    plan = addStage(plan, 'Portfolio review', 'tmp-1');
    plan = retireStage(plan, 'st-screening', 'st-new');
    plan = moveStage(plan, 'tmp-1', 0);
    plan = addStage(plan, 'Reference check', 'tmp-2');
    plan = restoreStage(plan, 'st-screening');
    plan = retireStage(plan, 'st-new');
    expect(activePositions(plan)).toEqual([1, 2, 3, 4, 5]);
    expect(activeIds(plan)).toEqual(['tmp-1', 'st-interview', 'st-offer', 'tmp-2', 'st-screening']);
    expect(plan).toHaveLength(6);
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('never mutates a deep-frozen plan that already holds a retired stage with a target', () => {
    const plan = deepFreeze(retireStage(defaultPlan(), 'st-interview', 'st-screening'));
    const snapshot = JSON.stringify(plan);
    expect(() => {
      addStage(plan, 'Portfolio review', 'tmp-1');
      renameStage(plan, 'st-interview', 'Interview 2');
      renameStage(plan, 'st-offer', '  ');
      moveStage(plan, 'st-offer', 0);
      moveStage(plan, 'st-new', 99);
      retireStage(plan, 'st-offer', 'st-new');
      retireStage(plan, 'st-new');
      restoreStage(plan, 'st-interview');
      validateStagePlan(plan);
      isEarlierTarget(plan, 'st-interview', 'st-screening');
      stagePlanChanges(plan, restoreStage(plan, 'st-interview'));
      stagePlanChanges(defaultPlan(), plan);
    }).not.toThrow();
    expect(JSON.stringify(plan)).toBe(snapshot);
  });

  it('a retire target that was itself added then retired is invalid', () => {
    let plan = addStage(defaultPlan(), 'Temp', 'tmp-1');
    plan = retireStage(plan, 'st-offer', 'tmp-1');
    expect(validateStagePlan(plan)).toEqual([]);
    plan = retireStage(plan, 'tmp-1');
    expect(validateStagePlan(plan)).toEqual([
      { code: STAGE_RETIRE_TARGET_INVALID, stageId: 'st-offer' },
    ]);
  });

  it('reports a blank name on a new stage', () => {
    const plan = addStage(defaultPlan(), '   ', 'tmp-1');
    expect(validateStagePlan(plan)).toEqual([{ code: STAGE_NAME_INVALID, stageId: 'tmp-1' }]);
  });

  it('lists each kind of change in one draft', () => {
    const original = retireStage(defaultPlan(), 'st-screening');
    let draft = addStage(original, 'Portfolio review', 'tmp-1');
    draft = renameStage(draft, 'st-offer', 'Offer call');
    draft = moveStage(draft, 'st-offer', 0);
    draft = retireStage(draft, 'st-interview', 'st-offer');
    draft = restoreStage(draft, 'st-screening');
    const changes = stagePlanChanges(original, draft);
    expect(changes.added).toEqual(['tmp-1']);
    expect(changes.renamed).toEqual(['st-offer']);
    expect(changes.reordered).toEqual(['st-offer', 'st-new']);
    expect(changes.retired).toEqual(['st-interview']);
    expect(changes.restored).toEqual(['st-screening']);
  });

  it('counts add, retire, restore of a new stage as an addition', () => {
    let draft = addStage(defaultPlan(), 'Temp', 'tmp-1');
    draft = restoreStage(retireStage(draft, 'tmp-1'), 'tmp-1');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual({
      added: ['tmp-1'],
      renamed: [],
      reordered: [],
      retired: [],
      restored: [],
    });
  });

  it('isEarlierTarget stays correct after a reorder in the same draft', () => {
    // Offer, New, Screening, Interview
    const moved = moveStage(defaultPlan(), 'st-offer', 0);
    expect(isEarlierTarget(moved, 'st-interview', 'st-offer')).toBe(true);
    const retired = retireStage(moved, 'st-new', 'st-interview');
    expect(isEarlierTarget(retired, 'st-new', 'st-interview')).toBe(false);
    expect(isEarlierTarget(retired, 'st-new', 'st-offer')).toBe(true);
  });
});
