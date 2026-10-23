# Plan: Setup (Milestone 0)

**Source PRD**: docs/prd/hulog.prd.md
**Selected Milestone**: 0. Setup
**Complexity**: Small

## Summary
Create a Next.js 15 + TypeScript + Tailwind skeleton with Vitest, an MIT license, safe secret handling (`.env.example` committed, real `.env*` ignored), and a Render blueprint so the empty app can be deployed. Account steps (Devpost, PayPal sandbox app, GitHub repo, Render service) are done by the user.

## Patterns to Mirror
No existing code. Conventions come from the `create-next-app@15` template (App Router, `@/*` import alias, no `src/` dir so `lib/` sits at root as PLAN.md expects).

## Files to Change
| File | Action | Why |
|---|---|---|
| Next.js template files (`app/`, `package.json`, configs) | CREATE | App skeleton |
| `app/page.tsx` | UPDATE | Replace template boilerplate with a Hulog placeholder landing |
| `.gitignore` | UPDATE | Keep `.env*` ignored but allow `.env.example`; ignore `.claude/` and `CLAUDE.md` |
| `.env.example` | CREATE | Documents required env vars with empty values |
| `LICENSE` | CREATE | MIT (hackathon requirement) |
| `README.md` | UPDATE | Stub following PLAN.md §14 outline |
| `render.yaml` | CREATE | One-click Render deploy |
| `docs/PLAN.md` | CREATE | Copy of the source plan, kept with the repo |

## Tasks
### Task 1: Scaffold
- **Action**: `create-next-app@15` with TS, Tailwind, ESLint, App Router, npm; add `vitest` dev dependency and a `test` script.
- **Validate**: `npm run build` succeeds.

### Task 2: Repo hygiene
- **Action**: LICENSE, `.env.example`, `.gitignore` tweaks, README stub, render.yaml.
- **Validate**: `git check-ignore .env.local` matches; `git check-ignore .env.example` does not.

### Task 3: Review + commit
- **Action**: code review + security check (secrets, ignore rules), `git init`, first commit on `main`.
- **Validate**: `git ls-files` shows no `.env`, no `.claude/`.

## Validation
```powershell
npm run build
npm test
git ls-files
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Folder name has spaces/caps, invalid npm package name | High | Scaffold as `hulog` in a temp dir, copy files in |
| Next template ignores `.env.example` via `.env*` | High | Add `!.env.example` |
| Render free tier sleeps after inactivity, slow first load for judges | Medium | Note in README; consider a paid instance or keep-warm before judging |

## Acceptance
- [ ] Build passes, test script runs
- [ ] No secrets or `.claude/` tracked
- [ ] User has the steps for Devpost, PayPal sandbox, GitHub, Render
