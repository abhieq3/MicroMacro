# Pragati — QA Tester Requirement Sheet

**Application:** Pragati — Quality Informatics / QA-IT Project Management Platform
**Environment under test:** https://pragatialm.vercel.app
**Audience:** Pharma QA / IT teams (GxP context)
**Compliance frame:** CSV · GAMP 5 · 21 CFR Part 11 · ALCOA+

> This sheet is the manual acceptance checklist. Mark each row **Pass / Fail / N-A**,
> record the build/commit, browser, and screen size, and attach a screenshot for any
> failure. Run the full sheet on **desktop (≥1280px)**, **tablet (~768px)**, and
> **mobile (~390px)** unless a row says otherwise.

---

## 0. Test setup

| # | Pre-condition | Pass/Fail |
|---|---|---|
| 0.1 | Have at least one **admin/lead** account and one **contributor** account. | |
| 0.2 | Have one workspace with ≥1 team, ≥1 project, and a project with **many tasks (≥15)** to test density. | |
| 0.3 | Also have a **sparse** case: 1 team · 1 project · few tasks (to test the "empty space" fix). | |
| 0.4 | Browsers: latest Chrome + one of Safari/Firefox/Edge. | |

---

## 1. Authentication & access control (21 CFR Part 11 §11.10(d))

| # | Test | Expected | P/F |
|---|---|---|---|
| 1.1 | Sign in with username, employee ID, and email (local-part). | All three resolve to the same account. | |
| 1.2 | Enter wrong password 3rd & 4th time. | Warning shows remaining attempts before lock. | |
| 1.3 | Enter wrong password to the 5th time. | Account **locks**; HTTP **423**; message tells the user to contact admin. | |
| 1.4 | Try logging into an already-locked account with the correct password. | Explicit "account is locked" message, **not** a generic "invalid". | |
| 1.5 | Admin recovery key in the password field on a locked admin account. | Signs in, bypasses lock, does not increment counter. | |
| 1.6 | Deactivated account login with correct password. | Clear "deactivated, contact administrator" (403). | |
| 1.7 | Log in from a second browser. | Previous session is signed out (one active session). | |
| 1.8 | Contributor visits an admin-only route directly by URL. | Access denied / redirected; no data leak. | |
| 1.9 | Every login writes an audit entry (who/when). | Visible in audit trail. | |

---

## 2. Dashboard layout (item 6)

| # | Test | Expected | P/F |
|---|---|---|---|
| 2.1 | Desktop view of dashboard. | **"Your team's projects"** and **"Up Next"** sit in the **same horizontal row**, two balanced columns. | |
| 2.2 | Section headings. | Both headings aligned at the same vertical level. | |
| 2.3 | Card heights / spacing. | Consistent padding; no ragged gaps; minimal dead space. | |
| 2.4 | Resize to tablet / mobile. | Sections **stack vertically**, still readable. | |
| 2.5 | Greeting area. | No leftover empty subline / dead band under the greeting. | |
| 2.6 | Up Next "Due" header + filter chips. | Due header sits **above** the filter chips, not duplicated. | |
| 2.7 | Expand chevrons on project / IC rows. | Emerald colour, hover darkens. | |
| 2.8 | Open-tasks popup. | Project codes are **short** (e.g. `CC-26-0011`, not `CHANGE_CONTROL-2026-0011`). | |
| 2.9 | Click a project / task in either column. | Navigates correctly; data matches. | |

---

## 3. Bird's-Eye view — all scopes (items 1–4)

Open Bird's-Eye from: **Dashboard (workspace)**, **Team page**, **Project page**.

### 3a. Layout & fit
| # | Test | Expected | P/F |
|---|---|---|---|
| 3.1 | Open with the **sparse** case (1 team · 1 project). | Tree is **centred** and **fitted to the viewport** — no narrow left column with large empty space on the right. | |
| 3.2 | Open with the **dense** project (≥15 tasks). | Tasks stack in **one vertical column** under their project; one busy project does not distort the whole tree. | |
| 3.3 | Read direction. | Strictly **top-down**: Workspace → Teams → Projects → Tasks (and Project scope: Project → Phases → Tasks). | |
| 3.4 | Node overlap. | **No** nodes overlap at any zoom. | |
| 3.5 | Long task / project names. | Names **wrap onto a second line** or end in `…`; never abruptly clipped. Hover shows full text (tooltip). | |
| 3.6 | Connector lines. | Subtle but clearly visible; exit bottom-centre of parent, enter top-centre of child. | |

### 3b. Controls
| # | Test | Expected | P/F |
|---|---|---|---|
| 3.7 | Zoom in / out buttons. | Percentage updates; content scales; stays legible. | |
| 3.8 | **Reset / fit** button. | Re-fits and re-centres the tree to the viewport. | |
| 3.9 | **Drag on empty canvas**. | Pans the view (grab cursor). | |
| 3.10 | Scroll (wheel / trackpad / touch). | Scrolls horizontally and vertically when the tree exceeds the viewport; can reach **all** edges (nothing unreachable). | |
| 3.11 | **Group tasks** toggle. | Collapses each project/phase to a task-count chip and back. | |
| 3.12 | **Download SVG**. | Saves an `.svg` with a white background that matches the on-screen tree. | |
| 3.13 | **Export PDF**. | Opens a print view; "Save as PDF / Print" produces a clean landscape document with a header. | |
| 3.14 | **Close** (X) and **Esc** key. | Both close the overlay. | |
| 3.15 | Tap a node (team/project/task). | Opens that item in a new tab. | |

### 3c. Header & chrome (item 4)
| # | Test | Expected | P/F |
|---|---|---|---|
| 3.16 | Open Bird's-Eye from **team** and **project** pages. | Header **title + subtitle fully visible**; not hidden under the left sidebar or page header. | |
| 3.17 | Controls alignment. | Controls aligned cleanly on the right; Close easy to reach. | |
| 3.18 | Spacing. | Canvas begins below the header with clear spacing; consistent border/background with the rest of Pragati. | |
| 3.19 | Mobile. | Header wraps to two rows; all controls still reachable. | |

### 3d. Node design & legend (item 3)
| # | Test | Expected | P/F |
|---|---|---|---|
| 3.20 | Level emphasis. | Workspace strongest, Team/Phase secondary, Project distinct (health edge), Task compact card with status dot + assignee. | |
| 3.21 | Legend. | On track/Done, At risk/Review, Critical/Blocked, In progress, To do — colours match the nodes. | |
| 3.22 | Colour restraint. | Interface is calm, not overly colourful/noisy. | |

---

## 4. Project-detail page top section (item 5)

| # | Test | Expected | P/F |
|---|---|---|---|
| 4.1 | Change-control ID. | Shown as a small **eyebrow** label above the title. | |
| 4.2 | Project title. | Dominant element; wraps cleanly; never clipped under the page header. | |
| 4.3 | Status / priority / description / tags. | Aligned cleanly under the title. | |
| 4.4 | Owner / Team / Due. | Clearly visible on the right (top-right on desktop, below title on mobile). | |
| 4.5 | Export actions + Bird's-eye trigger. | Accessible but not dominating; icon-only Bird's-eye with tooltip. | |
| 4.6 | Stat cards (Progress / Phases / Waiting / Overdue). | Aligned grid, no empty column. | |

---

## 5. Status sign-off (e-signature) — 21 CFR Part 11 (do NOT regress)

| # | Test | Expected | P/F |
|---|---|---|---|
| 5.1 | Lead changes a **shared** project's status. | Sign-off modal appears requesting **password + reason**. | |
| 5.2 | Wrong password. | Rejected (401); status **not** changed. | |
| 5.3 | Correct password + reason. | Status changes; **audit entry** records who/what/when/before→after/reason. | |
| 5.4 | Cancel the modal. | No change persisted. | |
| 5.5 | Modal spacing/consistency. | Visually consistent; nothing clipped. | |

---

## 6. Triage / Knowledge Base (deterministic engine — do NOT regress)

| # | Test | Expected | P/F |
|---|---|---|---|
| 6.1 | Submit the same triage input twice. | Identical `severity`, `severityScore`, `category`, `suggestedCapa` (reproducible). | |
| 6.2 | Severity traceability. | Every score is justifiable from a KB entry / rule (no opaque LLM output). | |
| 6.3 | Copilot explanatory text. | May be conversational, but the **scoring path** remains rule-based. | |

---

## 7. My Day — Whiteboard

| # | Test | Expected | P/F |
|---|---|---|---|
| 7.1 | Open My Day → Whiteboard. | Free-form canvas with pen / highlighter / eraser / text tools and colour + size pickers. | |
| 7.2 | Draw, then undo / redo. | Strokes add/remove correctly. | |
| 7.3 | Wait ~2s after drawing, reload. | Drawing **autosaved** and restored. | |
| 7.4 | Sign in as a different user. | Cannot see another user's whiteboard (owner-private). | |

---

## 8. Data integrity / API boundaries (ALCOA+)

| # | Test | Expected | P/F |
|---|---|---|---|
| 8.1 | Create / edit a task, project, change-control record. | Persists correctly; informatics fields (ccNo, deployStage, applicableSite, gxpCritical, requiresQaSignoff) retained. | |
| 8.2 | Submit a malformed API body (e.g. via dev tools). | Rejected with 400 (Zod validation), no partial write. | |
| 8.3 | Audit trail for record changes. | Attributable, contemporaneous, before/after captured. | |
| 8.4 | Refresh after each change. | Data is consistent and enduring (no optimistic-only state lost). | |

---

## 9. Cross-cutting quality checks (item 7)

| # | Test | Expected | P/F |
|---|---|---|---|
| 9.1 | Bird's-Eye with **sparse** and **dense** data (all 3 scopes). | Both look balanced and readable. | |
| 9.2 | Zoom / pan / reset / group / export / close. | All behave per section 3b. | |
| 9.3 | Desktop / tablet / mobile responsiveness. | No overflow, overlap, or clipped headers. | |
| 9.4 | Long names everywhere. | Wrap or ellipsise; never overlap. | |
| 9.5 | Left sidebar never covers the Bird's-Eye header. | Confirmed on team + project pages. | |
| 9.6 | Dashboard sections align in one row on desktop. | Confirmed. | |
| 9.7 | Console: no errors/warnings introduced during the above. | Clean console. | |

---

## 10. Build / CI gates (for the dev running the release)

| # | Command | Expected | P/F |
|---|---|---|---|
| 10.1 | `npm run lint` | No new errors (pre-existing warnings only). | |
| 10.2 | `npm run typecheck` | Passes. | |
| 10.3 | `npm run test:unit` | All pass. | |
| 10.4 | `npm run build` | Succeeds. | |

---

### Sign-off

| Role | Name | Date | Result |
|---|---|---|---|
| QA Tester | | | |
| QA Lead | | | |

> **Compliance note:** No change in this release alters the deterministic triage/scoring
> path, the custom JWT+bcrypt auth, or the Mongoose persistence layer. UI-only refinements
> to Bird's-Eye, the dashboard, and the project header do not affect calculation,
> classification, audit trails, or e-signatures, so the validation impact is **low** —
> but rows 5, 6, and 8 must still pass to confirm no regression.
