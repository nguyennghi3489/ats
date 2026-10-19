export const meta = {
  name: 'build-issues',
  description: 'Coordinator: triage fills the review queue (max 10), then agent:ready issues go implementer → code review → QA → PR',
  whenToUse: 'Plan and build GitHub issues of nguyennghi3489/ats. args: { plan?: boolean (default true), build?: boolean (default true), max?: number (default 3), issues?: number[] (only these), parallel?: number (default 1), merge?: boolean (default true) }',
  phases: [
    { title: 'Track', detail: 'mirror issues and agent progress onto the ATS Agent Runs dashboard' },
    { title: 'Refresh', detail: 'merge main into agent PRs that conflict with it' },
    { title: 'Plan', detail: 'triage tops up needs-review issues to 10 from docs/roadmap.md' },
    { title: 'Pick', detail: 'list agent:ready issues with closed blockers and lock them' },
    { title: 'Triage', detail: 'confirm each issue is still buildable' },
    { title: 'Implement', detail: 'test-first on a branch, in a worktree' },
    { title: 'Review', detail: 'code review, up to 2 fix rounds' },
    { title: 'QA', detail: 'Compose + tests + Playwright, up to 1 fix round' },
    { title: 'Ship', detail: 'open the PR or hand back to a human' },
  ],
}

const REPO = 'nguyennghi3489/ats'
const opts = args || {}
const MAX = opts.max || 3
// ponytail: QA runs Docker Compose on fixed ports, so issues run one at a time by default.
// Raise only after Compose gets per-run project names and ports.
const PARALLEL = opts.parallel || 1

const PICK = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'object', properties: { number: { type: 'number' }, title: { type: 'string' } }, required: ['number', 'title'] } },
    stale: { type: 'array', items: { type: 'number' } },
  },
  required: ['issues'],
}
const TRIAGE = {
  type: 'object',
  properties: { buildable: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['buildable', 'reason'],
}
const IMPL = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, branch: { type: 'string' }, summary: { type: 'string' } },
  required: ['ok', 'branch', 'summary'],
}
const REVIEW = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, problem: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'problem'] } },
  },
  required: ['approved', 'findings'],
}
const QA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    results: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['criterion', 'passed'] } },
    failures: { type: 'string' },
  },
  required: ['passed', 'results'],
}
const CONFLICTS = {
  type: 'object',
  properties: { prs: { type: 'array', items: { type: 'object', properties: { number: { type: 'number' }, branch: { type: 'string' }, issue: { type: 'number' } }, required: ['number', 'branch', 'issue'] } } },
  required: ['prs'],
}
const SHIP = {
  type: 'object',
  properties: { url: { type: 'string' }, merged: { type: 'boolean' }, why: { type: 'string' } },
  required: ['url', 'merged'],
}

const md = (o) => '```json\n' + JSON.stringify(o, null, 2) + '\n```'
const DASHBOARD = 'https://claude.ai/artifact/P8Fx5fYRdF9LmVEK4zomYC'
const ARTIFACT_DATA = `Load the ArtifactData tool with ToolSearch ("select:ArtifactData") if needed. ` +
  `If ArtifactData is not available here, reply "not available" and do nothing else.`

// Dashboard card for one issue: merge `fields` into issues/<n> (state, stage, round, pr, note).
// ponytail: one small agent per update; batch them if dashboard updates show up in token use.
async function card(n, fields) {
  await agent(
    `${ARTIFACT_DATA} Dashboard ${DASHBOARD}, collection "issues", doc_id "${n}". ` +
      `Get the document to learn its version; if it exists, ArtifactData "update" it with if_version and data ${JSON.stringify(fields)}. ` +
      `If it does not exist, read the issue with \`gh issue view ${n} -R ${REPO} --json number,title,labels,url\` and "set" ` +
      `{number, title, url, labels: [label names], step: <N from a roadmap:N label, else 0>} merged with ${JSON.stringify(fields)}. Reply "ok".`,
    { label: `dashboard #${n} ${fields.stage || fields.state}`, phase: 'Track', effort: 'low' },
  )
}

// Mirror every GitHub issue onto the dashboard (picks up labels the owner changed by hand).
async function sync() {
  await agent(
    `${ARTIFACT_DATA} Sync GitHub issues to the dashboard ${DASHBOARD}.\n` +
      `1. \`gh issue list -R ${REPO} --state all --limit 300 --json number,title,labels,state,url\`.\n` +
      `2. For each issue build {number, title, url, labels: [label names], step: <N from its roadmap:N label, else 0>, state}, where state is: ` +
      `closed → "done"; else needs-human → "needs-human"; pr-open → "pr-open"; in-progress → "running"; agent:ready → "agent:ready"; ` +
      `needs-owner or needs-decision → "blocked"; otherwise "needs-review".\n` +
      `3. ArtifactData "list" collection "issues" (query.limit 1000) to get existing documents and versions.\n` +
      `4. Write only new or changed documents (doc_id = the number as text) with ArtifactData "batch" (≤ 50 per call): "update" with if_version for existing ` +
      `documents (this keeps their stage, round, pr and note; when the new state is not "running", also set stage to {"__delete__": true}), "set" for new ones.\n` +
      `Reply "synced <count written>".`,
    { label: 'sync issues to dashboard', phase: 'Track', effort: 'low' },
  )
}

async function handBack(n, phaseName, why) {
  await agent(
    `In ${REPO}, issue #${n}: run \`gh issue edit ${n} -R ${REPO} --remove-label in-progress --add-label needs-human\` ` +
      `and comment on the issue (gh issue comment) with this text, verbatim:\n\nAgent run stopped at **${phaseName}**.\n\n${why}`,
    { label: `hand-back #${n}`, phase: 'Ship', effort: 'low' },
  )
  await card(n, { state: 'needs-human', stage: { __delete__: true }, note: `stopped at ${phaseName}` })
  return { number: n, status: 'needs-human', at: phaseName }
}

async function build(issue) {
  const n = issue.number

  await card(n, { state: 'running', stage: 'triage', round: 1 })
  const tri = await agent(
    `You are the triage agent; follow .claude/agents/triage.md. Do NOT create issues. Check whether ${REPO}#${n} is buildable right now: ` +
      `acceptance criteria and owned files concrete, all blockers closed (\`scripts/agent/forge.sh blockers ${n}\`), no needs-* label, ` +
      `no contradiction with docs/decisions.md. If something is fixable by editing the issue (missing owned files, form format), fix it as triage.md says. ` +
      `Return buildable and the reason.`,
    { label: `triage #${n}`, phase: 'Triage', agentType: 'triage', schema: TRIAGE },
  )
  if (!tri) return handBack(n, 'Triage', 'The triage agent did not return.')
  if (!tri.buildable) return handBack(n, 'Triage', tri.reason)

  await card(n, { stage: 'implement' })
  let impl = await agent(
    `Implement ${REPO}#${n} (${issue.title}). Follow .claude/agents/implementer.md.`,
    { label: `implement #${n}`, phase: 'Implement', agentType: 'implementer', isolation: 'worktree', schema: IMPL },
  )
  if (!impl || !impl.ok) return handBack(n, 'Implement', impl ? impl.summary : 'The implementer did not return.')
  const branch = impl.branch

  let review = null
  for (let round = 0; round < 3; round++) {
    await card(n, { stage: 'review', round: round + 1 })
    review = await agent(
      `Review branch \`${branch}\` for ${REPO}#${n}. Follow .claude/agents/code-reviewer.md.`,
      { label: `review #${n} r${round + 1}`, phase: 'Review', agentType: 'code-reviewer', schema: REVIEW },
    )
    if (!review) return handBack(n, 'Review', 'The reviewer did not return.')
    if (review.approved || round === 2) break
    const blockers = review.findings.filter((f) => f.severity === 'blocker')
    impl = await agent(
      `Branch \`${branch}\` of ${REPO}#${n} failed code review. Fix every blocker below on that branch and push. Follow .claude/agents/implementer.md.\n\n${md(blockers)}`,
      { label: `fix review #${n} r${round + 1}`, phase: 'Review', agentType: 'implementer', isolation: 'worktree', schema: IMPL },
    )
    if (!impl || !impl.ok) return handBack(n, 'Review fixes', impl ? impl.summary : 'The implementer did not return.')
  }
  if (!review.approved) return handBack(n, 'Review', `Still not approved after 2 fix rounds.\n\n${md(review.findings)}`)

  let qa = null
  for (let round = 0; round < 2; round++) {
    await card(n, { stage: 'qa', round: round + 1 })
    qa = await agent(
      `Verify branch \`${branch}\` for ${REPO}#${n}. Follow .claude/agents/qa.md.`,
      { label: `qa #${n} r${round + 1}`, phase: 'QA', agentType: 'qa', isolation: 'worktree', schema: QA },
    )
    if (!qa) return handBack(n, 'QA', 'The QA agent did not return.')
    if (qa.passed || round === 1) break
    impl = await agent(
      `Branch \`${branch}\` of ${REPO}#${n} failed QA. Fix the application code so every criterion passes, on that branch, and push. Follow .claude/agents/implementer.md.\n\n${md(qa)}`,
      { label: `fix qa #${n}`, phase: 'QA', agentType: 'implementer', isolation: 'worktree', schema: IMPL },
    )
    if (!impl || !impl.ok) return handBack(n, 'QA fixes', impl ? impl.summary : 'The implementer did not return.')
  }
  if (!qa.passed) return handBack(n, 'QA', `QA still failing after 1 fix round.\n\n${md(qa)}`)

  await card(n, { stage: 'ship', round: 1 })
  const pr = await agent(
    `Open a pull request in ${REPO} from branch \`${branch}\` into main with \`gh pr create\`. Title: "${issue.title}". ` +
      `Body: a short summary of the change, "Closes #${n}", then a "QA" section with this per-criterion table and a "Review" section listing remaining nits.\n\n` +
      `QA:\n${md(qa.results)}\n\nReview nits:\n${md(review.findings)}\n\n` +
      `End the body with: 🤖 Generated with [Claude Code](https://claude.com/claude-code)\n` +
      `Then run \`gh issue edit ${n} -R ${REPO} --remove-label in-progress --add-label pr-open\`.\n` +
      // The owner auto-merges PRs that passed review and QA (docs/decisions.md §15); needs-human issues wait for them.
      (opts.merge === false
        ? `Never merge. Return the PR URL and merged false.`
        : `Then merge it: wait for checks with \`gh pr checks <PR> -R ${REPO} --watch\` (if it says no checks are reported, go on). ` +
          `If every check passed and \`gh pr view <PR> -R ${REPO} --json mergeable\` is MERGEABLE, run \`gh pr merge <PR> -R ${REPO} --merge\` ` +
          `and \`gh issue edit ${n} -R ${REPO} --remove-label pr-open\`. Otherwise leave the PR open. ` +
          `Return the PR URL, merged true/false, and why when not merged.`),
    { label: `pr #${n}`, phase: 'Ship', effort: 'low', schema: SHIP },
  )
  if (!pr) return handBack(n, 'Ship', 'Opening the PR failed.')
  if (!pr.merged && opts.merge === false) {
    await card(n, { state: 'pr-open', stage: { __delete__: true }, pr: pr.url })
    return { number: n, status: 'pr-open', pr: pr.url }
  }
  if (!pr.merged) return handBack(n, 'Ship', `PR ${pr.url} is open but was not merged: ${pr.why || 'no reason given'}.`)
  await card(n, { state: 'done', stage: { __delete__: true }, pr: pr.url })
  return { number: n, status: 'merged', pr: pr.url }
}

const mode =opts.plan === false ? 'build' : opts.build === false ? 'plan' : 'plan+build'
let created = 0

// One row per run in the "ATS Agent Runs" dashboard (collection `runs`).
async function finish(built) {
  const row = { mode, planned: created, built, tokens: budget.spent() }
  if (budget.total) row.budget = budget.total
  phase('Track')
  await sync()
  log(`${Math.round(budget.spent() / 1000)}k output tokens this run` + (budget.total ? ` of ${Math.round(budget.total / 1000)}k budget` : ''))
  const ok = await agent(
    `Log this coordinator run to the dashboard. Load the ArtifactData tool with ToolSearch ("select:ArtifactData") if needed. ` +
      `Get the current UTC time with \`date -u +%Y-%m-%dT%H:%M:%SZ\`. Then call ArtifactData with action "set", url "${DASHBOARD}", ` +
      `collection "runs", doc_id "run-<that time with ':' replaced by '-'>", and data = this object plus "at": <that time>:\n` +
      md(row) + `\nIf ArtifactData is not available here, reply "not logged" and do nothing else. Otherwise reply "logged".`,
    { label: 'log run to dashboard', phase: 'Ship', effort: 'low' },
  )
  if (!ok || !/^logged/i.test(ok.trim())) log(`Run not logged to the dashboard (${ok || 'no reply'}).`)
  return { built, planned: created, tokens: budget.spent() }
}

phase('Track')
await sync()

// Open agent PRs go stale when a sibling merges first (shared README.md, pnpm-lock.yaml).
// ponytail: merge, never rebase, so nobody's checkout of the branch is rewritten.
phase('Refresh')
const stale = await agent(
  `In ${REPO}: list open PRs whose head branch starts with "issue-" and whose \`gh pr view N -R ${REPO} --json mergeable\` is CONFLICTING ` +
    `(if UNKNOWN, wait 5 seconds and ask once more). For each return the PR number, head branch and the issue number from "Closes #N" in its body.`,
  { label: 'find conflicting PRs', phase: 'Refresh', effort: 'low', schema: CONFLICTS },
)
for (const p of stale ? stale.prs : []) {
  const fix = await agent(
    `PR #${p.number} (branch \`${p.branch}\`, ${REPO}#${p.issue}) conflicts with main. Merge origin/main into the branch (never rebase or force-push). ` +
      `Resolve pnpm-lock.yaml by taking main's version and running \`pnpm install\`; in text files keep both sides. ` +
      `Run lint, typecheck, test and build; all must pass. Commit the merge and push. Follow .claude/agents/implementer.md. ` +
      `If a conflict cannot be resolved without guessing what either side meant, push nothing and say which files and why.`,
    { label: `refresh PR #${p.number}`, phase: 'Refresh', agentType: 'implementer', isolation: 'worktree', schema: IMPL },
  )
  if (!fix || !fix.ok) await handBack(p.issue, 'Refresh', `PR #${p.number} conflicts with main. ${fix ? fix.summary : 'The implementer did not return.'}`)
  else log(`PR #${p.number} merged with main and pushed.`)
}

if (opts.plan !== false) {
  phase('Plan')
  const planned = await agent(
    `You are the triage agent; follow .claude/agents/triage.md, section "Filling the review queue". ` +
      `Top up the open needs-review issues to at most 10 with the next small, parallel issues from docs/roadmap.md. ` +
      `Return how many issues you created and the reply lines triage.md asks for (or "queue full" / "roadmap covered").`,
    { label: 'triage: fill review queue', phase: 'Plan', agentType: 'triage', schema: {
      type: 'object', properties: { created: { type: 'number' }, report: { type: 'string' } }, required: ['created', 'report'] } },
  )
  created = planned ? planned.created : 0
  log(planned ? planned.report : 'Triage did not return.')
}
if (opts.build === false) return finish([])

phase('Pick')
const picked = await agent(
  // ponytail: stale locks (in-progress left by a killed run) are only reported, never cleared here,
  // because a concurrent run may own them. A human removes the label.
  `In ${REPO}: list open issues labelled \`agent:ready\` and NOT labelled ` +
    `in-progress, pr-open, needs-human, needs-owner or needs-decision. Keep only those whose blockers are all closed ` +
    `(\`scripts/agent/forge.sh blockers N\` prints "<number> <state>"). ` +
    (opts.issues ? `Keep only issues ${JSON.stringify(opts.issues)}. ` : '') +
    `Sort by milestone (M1 Core hiring loop, then M2 Complete v1, then Later), then by number. Take the first ${MAX}. ` +
    `For each taken issue run \`gh issue edit N -R ${REPO} --add-label in-progress --remove-label needs-review\` (the lock). ` +
    `Also return \`stale\`: numbers of open issues labelled in-progress whose last update is older than 6 hours. Return them.`,
  { label: 'pick + lock', phase: 'Pick', effort: 'low', schema: PICK },
)
if (picked && picked.stale && picked.stale.length) {
  log(`Possibly stale locks (in-progress > 6 h): ${picked.stale.map((n) => '#' + n).join(', ')} — remove the label by hand if no run owns them.`)
}
const queue = picked ? picked.issues : []
if (!queue.length) {
  log('No agent:ready issue with closed blockers. Nothing to build.')
  return finish([])
}
log(`Building ${queue.map((i) => '#' + i.number).join(', ')} (${PARALLEL} at a time)`)

const results = []
for (let i = 0; i < queue.length; i += PARALLEL) {
  const batch = await parallel(queue.slice(i, i + PARALLEL).map((issue) => () => build(issue)))
  batch.forEach((r, j) => results.push(r || { number: queue[i + j].number, status: 'crashed' }))
  log(`after ${results.length}/${queue.length} issues: ${Math.round(budget.spent() / 1000)}k output tokens so far`)
}
return finish(results)
