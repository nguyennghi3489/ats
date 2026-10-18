# ATS — Build decisions (v1)

Decisions agreed on 2026-10-18 while reviewing the product design file ("ATS — Product Design", pages 00–10).
The design file stays authoritative for screens, copy and behaviour; this document records what the design
left open, what changed, and what is out of v1. Where this file and the design disagree, this file wins.

## 1. Stack and repository

- pnpm monorepo:
  - `apps/api` — NestJS. The BullMQ worker is the same codebase started in worker mode.
  - `apps/web` — Vue 3 + Vite SPA for recruiters. No SEO needs (everything is behind login).
  - `packages/shared` — Zod schemas and types shared by api and web.
  - `apps/careers` (Nuxt, server-rendered) — **deferred**, built with the careers site.
- Database: PostgreSQL.
- Queue: BullMQ + Redis (CV processing, email, cleanup jobs).
- Files: S3 API. versitygw locally and in production for v1; migrate to DO Spaces / S3 when customers arrive
  (`rclone sync` + env change).
- Email: Resend over SMTP in production, Mailpit in local Compose. Sent through the queue with retries.
  Plain HTML + text templates rendered in Nest (no React Email).
- No AI SDK in the frontends.

## 2. Authentication and sessions

- Better Auth with the organization plugin (workspaces, members, roles, invitations).
- Sign-in methods in v1: email + password, Google, LinkedIn (OpenID Connect).
  - Design shows Microsoft instead of LinkedIn — designer to swap the button.
  - Microsoft and passkeys: later. Buttons for disabled providers are hidden.
  - Same email never links accounts automatically; linking comes later from account settings.
- Sessions stored in Postgres. **Better Auth cookie cache is disabled.**
- Timings:

| Rule | Value |
|---|---|
| Email verification link | 24 h |
| Password reset link | 1 h, single use |
| Workspace invite | 7 days |
| Resend email | disabled 60 s after each send; max 5/hour per email; new link invalidates the old |
| Failed sign-ins | 10 per 15 min per IP + email, then temporarily blocked |
| Session lifetime | 30 days, extended on use |
| Inactivity logout | none in v1 |
| Session-loss warning | only when the API reports expiry → "Phiên đăng nhập đã hết hạn" → sign in → return to the same page |
| Password reset | signs out all other sessions |

## 3. Authorization

- One global NestJS guard (`APP_GUARD`) runs on every route; routes opt out only with `@Public()`.
  It loads session + membership (status, role) for the active workspace in one query and attaches
  `{ user, workspaceId, role }` to the request.
- All access resolution goes through one function (e.g. `resolveAccess(sessionToken, workspaceId)`)
  so a Redis cache can be added later without touching callers. No cache in v1.
- Record-level rules are filters inside the data query (never a separate check), defined in one
  `access` module (`visibleJobsFilter(actor)`, `canEditJob(actor, job)`, ...).
- Hidden records behave exactly like missing ones: no counts, no hints, same "unavailable" response.
- Deactivation or role change applies on the user's next request. On `WORKSPACE_ACCESS_REVOKED` the web
  app clears that workspace's cached data and routes to the workspace chooser (or workspace creation).

### Roles

| Capability | Admin | Recruiter | Collaborator |
|---|---|---|---|
| Normal jobs | all | all | assigned only, read-only |
| Restricted jobs | all | assigned only | assigned only, read-only |
| Edit job (content, plan, stages, status, budget) | yes | **any job they can access** | no |
| Change access scope | yes | no | no |
| Manage assignments | yes | normal jobs only | no |
| Members & workspace settings | yes | no | no |
| Candidates page, create candidates, upload CVs | yes | yes | no |
| Profile CVs | yes | yes | no |
| Application CV | all versions | all versions | current version only, assigned jobs |
| Add application, move stage, record outcome, void | yes | yes | no |
| Unvoid | yes | no | no |
| Profile notes | add | add | no |
| Application notes | add, choose audience | add, choose audience | add, fixed audience |
| Erase personal data | yes | no | no |

Support mode (read-only impersonation) is **out of v1**.

## 4. Workspaces and members

- Settings → Thành viên (admin only): list (name, email, role, status: Active / Invited / Deactivated).
- Invite by email + role; link valid 7 days; resend (invalidates old link) and revoke.
- Accepting requires signing in or up with the invited email.
- Change role: admin only, immediate.
- Deactivate (no hard delete): access stops on next request, job assignments removed in the same
  transaction, name kept on history, can be reactivated.
- Cannot deactivate or demote the last admin; cannot deactivate yourself.
- Workspace settings also hold the workspace name and the "Cho phép trích xuất nâng cao" toggle (shown only
  when the Claude fallback env flag is on).

## 5. Jobs

### Lifecycle

```
"Tạo vị trí" (title only) → Bản nháp (Draft)
Draft  → Open        needs title + ≥1 active stage
Open  ⇄ Paused
Open / Paused → Closed   (confirm)
Closed → Open        (reopen)
Draft with 0 applications → delete. Everything else is never deleted.
```

| Status | Edit | New applications | Move existing applications | In list by default |
|---|---|---|---|---|
| Draft | yes | no | — | yes |
| Open | yes | yes | yes | yes |
| Paused | yes | no | yes | yes |
| Closed | yes | no | yes | no (status filter) |

Status changes: admins and recruiters who can edit the job. Actions live in "Thao tác tuyển dụng".

### Codes

- Job: `{PREFIX}-{NNN}` (e.g. `AN-001`). Prefix = workspace name initials without diacritics, set once at
  workspace creation, not editable. Application: `ỨT-{NNN}`.
- Per-workspace counters in `workspace_counters`, incremented with `UPDATE … RETURNING` in the same
  transaction as the insert. At least 3 digits, never reused, never edited.

### Fields

- Owner ("Người phụ trách"): optional, admins and recruiters only, defaults to the creator, grants no access,
  label helper "Chỉ để hiển thị — không cấp quyền truy cập". `created_by` is stored separately.
- Location: ISO 3166 country (static list in `packages/shared`) + optional free-text city per location row.
  City required → country required; duplicates rejected. City autocomplete and the jobs-list "Địa điểm"
  filter come from `SELECT DISTINCT` over the workspace's job locations, compared case- and
  diacritic-insensitively (first-saved spelling shown). No Location table.
- Employment type: Toàn thời gian, Bán thời gian, Hợp đồng, Thực tập, Thời vụ.
- Work mode: Tại văn phòng, Kết hợp, Từ xa.
- Currencies: VND, USD. Pay periods: tháng, năm, giờ.
- Description: Tiptap editor, stored as sanitised HTML.

### Out of v1

Publishing tab (Đăng tuyển), publish badge, careers site, questionnaires.

## 6. Stages and outcomes

- New jobs get four stages, named in the creator's language: Mới → Sơ loại → Phỏng vấn → Đề nghị
  (New → Screening → Interview → Offer). Constant in code, no template screen.
- Stages are data: renamed per job, never translated per viewer.
- Outcomes are not stages: Đang hoạt động, Đã tuyển, Không tuyển, Rút lui. An application shows
  stage + outcome, e.g. "Phỏng vấn · Không tuyển". No sub-states inside a stage in v1.
- Quy trình tab: rename, reorder, add, retire, restore are all drafts until the tab's **Save**; Cancel
  discards everything. Save runs in one transaction and re-checks: moves all candidates active in a retired
  stage at that moment, target still active, ≥1 active stage, stale-version rejection ("Tải lại").
  Each moved application gets a history event.
- Retire dialog warns when the target is earlier than the retired stage.
- Moving an application:
  - next stage → immediate, optional note;
  - skipping stages or moving backward → confirm popup (from → to, skipped stages, optional note);
  - skipped stages are never recorded as passed.

### Kanban ("Bảng quy trình")

- One column per active stage.
- While dragging, outcome drop zones appear (Đã tuyển / Không tuyển / Rút lui) and open the designed
  outcome dialog (note required for Không tuyển).
- Finished applications leave the board; toggle "Hiện lượt đã kết thúc" shows them greyed in the stage where
  they ended. Column headers may show "N đang xử lý · M không tuyển".

## 7. Candidates

### Profile schema (one Zod schema used by DB, API, forms and extraction)

| Section | Shape |
|---|---|
| Basic | full name *, email?, phone?, city?, country? (email/phone not unique) |
| Links | `{label, url}[]` |
| Experience | `{title, company, startMonth, endMonth \| current, description}[]` |
| Education | `{school, degree, field, startYear, endYear}[]` |
| Skills | `{name, level?}[]`, level ∈ Cơ bản / Trung cấp / Nâng cao / Chuyên gia |
| Languages | `{language, level?}[]`, level free text |
| Other | `{type: certification \| project \| award \| publication, title, detail?}[]` |

Basic fields are columns; lists are JSONB. Never stored: date of birth, home address, photo.

### CVs

- Profile CV: belongs to the person. "Tải CV mới" uploads a new version (no extraction in v1) and makes it
  current; older versions kept.
- Application CV: belongs to one application.
  - Add-application flow has "Đính kèm CV đang dùng của hồ sơ vào lượt ứng tuyển này", checked by default
    when the profile has a CV.
  - "Đính kèm CV" on the application picks any profile CV version (attach or replace).
  - History in append-only `application_cv_attachments`; current = latest row; "Lịch sử CV" shown to admins
    and recruiters.
- Files are never deleted from storage while referenced (except by erase).

### Erase personal data

Admin-only action on an **archived** profile, confirmed by typing the candidate's name, irreversible:
- profile becomes "Ứng viên đã xóa #N"; all personal fields cleared;
- all CV files deleted from storage (profile, application, pending);
- note content, edit history and extraction drafts wiped;
- applications kept (job, stage, outcome, dates) so counts stay correct;
- audit entry without personal data.

## 8. CV extraction ("Tạo từ CV")

- Uploaded only by admins and recruiters. PDF and DOCX only, ≤ 10 MB, one file. No `.doc`, no images,
  no OCR. Scanned PDFs → "Không đọc được nội dung tệp — nhập thông tin thủ công".
- Pipeline (BullMQ worker):
  1. file checks: type, size, password protection, ClamAV scan;
  2. docling-serve (self-hosted container) → Markdown;
  3. local rule-based extraction (`extractCv(markdown)`): section headings (vi/en), regex for email, phone,
     links, dates;
  4. optional Claude fallback (below);
  5. every email/phone/link must appear in the Docling text, otherwise dropped;
  6. save draft for the review step.
- Claude fallback runs only when **all** are true:
  - env `CV_CLAUDE_FALLBACK_ENABLED=true` (default `false`; `ANTHROPIC_API_KEY` needed only then);
  - workspace setting "Cho phép trích xuất nâng cao" is on (default off, admin opt-in);
  - local result is weak (no experience and no education found, or fewer than 2 fields).
  Before sending, email, phone, links and the detected name are replaced with placeholders and restored
  locally afterwards. Only text is sent, never the file. Each call is audit-logged (never the content).
- Before enabling the fallback: test local extraction on 50 real CVs.
- Operating rules:

| Rule | Value |
|---|---|
| Docling timeout | 60 s |
| Claude timeout | 60 s |
| Automatic retries | 3 (10 s → 30 s → 90 s) |
| Not retried | wrong type, > 10 MB, password-protected, no readable text, virus |
| After retries | failed → "Thử xử lý lại / Tải tệp khác" (manual retry = new run, 3 more retries) |
| Pending expiry | 24 h after last activity |
| Cancel | delete immediately |
| Pending per recruiter | 10 |

## 9. Applications

- Source: optional fixed category + optional free-text detail (autocomplete from earlier values).
  Categories: Giới thiệu nội bộ, TopCV, ITviec, VietnamWorks, LinkedIn, Facebook / Mạng xã hội,
  Đơn vị tuyển dụng, Sự kiện tuyển dụng, Ứng viên tự liên hệ, Khác. Default empty.
- Evaluation ("Đánh giá", scorecards) is out of v1; interview feedback goes in application notes.

## 10. Notifications (in-app)

- Bell with unread count in the top bar.
- Events: stage changed, outcome recorded (hired / rejected / withdrawn / restored / voided),
  application added.
- Recipients: the job owner + admins and recruiters assigned to the job. Never collaborators, never the
  actor.
- Notification rows written in the same transaction as the application event.
- Click opens the application with permissions re-checked.
- Web app polls every 60 s and on tab focus. No WebSockets.
- Per-user read state, "mark all as read". Kept 90 days.
- No email notifications in v1.

## 11. Search

- Postgres only: `unaccent(lower(field)) ILIKE '%' || unaccent(lower(q)) || '%'`.
- Phones compared as digits; codes match with or without dash/prefix.
- Permission filters in the same query. 25 per page, 300 ms debounce.
- No trigram index or search engine until a real customer is slow.

## 12. Language and formatting

- Vietnamese and English in v1 (vue-i18n, `vi.json` / `en.json`). The API returns error codes; the web
  app translates them.
- Language saved per user (account menu, next to theme). Default: browser language if vi/en, else vi.
  Pre-sign-in pages have a VI / EN switch.
- Emails in the recipient's language; invites use the inviter's language.
- Fixed values (statuses, outcomes, source categories) are translated; stage names are not.
- Dates `dd/mm/yyyy` in both languages. Money uses locale grouping (`25.000.000 VND` / `25,000,000 VND`).
- English copy needs human review.

## 13. Other v1 defaults

- Phone masking in lists is display-only; full number on the profile.
- Personal settings: name, change password, language, theme.
- Audit log written for sensitive actions (role change, deactivation, scope change, erase, CV attach,
  Claude calls). No viewer screen.
- Reports nav item hidden.
- Error tracking: Sentry (free tier) + Docker logs.

## 14. Hosting

- One DigitalOcean Droplet (SGP1, 4 vCPU / 8 GB) running Docker Compose: api, worker, docling-serve,
  redis, postgres, versitygw, Caddy (HTTPS + static web build).
- Compose memory limits (roughly: Postgres 2 GB, Docling 3 GB, rest for api/worker/redis).
- Postgres data on a named volume; disk alert at 80%.
- Backups (mandatory):
  - DO Droplet Backups enabled (daily if available) — the off-machine copy of DB and files;
  - nightly `pg_dump` (14 daily + 8 weekly) for quick undo;
  - restore test before go-live, then monthly.
- CI: GitHub Actions — lint, typecheck, tests, build images, deploy over SSH.

### Tests

- Unit: `access` rules, stage/outcome rules.
- Integration: API against real Postgres in Docker.
- E2E (Playwright): sign up → create job → add candidate from CV → move through stages → hire.

## 15. Build process

- Issues are small vertical slices with acceptance criteria and "blocked by" links.
- Labels: `needs-review` → (human approves) `ready` → `in-progress` → `pr-open` | `needs-human` → closed.
  `in-progress` acts as a lock so concurrent runs never take the same issue.
- Per issue: implementer (own worktree, TDD) → reviewer (max 2 fix loops) → QA (Compose + Playwright on
  acceptance criteria) → PR "Closes #N".
- Day: manual Claude Code workflow (machine must stay on). Night: scheduled cloud agent (verify it can run
  the QA stack first).
- Agents never merge. A human reviews and merges every PR.

## 16. Out of v1

Careers site and apply form, publishing tab, questionnaires, evaluation/scorecards, support mode,
Microsoft sign-in, passkeys, provider linking, reports, email notifications, audit log viewer,
in-stage sub-states, OCR / images / `.doc`.

Deferred careers-site notes: public URL `/jobs/{slug}-{code}` looks jobs up by code (old slugs redirect);
workspaces without a custom domain need a unique workspace handle (workspace names are not unique).

## 17. Open items (owner's side)

- Legal sign-off: data stored in Singapore; Claude fallback (cross-border transfer, Decree 13 / PDPL).
- English copy review.
- Designer updates: LinkedIn button, skill levels, "Tải CV mới" / "Đính kèm CV" / attach checkbox,
  CV history, notification bell, move-confirm popup, retire-target warning, erase action, language switch.
