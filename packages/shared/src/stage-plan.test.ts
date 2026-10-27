import { describe, expect, it } from 'vitest';
import {
  addStage,
  hasStagePlanChanges,
  isEarlierTarget,
  moveStage,
  renameStage,
  restoreStage,
  retireStage,
  STAGE_NAME_INVALID,
  STAGE_NAME_MAX_LENGTH,
  STAGE_PLAN_ERROR_CODES,
  STAGE_PLAN_NO_ACTIVE_STAGE,
  STAGE_RETIRE_TARGET_INVALID,
  stageNameSchema,
  stagePlanChanges,
  stagePlanSaveSchema,
  validateStagePlan,
  type StagePlan,
  type StagePlanItem,
} from './index.js';

/** The four default stages of a job, as the read endpoint would give them. */
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

function active(plan: StagePlan): Array<Pick<StagePlanItem, 'name' | 'position'>> {
  return plan.filter((s) => !s.retired).map(({ name, position }) => ({ name, position }));
}

function find(plan: StagePlan, id: string): StagePlanItem {
  const item = plan.find((s) => s.id === id);
  if (!item) throw new Error(`no stage ${id}`);
  return item;
}

describe('stage plan error codes', () => {
  it('names the codes validateStagePlan answers with', () => {
    expect(STAGE_PLAN_ERROR_CODES).toEqual([
      'STAGE_PLAN_NO_ACTIVE_STAGE',
      'STAGE_NAME_INVALID',
      'STAGE_RETIRE_TARGET_INVALID',
    ]);
    expect([STAGE_PLAN_NO_ACTIVE_STAGE, STAGE_NAME_INVALID, STAGE_RETIRE_TARGET_INVALID]).toEqual(
      STAGE_PLAN_ERROR_CODES,
    );
  });
});

describe('stageNameSchema', () => {
  it('trims and accepts 1–100 characters', () => {
    expect(stageNameSchema.parse('  Portfolio review ')).toBe('Portfolio review');
    expect(stageNameSchema.parse('x'.repeat(STAGE_NAME_MAX_LENGTH))).toHaveLength(100);
  });

  it('rejects blank and 101-character names', () => {
    expect(stageNameSchema.safeParse('   ').success).toBe(false);
    expect(stageNameSchema.safeParse('x'.repeat(101)).success).toBe(false);
  });
});

describe('addStage', () => {
  it('appends the new stage as the fifth active stage with positions 1…5', () => {
    const plan = addStage(defaultPlan(), 'Portfolio review', 'tmp-1');
    expect(active(plan)).toEqual([
      { name: 'New', position: 1 },
      { name: 'Screening', position: 2 },
      { name: 'Interview', position: 3 },
      { name: 'Offer', position: 4 },
      { name: 'Portfolio review', position: 5 },
    ]);
    expect(find(plan, 'tmp-1')).toMatchObject({ isNew: true, retired: false });
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('places it after the active stages, not after retired ones', () => {
    const retired = retireStage(defaultPlan(), 'st-interview');
    const plan = addStage(retired, 'Portfolio review', 'tmp-1');
    expect(active(plan).map((s) => s.position)).toEqual([1, 2, 3, 4]);
    expect(find(plan, 'tmp-1').position).toBe(4);
  });

  it('trims the name', () => {
    expect(find(addStage(defaultPlan(), '  Test  ', 'tmp-1'), 'tmp-1').name).toBe('Test');
  });
});

describe('renameStage', () => {
  it('keeps the stage id and its position', () => {
    const plan = renameStage(defaultPlan(), 'st-interview', 'Phỏng vấn chuyên môn');
    expect(find(plan, 'st-interview')).toEqual({
      id: 'st-interview',
      name: 'Phỏng vấn chuyên môn',
      position: 3,
      retired: false,
    });
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('trims surrounding spaces', () => {
    expect(find(renameStage(defaultPlan(), 'st-offer', '  Offer call  '), 'st-offer').name).toBe(
      'Offer call',
    );
  });

  it('gives STAGE_NAME_INVALID for a blank or 101-character name', () => {
    for (const name of ['   ', 'x'.repeat(101)]) {
      const plan = renameStage(defaultPlan(), 'st-offer', name);
      expect(validateStagePlan(plan)).toEqual([{ code: STAGE_NAME_INVALID, stageId: 'st-offer' }]);
    }
  });

  it('accepts a 100-character name and a duplicate name', () => {
    expect(validateStagePlan(renameStage(defaultPlan(), 'st-offer', 'x'.repeat(100)))).toEqual([]);
    expect(validateStagePlan(renameStage(defaultPlan(), 'st-offer', 'New'))).toEqual([]);
  });

  it('leaves the plan unchanged for an unknown id', () => {
    expect(renameStage(defaultPlan(), 'nope', 'X')).toEqual(defaultPlan());
  });
});

describe('moveStage', () => {
  it('moves Offer to index 0 and renumbers active stages only', () => {
    const withRetired = retireStage(defaultPlan(), 'st-screening');
    const plan = moveStage(withRetired, 'st-offer', 0);
    expect(active(plan)).toEqual([
      { name: 'Offer', position: 1 },
      { name: 'New', position: 2 },
      { name: 'Interview', position: 3 },
    ]);
    expect(find(plan, 'st-screening')).toMatchObject({ retired: true, position: 2 });
  });

  it('clamps the index to the active stages', () => {
    const plan = moveStage(defaultPlan(), 'st-new', 99);
    expect(active(plan).map((s) => s.name)).toEqual(['Screening', 'Interview', 'Offer', 'New']);
  });

  it('does not move a retired stage', () => {
    const retired = retireStage(defaultPlan(), 'st-screening');
    expect(moveStage(retired, 'st-screening', 0)).toEqual(retired);
  });
});

describe('retireStage', () => {
  it('records the target and keeps the stage in the plan', () => {
    const plan = retireStage(defaultPlan(), 'st-interview', 'st-screening');
    expect(plan).toHaveLength(4);
    expect(find(plan, 'st-interview')).toMatchObject({
      retired: true,
      retireTargetId: 'st-screening',
    });
    expect(active(plan)).toEqual([
      { name: 'New', position: 1 },
      { name: 'Screening', position: 2 },
      { name: 'Offer', position: 3 },
    ]);
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('is valid without a target', () => {
    const plan = retireStage(defaultPlan(), 'st-interview');
    expect(find(plan, 'st-interview').retireTargetId).toBeUndefined();
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('gives STAGE_PLAN_NO_ACTIVE_STAGE when the only active stage is retired', () => {
    let plan = defaultPlan();
    for (const id of ['st-new', 'st-screening', 'st-interview']) plan = retireStage(plan, id);
    expect(validateStagePlan(plan)).toEqual([]);
    plan = retireStage(plan, 'st-offer');
    expect(validateStagePlan(plan)).toEqual([{ code: STAGE_PLAN_NO_ACTIVE_STAGE }]);
  });

  it('applies the last-active rule to an empty plan as well', () => {
    expect(validateStagePlan([])).toEqual([{ code: STAGE_PLAN_NO_ACTIVE_STAGE }]);
  });

  it('gives STAGE_RETIRE_TARGET_INVALID for a retired, missing or self target', () => {
    const retiredTarget = retireStage(
      retireStage(defaultPlan(), 'st-screening'),
      'st-interview',
      'st-screening',
    );
    const missingTarget = retireStage(defaultPlan(), 'st-interview', 'st-gone');
    const selfTarget = retireStage(defaultPlan(), 'st-interview', 'st-interview');
    for (const plan of [retiredTarget, missingTarget, selfTarget]) {
      expect(validateStagePlan(plan)).toEqual([
        { code: STAGE_RETIRE_TARGET_INVALID, stageId: 'st-interview' },
      ]);
    }
  });

  it('accepts a newly added stage as the target', () => {
    const plan = retireStage(addStage(defaultPlan(), 'Final', 'tmp-1'), 'st-offer', 'tmp-1');
    expect(validateStagePlan(plan)).toEqual([]);
  });

  it('leaves an already retired stage unchanged', () => {
    const retired = retireStage(defaultPlan(), 'st-interview', 'st-offer');
    expect(retireStage(retired, 'st-interview', 'st-new')).toEqual(retired);
  });
});

describe('restoreStage', () => {
  it('appends the stage as the last active stage and clears its target', () => {
    const retired = retireStage(defaultPlan(), 'st-screening', 'st-new');
    const plan = restoreStage(retired, 'st-screening');
    expect(find(plan, 'st-screening')).toEqual({
      id: 'st-screening',
      name: 'Screening',
      position: 4,
      retired: false,
    });
    expect(active(plan)).toEqual([
      { name: 'New', position: 1 },
      { name: 'Interview', position: 2 },
      { name: 'Offer', position: 3 },
      { name: 'Screening', position: 4 },
    ]);
  });

  it('leaves an active stage unchanged', () => {
    expect(restoreStage(defaultPlan(), 'st-new')).toEqual(defaultPlan());
  });
});

describe('isEarlierTarget', () => {
  it('is true for Interview into Screening and false into Offer', () => {
    const intoScreening = retireStage(defaultPlan(), 'st-interview', 'st-screening');
    expect(isEarlierTarget(intoScreening, 'st-interview', 'st-screening')).toBe(true);
    const intoOffer = retireStage(defaultPlan(), 'st-interview', 'st-offer');
    expect(isEarlierTarget(intoOffer, 'st-interview', 'st-offer')).toBe(false);
  });

  it('works on the plan before the retire draft is applied', () => {
    expect(isEarlierTarget(defaultPlan(), 'st-interview', 'st-screening')).toBe(true);
    expect(isEarlierTarget(defaultPlan(), 'st-interview', 'st-offer')).toBe(false);
  });

  it('is false for unknown stages', () => {
    expect(isEarlierTarget(defaultPlan(), 'st-interview', 'nope')).toBe(false);
    expect(isEarlierTarget(defaultPlan(), 'nope', 'st-new')).toBe(false);
  });
});

describe('stagePlanChanges', () => {
  const none = { added: [], renamed: [], reordered: [], retired: [], restored: [] };

  it('is empty for an unchanged plan', () => {
    expect(stagePlanChanges(defaultPlan(), defaultPlan())).toEqual(none);
    expect(hasStagePlanChanges(stagePlanChanges(defaultPlan(), defaultPlan()))).toBe(false);
  });

  it('is empty for add-then-retire of a new stage', () => {
    const draft = retireStage(addStage(defaultPlan(), 'Temp', 'tmp-1'), 'tmp-1');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual(none);
  });

  it('is empty for rename back to the original name', () => {
    const draft = renameStage(renameStage(defaultPlan(), 'st-new', 'X'), 'st-new', ' New ');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual(none);
  });

  it('lists an added stage', () => {
    const draft = addStage(defaultPlan(), 'Portfolio review', 'tmp-1');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual({ ...none, added: ['tmp-1'] });
  });

  it('lists a renamed stage', () => {
    const draft = renameStage(defaultPlan(), 'st-offer', 'Offer call');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual({ ...none, renamed: ['st-offer'] });
  });

  it('lists the stages whose order changed', () => {
    const draft = moveStage(defaultPlan(), 'st-offer', 0);
    const changes = stagePlanChanges(defaultPlan(), draft);
    expect(changes).toEqual({
      ...none,
      reordered: ['st-offer', 'st-new', 'st-screening', 'st-interview'],
    });
    expect(hasStagePlanChanges(changes)).toBe(true);
  });

  it('does not count the shift after a retire as a reorder', () => {
    const draft = retireStage(defaultPlan(), 'st-screening', 'st-new');
    expect(stagePlanChanges(defaultPlan(), draft)).toEqual({ ...none, retired: ['st-screening'] });
  });

  it('lists a restored stage', () => {
    const original = retireStage(defaultPlan(), 'st-screening');
    const draft = restoreStage(original, 'st-screening');
    expect(stagePlanChanges(original, draft)).toEqual({ ...none, restored: ['st-screening'] });
  });
});

describe('operations never mutate their input', () => {
  it('returns new plans from frozen inputs', () => {
    const plan = deepFreeze(defaultPlan());
    const snapshot = defaultPlan();
    const retired = deepFreeze(retireStage(plan, 'st-interview', 'st-new'));
    const results = [
      addStage(plan, 'Portfolio review', 'tmp-1'),
      renameStage(plan, 'st-new', 'Applied'),
      moveStage(plan, 'st-offer', 0),
      retired,
      restoreStage(retired, 'st-interview'),
    ];
    expect(plan).toEqual(snapshot);
    expect(find(retired, 'st-interview').retired).toBe(true);
    for (const result of results) expect(result).not.toBe(plan);
    validateStagePlan(plan);
    stagePlanChanges(plan, retired);
    isEarlierTarget(plan, 'st-interview', 'st-new');
    expect(plan).toEqual(snapshot);
  });
});

describe('stagePlanSaveSchema', () => {
  it('accepts existing and new stages with a version', () => {
    const body = {
      version: 3,
      stages: [
        { id: 'st-new', name: ' New ', retired: false },
        { id: 'st-screening', name: 'Screening', retired: true, retireTargetId: 'tmp-1' },
        { tempId: 'tmp-1', name: 'Portfolio review', retired: false },
      ],
    };
    expect(stagePlanSaveSchema.parse(body).stages[0]?.name).toBe('New');
  });

  it('rejects a stage with both or neither of id and tempId', () => {
    const both = { id: 'a', tempId: 'b', name: 'X', retired: false };
    const neither = { name: 'X', retired: false };
    for (const stage of [both, neither]) {
      expect(stagePlanSaveSchema.safeParse({ version: 1, stages: [stage] }).success).toBe(false);
    }
  });

  it('rejects a target on an active stage, a bad name, a bad version and unknown keys', () => {
    const bad = [
      { version: 1, stages: [{ id: 'a', name: 'X', retired: false, retireTargetId: 'b' }] },
      { version: 1, stages: [{ id: 'a', name: '  ', retired: false }] },
      { version: -1, stages: [{ id: 'a', name: 'X', retired: false }] },
      { version: 1.5, stages: [{ id: 'a', name: 'X', retired: false }] },
      { version: 1, stages: [{ id: 'a', name: 'X', retired: false, position: 1 }] },
    ];
    for (const body of bad) expect(stagePlanSaveSchema.safeParse(body).success).toBe(false);
  });
});
