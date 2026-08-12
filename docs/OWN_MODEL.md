# Own-model AI — what is worth training

Pragati already deleted Delivery Foresight. Do not train a model to put that theater back.

A **custom model** is worth it only when:

1. You have **labeled history we already store** (finished tasks, who, when, late or not).
2. The output **closes an exception faster** (assign, unblock, write the next task).
3. A giant API LLM is **the wrong tool** — too slow, too expensive, or it cannot see *your* distribution.

If it needs world knowledge or reading a sketch, call an API (SpaceXAI / `XAI_API_KEY`). Do not pretend you will train GPT-from-scratch on 40 users.

---

## Train on your board (small models)

These fit a GBDT / linear ranker / tiny encoder. Training set = Mongo tasks you already have.

| Model | Job | Labels you already have | Where it sits |
| --- | --- | --- | --- |
| **Who finishes this** | Rank assignees for a new task | `assigneeId` + `completedAt` vs `dueDate` / `ccTcd` | New task, bird’s-eye edit, “Make task” from the board |
| **Will this slip** | P(late \| title, age, load, blocked) | completed + overdue rows | Chip on open work — fact-adjacent, not a finish-date prophecy |
| **This looks like that** | Retrieve past tasks | title + lifecycle + outcome | “Similar” on task create / promote-from-board |

None of these need a 70B LLM. They need 12–24 months of honest completions and a weekly retrain cron.

**Do not train:** chat, “write my status,” slide decks, personality quotes, delivery foresight theater.

---

## Use an API model (do not train)

| Job | Why not train |
| --- | --- |
| Read handwriting / a photo of the board into task titles | You have no labeled stroke→title corpus |
| Turn a messy text box into a clean task title | Style transfer; Grok/SpaceXAI is enough |
| Summarize a comment thread | Tiny volume, no unique distribution |

Whiteboard “Make task” today is **the typed box, verbatim**. If you later want “clean this into a task title,” that is an API call on the server, not a custom net.

---

## First training run (when you have the data)

1. Export completed tasks: title tokens, lifecycle, assignee, days-to-done, late yes/no, was-blocked.
2. Train a ranker: `P(assignee A finishes on time | task + A’s last 20 completions)`.
3. Serve it from `/api/tasks/suggest` — you already have a suggest route.
4. Kill criterion: if the ranker is no better than “last assignee on this project,” delete it.

Until that beats the heuristic, **do not ship a model**. Ship the whiteboard job: think → type → task.

---

## What is shipping: incremental work memory

The store learns **on every completion** (and unlearns if a task is reopened). Current projects seed it once; every future done-task updates the same buckets. End users see facts only:

| Surface | What they see (when n ≥ 3) | What they never see |
| --- | --- | --- |
| Today | “You usually finish in ~4 days · 11 of 14 dated tasks on time” | Foresight, pep, invented urgency |
| Task | “Work like this usually takes ~5 days · last finished by Priya” | Chat, “AI says”, a fake finish date |

Buckets: per assignee, per title token, per task type, per team. Private / personal tasks never enter the store.

Kill criterion is unchanged: if a later ranker is no better than last-assignee / this median, delete the ranker. The memory stays — it is just counts.

---

## Hook already in the product

- Promote from the project board writes `POST /tasks` with the box text.
- Completing a task updates work memory (`rememberTask` / `forgetTask`).
- `/api/tasks/suggest` ranks assignees from history (heuristic first, model later).
- Vision/OCR of ink: API only, never a weekend custom CNN.
