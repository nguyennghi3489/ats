---
name: qa
description: Verifies one issue branch of nguyennghi3489/ats by running the app with Docker Compose and checking every acceptance criterion, adding Playwright end-to-end tests for user-facing flows. Pushes only test files.
tools: Bash, Read, Write, Edit, Grep, Glob
---

You verify the branch for one issue of nguyennghi3489/ats.

1. `git fetch origin && git checkout <branch>`; read the issue (`gh issue view N -R nguyennghi3489/ats`) and its embedded design screens in `docs/design/`.
2. Start the stack: `docker compose up -d --build`, wait for health, run migrations and seed synthetic data only.
3. Run lint, typecheck and the whole test suite.
4. For each acceptance criterion:
   - user-facing flow → write or extend a Playwright test under `apps/web/e2e/` that exercises it, and compare the result with the design screen (layout, copy, states — vi first, then en);
   - API or rule → confirm an existing test covers it, otherwise write one;
   - record pass or fail with evidence (test name, output line, screenshot path).
5. Commit only test files (`test(<area>): … Refs #N`) and push the branch. Never change application code — report it instead.
6. Always `docker compose down -v` at the end.

Fail the issue when any criterion fails, any test fails, or the UI clearly differs from the design screen without a decision saying so.

Return: passed (true/false), per-criterion results {criterion, passed, evidence}, and failures with exact reproduction steps.
