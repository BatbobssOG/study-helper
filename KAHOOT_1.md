# KAHOOT_1.md — Pipetrades Live Game: Architecture & Design Plan

> **Status:** Planning only — no code, no database changes, no deployment.
> **Last updated:** 2026-04-22
> **Prerequisite:** Pipetrades Study Helper is already live with Supabase, Next.js App Router, quiz_questions, sections, classes, and profiles tables in place.

---

## Failures Found & Fixed (Revision Log)

Before reading the plan, here is what was wrong in the first draft and what changed:

| # | Failure | Fix Applied |
|---|---|---|
| 1 | `ANSWER_ACK` broadcast claimed "host only" — Supabase Broadcast is pub/sub, there are no private messages | Removed `ANSWER_ACK` from Broadcast; host polls a lightweight GET endpoint for live answer count instead |
| 2 | No state-recovery GET endpoint — Broadcast has zero message history; a 10-second phone sleep breaks the game | Added `GET /api/kahoot/state/[code]` as the source of truth; all clients fetch on mount and reconnect |
| 3 | `/advance` conflated "reveal answer" and "next question" into one API call, removing host pacing control | Split into `/api/kahoot/reveal` (show correct answer + scores) and `/api/kahoot/next` (push next question) |
| 4 | Leaderboard described both a "5-second auto-countdown" and "host clicks next" — contradictory | Leaderboard is indefinite; host controls advancement; players see "Waiting for host…" |
| 5 | No double-click protection on advance — rapid taps could skip questions or broadcast duplicate events | API validates session `phase` before acting; UI disables button immediately on first click |
| 6 | Answer button B = orange, conflicts with app's orange-600 primary CTA colour | Colours changed: A = red, B = blue, C = amber/yellow, D = violet |
| 7 | Players can never rejoin after any disconnect — too harsh for a classroom setting | Players may rejoin using the same `player_id` (localStorage UUID) while session is `in_progress` |
| 8 | "X/Y answered" denominator never updated when players disconnect mid-question | `expected_answer_count` snapshot taken at question reveal; decremented when Presence drops |
| 9 | CSV export mentioned 4 times but columns never defined | CSV format fully specified in Section 5.3 |
| 10 | `answers` jsonb array in `kahoot_player_scores` hard to query for analytics | Replaced with a dedicated flat `kahoot_answers` table (one row per player per question) |
| 11 | Session cleanup mechanism vague ("cron job or Supabase scheduled function") | Specified as `pg_cron` task in Supabase; exact schedule and query defined |
| 12 | No UNIQUE DB constraint on display names — race condition allows duplicate names | Added `UNIQUE(session_id, display_name)` constraint to `kahoot_player_scores` |
| 13 | Broadcast channel never explicitly closed after `GAME_END` — leaked connections | Specified: clients call `channel.unsubscribe()` on `GAME_END` event and on page navigation |
| 14 | `player_id` from localStorage incompatible with Next.js SSR — throws hydration error | Player game view is explicitly `'use client'`; `player_id` read only inside `useEffect` after mount |

---

## Executive Summary

This document describes the architecture for a **Kahoot-style real-time multiplayer quiz game** built into the Pipetrades Study Helper. A logged-in student acts as the **host**, selects which class/section questions to draw from, and shares a short **session code** with their classmates. Players join via code — **no account required to play**. Everyone sees the same question at the same time with a countdown timer. Faster correct answers earn more points. After each question the host reveals the answer and a leaderboard is shown. After the final question full results are saved and can be exported.

The feature reuses the existing `quiz_questions` pool (all `approved = true` questions), the existing Supabase auth, and fits natively into the current Next.js App Router structure. Real-time communication is handled by **Supabase Realtime Broadcast + Presence channels** — no new infrastructure required. The **database is always the source of truth**; Broadcast is only used for push notifications. Every client can recover full game state from the DB at any time.

---

## 1. Key Design Decisions (Why Before What)

| Decision | Choice | Reason |
|---|---|---|
| Real-time tech | Supabase Realtime Broadcast + Presence | Already in the stack; zero new infrastructure; no auth token required for guest clients to subscribe |
| DB = source of truth | All clients fetch state on mount/reconnect | Broadcast has no message history; phones sleep tabs; DB recovery prevents broken state after any disconnect |
| Player auth | Host must be logged in; players join as guests (name only) | Classmates won't all have accounts; lowering join friction is critical for classroom adoption |
| Timer authority | Server-side `question_revealed_at` timestamp | All clients calculate remaining time from the same DB timestamp; prevents clock drift and client-side manipulation |
| Question pre-selection | Questions drawn and locked at session creation | Avoids mid-game DB reads; ensures all players see identical question set in identical order |
| Host disconnect | Game pauses automatically | Cannot advance questions without the host; state persists so host can reconnect within 5 minutes |
| Reveal vs Next split | Two separate API calls and two separate host buttons | Host controls pacing; must see answer breakdown before choosing to advance |
| Late joiners | Blocked after game starts | Fairness; creates confusing mid-question state |
| Player rejoin | Allowed using same `player_id` from localStorage | A brief phone screen-lock should not permanently disqualify a student |
| Pause/resume mid-timer | Not in MVP | Complex with live timers; host disconnect auto-pause covers the main need |
| Answer option order | Fixed A/B/C/D, never shuffled | Options are already labelled in the DB; per-player shuffling requires re-mapping correct answers and breaks "shout out B!" classroom dynamics intentionally — all players see same layout |
| Broadcast channel security | Only server-side API routes broadcast events | Prevents any client from sending fake REVEAL or GAME_END events; clients only subscribe, never publish |

---

## 2. Game Overview

A **Pipetrades Live Game** session works as follows:

1. A logged-in student (the **host**) opens `/study/kahoot`, fills in a session name, picks a class and sections, sets question count and time limit
2. The app draws questions, locks the list, generates a 6-character session code (e.g., `WELD42`), and opens the lobby
3. Classmates open `/play` on any device — no account needed — enter the code and a display name
4. The host sees all connected players in a **lobby** and clicks **Start Game** (requires ≥ 2 players)
5. Questions appear on all screens simultaneously with a live countdown timer
6. Players tap their answer (A / B / C / D) — answer locks immediately and cannot be changed
7. When the timer hits 0 the host clicks **Reveal Answer** — correct answer is shown, points awarded, per-question breakdown shown to host
8. Host clicks **Show Leaderboard** — full ranked list shown to all players
9. Host clicks **Next Question** — repeat for all questions
10. After the final question the host clicks **End Game** — final leaderboard with 🥇🥈🥉 medals, results saved to DB, CSV export available

---

## 3. Session Management

### 3.1 Host Capabilities (requires logged-in account)

- Create a new game session with a custom name (max 40 chars)
- Select which **class** to draw questions from
- Select one or more **sections** within that class (sections with fewer than 10 approved questions are greyed out)
- Set **number of questions**: 10, 20, or 30
- Set **time limit per question**: 15, 20, or 30 seconds (default: 20)
- See the live **player lobby** (names, join time, animated as players join)
- Kick a player from the lobby before the game starts
- Click **Start Game** once at least 2 players are in the lobby
- See **live answer count** ("X / Y players answered") updating in real-time
- Click **Reveal Answer** when timer reaches 0 or all players have answered
- See **per-question answer breakdown** (A/B/C/D counts, correct answer highlighted)
- Click **Show Leaderboard** to push leaderboard to all players
- Click **Next Question** to advance
- **End game early** at any time (with confirmation dialog) — results up to that point are saved
- View and **export final results** as CSV

### 3.2 Player Capabilities (no account required)

- Join using a 6-character session code OR a direct join URL
- Set a **display name** (2–20 characters; must be unique within the session)
- See the **waiting room** with other connected players
- Rejoin a session in progress using the same code and same display name (if their `player_id` matches)
- Answer the current question within the time limit — answer locks immediately on tap
- See immediate feedback: their selected option stays highlighted while waiting for the reveal
- See the correct answer highlighted and their points earned after the reveal
- See the **leaderboard** after each question with their rank highlighted
- See the **final results** with their rank and score

### 3.3 Session Code Format

- 6 characters, alphanumeric uppercase
- Exclude visually ambiguous characters: `0`, `O`, `1`, `I`, `L`
- Available character set: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (32 chars → 32^6 ≈ 1 billion combos)
- Examples: `WELD42`, `SAFE7R`, `PIPE3K`
- Code is checked for uniqueness against sessions with `state IN ('lobby', 'in_progress')` — retries up to 10 times
- Code effectively expires when session `state` becomes `finished` or `abandoned`

---

## 4. Game Flow

```
HOST                                    PLAYERS
────────────────────────────────────────────────────────────────────────
[POST /api/kahoot/create]
  → Pick class, sections, Q count,
    time limit
  → App draws + locks question list
  → Session code generated (e.g. WELD42)
  → state: lobby
  → Lobby view opens                    [GET /play → enter code + name]
                                        [POST /api/kahoot/join]
                                        [Waiting room: live player list]
[See player list via Presence]
[Start Game button (≥2 players)]
[POST /api/kahoot/start]
  → state: in_progress, phase: question
  → Broadcast: GAME_START
  ↓                                     [Fetch state: GET /api/kahoot/state/WELD42]
[Question 1 shown]  ───QUESTION──────▶  [Question 1 shown]
[question_revealed_at = now() in DB]    [Timer starts from question_revealed_at]
[Poll answer count]
                                        [Player taps answer]
                                        [POST /api/kahoot/answer]
                                        [Answer locked, option stays highlighted]
[Answer count updates]
[Timer hits 0 on host screen]
[Host clicks "Reveal Answer"]
[POST /api/kahoot/reveal]
  → Scores calculated server-side
  → phase: revealed
  → Broadcast: REVEAL                ──▶ [Correct answer shown, points earned]
[Host sees A/B/C/D breakdown]
[Host clicks "Show Leaderboard"]
[POST /api/kahoot/leaderboard]
  → Broadcast: LEADERBOARD           ──▶ [Full ranked list, own row highlighted]
                                         [Waiting for host…]
[Host clicks "Next Question"]
[POST /api/kahoot/next]
  → current_question_index++
  → phase: question
  → Broadcast: QUESTION              ──▶ [Question 2 shown]
  ↓
[Repeat for Q2 … Qn]
  ↓
[After final question reveal + leaderboard]
[Host clicks "End Game"]
[POST /api/kahoot/end]
  → state: finished
  → Final ranks calculated + saved
  → Broadcast: GAME_END              ──▶ [Final leaderboard + rank + medals]
                                         [Channel unsubscribed by clients]
[CSV export available]
[Channel unsubscribed by host]
```

### Phase Reference Table

| Phase | `state` | `phase` | Description |
|---|---|---|---|
| Setup | — | — | Host fills form; questions drawn; DB record created |
| Lobby | `lobby` | `lobby` | Players join; host sees live list |
| Question | `in_progress` | `question` | Question active; timer running; players answering |
| Revealed | `in_progress` | `revealed` | Correct answer shown; host sees breakdown |
| Leaderboard | `in_progress` | `leaderboard` | Rankings shown to all; waiting for host |
| Finished | `finished` | `finished` | Final results saved; export available |
| Abandoned | `abandoned` | — | Host disconnected > 5 min, or host ended early |

> **Note:** A `phase` column is added to `kahoot_sessions` alongside `state`. This prevents double-click races — e.g., the reveal API only proceeds if `phase = 'question'`; the next-question API only proceeds if `phase = 'leaderboard'`.

---

## 5. Scoring & Ranking System

### 5.1 Scoring Formula

```
Base points for correct answer:   1000
Speed bonus (maximum):             500
Speed bonus formula:               floor(500 × (time_remaining_ms / time_limit_ms))
  where time_remaining_ms = (question_revealed_at + time_limit) − answer_received_at
Wrong answer:                         0
No answer (timeout):                  0

Maximum points per question:      1500
```

- `answer_received_at` is stamped by the server at the moment the `/api/kahoot/answer` request is processed
- If `answer_received_at > question_revealed_at + time_limit_seconds`, the answer is rejected with 0 points (late submission due to network lag)
- All score calculations happen server-side — clients never send a score value

### 5.2 Leaderboard & Tie-Breaking

- After each question: full ranked list broadcast to all players, sorted by cumulative score descending
- **Tie-breaking rule 1:** if cumulative scores are equal, rank by total `response_ms` across all questions (lower = faster overall)
- **Tie-breaking rule 2:** if still equal, alphabetical by `display_name`
- **Medals:** top 3 shown with 🥇 🥈 🥉 during game and on final results
- **Rank change indicator:** leaderboard shows ▲N / ▼N / — next to each player's name
- **Final results:** full ranked list for all players; ranks written to `kahoot_player_scores.final_rank`

### 5.3 CSV Export Format

The CSV export is generated server-side from the `kahoot_player_scores` and `kahoot_answers` tables. Columns:

| Column | Source | Example |
|---|---|---|
| `rank` | `kahoot_player_scores.final_rank` | 1 |
| `display_name` | `kahoot_player_scores.display_name` | Raide |
| `total_score` | `kahoot_player_scores.total_score` | 12750 |
| `questions_correct` | `kahoot_player_scores.questions_correct` | 9 |
| `questions_total` | `kahoot_sessions.question_count` | 10 |
| `accuracy_pct` | Calculated: `questions_correct / questions_total * 100` | 90% |
| `avg_response_ms` | Average of `kahoot_answers.response_ms` where `is_correct = true` | 8450 |
| `q1_correct` … `qN_correct` | `kahoot_answers.is_correct` per question index | TRUE |

One row per player. Header row included. Filename: `{session_name}_{date}.csv`

---

## 6. Real-Time Communication

### 6.1 Technology: Supabase Realtime

**Chosen: Supabase Realtime (Broadcast + Presence)**

Rationale:
- Already in the stack — no new services, no billing changes, no additional deployment
- **Broadcast** channels push arbitrary JSON events to all subscribers (sub-100ms in same region)
- **Presence** tracks connected clients automatically; handles disconnect detection
- Works with guest clients (no Supabase auth token required to subscribe to a channel)
- Scales to 30+ concurrent players in a single session without configuration

Polling rejected: 1–2 second minimum lag is unacceptable for a timed quiz.
Standalone WebSocket server rejected: extra infrastructure, cost, and deployment complexity.

### 6.2 Critical Rule: Server Broadcasts, Clients Only Subscribe

**No client ever sends a Broadcast event directly.** All game-state changes follow this pattern:

```
Client action → POST to API route → API validates auth + game phase → DB write → API broadcasts event
```

This prevents any player from sending a fake `REVEAL` or `GAME_END` event that other players would see. The channel is open to all subscribers but only the server has write authority over game state.

### 6.3 Channel Structure

One Realtime channel per active session, named by session code:

```
Channel name:  game:{SESSION_CODE}
               e.g.  game:WELD42
```

Clients subscribe on page load. Clients call `channel.unsubscribe()` on `GAME_END` event and on page navigation/unmount.

### 6.4 Broadcast Event Types

| Event | Sent by | Payload | Purpose |
|---|---|---|---|
| `GAME_START` | Server | `{ question_count, time_limit_seconds }` | Triggers player transition from waiting room to game |
| `QUESTION` | Server | `{ index, question_text, options, revealed_at }` | Pushes next question to all screens |
| `REVEAL` | Server | `{ correct_answer, explanation, player_scores: [{player_id, score_delta, total_score}] }` | Shows correct answer + each player's earned points |
| `LEADERBOARD` | Server | `{ rankings: [{display_name, total_score, rank, rank_change}] }` | Full ranked list to all players |
| `GAME_END` | Server | `{ final_rankings: [{display_name, total_score, final_rank}] }` | Triggers final results screen; signals clients to unsubscribe |
| `HOST_DISCONNECT` | Server | `{ paused: true, resume_deadline: ISO_timestamp }` | Players see "Host disconnected — game paused" |
| `HOST_RECONNECT` | Server | `{ phase, current_question_index }` | Resumes game; clients re-sync from DB |
| `KICKED` | Server | `{ player_id }` | Removes a specific player from the lobby |

> **Note:** `ANSWER_ACK` (previously in the draft) has been removed. It was incorrectly described as "host only" — Broadcast cannot target individual subscribers. Instead, the host view polls `GET /api/kahoot/answer-count/[sessionId]` every second during the answering phase to get a live "X answered / Y expected" count.

### 6.5 Presence (Player List)

- Used only in the **lobby** to show the host a live list of connected players
- Each player sends `{ display_name, player_id }` as their Presence payload when they join
- Host subscribes to Presence to render the lobby player list with animated entries
- During the game, player connection state is tracked via `kahoot_player_scores.last_seen_at` (updated on each answer), not via Presence — Presence is not reliable enough for mid-game tracking

### 6.6 State Recovery (Critical)

Any time a client loads or reloads `/play/[code]` or `/study/kahoot/[sessionId]`, it must:

1. Call `GET /api/kahoot/state/[code]` to fetch the full current session state from the DB
2. Render the correct view based on `state` + `phase` + `current_question_index`
3. Then subscribe to the Realtime channel to receive future events

This means the game works correctly even if a player's phone sleeps for 30 seconds — they reconnect, fetch state, and rejoin the right screen. Broadcast events are only used for *pushing updates*, not as the sole source of truth.

---

## 7. Data Model

**Four tables** (replacing the previous three — `kahoot_player_scores` loses its `answers` jsonb column, and a new `kahoot_answers` table takes over individual answer records).

### 7.1 `kahoot_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Auto-generated |
| `code` | text UNIQUE NOT NULL | 6-char session code |
| `name` | text NOT NULL | Custom name, max 40 chars |
| `host_user_id` | uuid FK → auth.users NOT NULL | Must be logged in |
| `class_id` | uuid FK → classes NOT NULL | Selected class |
| `section_ids` | uuid[] NOT NULL | Selected sections |
| `question_ids` | uuid[] NOT NULL | Pre-drawn ordered question list, locked at creation |
| `question_count` | int NOT NULL | 10, 20, or 30 |
| `time_limit_seconds` | int NOT NULL | 15, 20, or 30 |
| `state` | text NOT NULL DEFAULT 'lobby' | `lobby` / `in_progress` / `finished` / `abandoned` |
| `phase` | text NOT NULL DEFAULT 'lobby' | `lobby` / `question` / `revealed` / `leaderboard` / `finished` |
| `current_question_index` | int NOT NULL DEFAULT 0 | 0-based index into `question_ids` |
| `expected_answer_count` | int NULLABLE | Snapshot of connected player count at question reveal time; used for "X/Y answered" denominator |
| `question_revealed_at` | timestamptz NULLABLE | When current question was pushed; used for server-side timer calculation |
| `created_at` | timestamptz DEFAULT now() | |
| `started_at` | timestamptz NULLABLE | When host clicked Start |
| `ended_at` | timestamptz NULLABLE | When game finished or was abandoned |

> **`phase` prevents double-click races.** Every API route checks the expected `phase` before proceeding:
> - `/reveal` only runs if `phase = 'question'`
> - `/leaderboard` only runs if `phase = 'revealed'`
> - `/next` only runs if `phase = 'leaderboard'`
> - `/end` only runs if `state = 'in_progress'`

> **`question_ids` array ordering** must be preserved when fetching questions. Use `SELECT ... WHERE id = ANY($1) ORDER BY array_position($1, id)` to maintain the pre-drawn order.

### 7.2 `kahoot_player_scores`

One row per player per session. Guest players have a null `user_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → kahoot_sessions NOT NULL | |
| `player_id` | uuid NOT NULL | Client-generated UUID, persisted in localStorage; used for rejoin |
| `user_id` | uuid FK → auth.users NULLABLE | NULL for guests |
| `display_name` | text NOT NULL | Name chosen at join time |
| `total_score` | int NOT NULL DEFAULT 0 | Running cumulative score; updated atomically on each answer |
| `questions_correct` | int NOT NULL DEFAULT 0 | Count of correct answers |
| `final_rank` | int NULLABLE | Set when game ends |
| `joined_at` | timestamptz DEFAULT now() | |
| `last_seen_at` | timestamptz NULLABLE | Updated on each answer submission |
| **CONSTRAINT** | `UNIQUE(session_id, display_name)` | Prevents race condition allowing duplicate display names |
| **CONSTRAINT** | `UNIQUE(session_id, player_id)` | Prevents a player joining the same session twice |

> **Rejoin logic:** If a player calls `/api/kahoot/join` with a `player_id` that already exists in `kahoot_player_scores` for this session, the API returns their existing `display_name` and player data rather than creating a duplicate row. The player is back in the game.

> **`total_score` updates** use atomic SQL: `UPDATE kahoot_player_scores SET total_score = total_score + $delta, questions_correct = questions_correct + $correct WHERE session_id = $sid AND player_id = $pid`. No read-modify-write cycle; no race condition.

### 7.3 `kahoot_answers`

One row per player per question. Replaces the `answers` jsonb array from the previous draft. Flat rows are faster to query, safer under concurrent writes, and trivial to aggregate for analytics.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → kahoot_sessions NOT NULL | |
| `player_id` | uuid NOT NULL | Matches `kahoot_player_scores.player_id` |
| `question_id` | uuid FK → quiz_questions NOT NULL | The actual question asked |
| `question_index` | int NOT NULL | Position in this session (0-based) |
| `selected_answer` | text NULLABLE | `A`, `B`, `C`, `D`, or NULL (timeout) |
| `is_correct` | boolean NOT NULL | |
| `score_awarded` | int NOT NULL DEFAULT 0 | Points awarded for this question |
| `response_ms` | int NULLABLE | Milliseconds from `question_revealed_at` to answer receipt; NULL if timeout |
| `answered_at` | timestamptz NULLABLE | Server timestamp when answer was received |
| **CONSTRAINT** | `UNIQUE(session_id, player_id, question_index)` | Prevents duplicate submissions |

### 7.4 `kahoot_question_stats`

One row per question per session. Updated with atomic increments on each answer; used for the host's post-reveal breakdown and CSV analytics.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `session_id` | uuid FK → kahoot_sessions NOT NULL | |
| `question_id` | uuid FK → quiz_questions NOT NULL | |
| `question_index` | int NOT NULL | |
| `answers_a` | int NOT NULL DEFAULT 0 | Atomic: `answers_a = answers_a + 1` |
| `answers_b` | int NOT NULL DEFAULT 0 | |
| `answers_c` | int NOT NULL DEFAULT 0 | |
| `answers_d` | int NOT NULL DEFAULT 0 | |
| `answers_timeout` | int NOT NULL DEFAULT 0 | Players who didn't answer in time |
| `answers_correct` | int NOT NULL DEFAULT 0 | |
| `answers_total` | int NOT NULL DEFAULT 0 | Total submissions received (excludes timeouts) |
| `avg_response_ms` | int NULLABLE | Recalculated on reveal |

> **Concurrent write safety:** all updates to this table use `UPDATE ... SET answers_x = answers_x + 1` — atomic single-statement increments. No read-modify-write; safe under 30 concurrent submissions.

### 7.5 Relationships

```
auth.users ──────────────< kahoot_sessions (host_user_id)
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
  kahoot_player_scores   kahoot_answers    kahoot_question_stats
       (player_id)          (player_id,         (question_id)
                            question_id)              │
                                  │                   │
                            quiz_questions ───────────┘
```

---

## 8. API Routes

```
app/api/kahoot/
├── create/route.ts            POST  Create session, lock question list, generate code
├── join/route.ts              POST  Player joins lobby (or rejoins in_progress)
├── start/route.ts             POST  Host starts game; state→in_progress; broadcast GAME_START
├── answer/route.ts            POST  Player submits answer; server scores; updates DB
├── answer-count/[id]/route.ts GET   Host polls for live "X/Y answered" count
├── reveal/route.ts            POST  Host reveals answer; scores pushed; broadcast REVEAL
├── leaderboard/route.ts       POST  Host pushes leaderboard; broadcast LEADERBOARD
├── next/route.ts              POST  Host advances to next question; broadcast QUESTION
├── end/route.ts               POST  Host ends game; final ranks saved; broadcast GAME_END
└── state/[code]/route.ts      GET   Any client fetches full current state (source of truth)
```

**Why the GET `/state/[code]` endpoint is critical:**
Every time a player or host loads or reloads their page, they call this endpoint first to determine which view to render. This makes reconnection, tab sleep recovery, and browser refresh all work correctly. The Realtime channel is subscribed to *after* state is fetched — it only handles *new* events going forward.

---

## 9. Route Architecture

```
app/
├── play/                           ← Public, no auth required
│   ├── page.tsx                    ← Join page (code + name input)
│   └── [code]/
│       └── page.tsx                ← Player game view
│                                      MUST be 'use client'
│                                      player_id read from localStorage inside useEffect only
│
├── study/
│   ├── kahoot/                     ← Protected by existing study layout (requireUser)
│   │   ├── page.tsx                ← Session creation form
│   │   └── [sessionId]/
│   │       └── page.tsx            ← Host control view
│                                      MUST be 'use client'
│   └── ... (existing routes unchanged)
│
└── api/
    └── kahoot/                     ← See Section 8 for full list
```

**`/play` is outside `/study`** because the existing `study/layout.tsx` calls `requireUser()` which redirects unauthenticated users to `/login`. Guest players cannot pass this check.

**Both game views are `'use client'`** because they read `player_id` from `localStorage`, subscribe to Supabase Realtime channels, and manage complex interactive state — none of which are possible in Server Components.

**`player_id` must only be read inside `useEffect`** (after mount), never during render. Reading `localStorage` during SSR in Next.js App Router throws a hydration error. Pattern: `const [playerId, setPlayerId] = useState<string | null>(null)` → set it inside `useEffect(() => { setPlayerId(localStorage.getItem('pipetrades_player_id') ?? generateAndStore()) }, [])`.

---

## 10. UI/UX Components

### 10.1 Host Views

**Session Creation Form** (`/study/kahoot`)
- Text input: session name (required, max 40 chars)
- Class selector (matches existing select page styling)
- Section multi-select — shows approved question count per section; sections with < 10 questions are greyed out with a tooltip
- Question count picker: 10 / 20 / 30
- Time limit picker: 15s / 20s / 30s (default 20s)
- Real-time validation: must have enough approved questions across selected sections
- "Create Session →" button

**Lobby View** (`/study/kahoot/[sessionId]`, `phase = 'lobby'`)
- Session name as page heading
- Large session code (e.g., `WELD42`) in a monospace font with "Copy Link" button
- Animated live player list (new names slide in via Presence)
- Player count badge
- "Kick" button per player (removes them; broadcasts `KICKED` event)
- Session summary: class, sections, question count, time limit
- "Start Game" button — disabled until ≥ 2 players; enabled state uses orange-600

**Host Question View** (`phase = 'question'`)
- Question number / total (e.g., "Question 3 / 20")
- Countdown timer (large, prominent; color shifts green → yellow → red)
- Question text (large, readable — this screen is projected for the class)
- Answer options listed A / B / C / D (for context; not clickable on host screen)
- "X / Y players answered" live count (polls `GET /api/kahoot/answer-count/[id]` every second)
- "Reveal Answer" button — enabled when timer reaches 0 OR all Y players have answered; disabled and shows spinner immediately on click to prevent double-submission

**Host Reveal View** (`phase = 'revealed'`)
- Correct answer highlighted
- Horizontal bar chart: A / B / C / D answer counts with correct option marked
- Explanation text from the question
- "Show Leaderboard →" button

**Host Leaderboard View** (`phase = 'leaderboard'`)
- Top 3 with 🥇🥈🥉 medals
- Full ranked list (scrollable if many players)
- Each row: rank, display name, total score, ▲N / ▼N rank change
- "Next Question →" button (or "End Game" if this was the last question)

**Final Results View** (`state = 'finished'`)
- 🥇🥈🥉 podium
- Full ranked table: rank, name, score, correct / total, accuracy %
- Per-question stats: % of players who got it right, most common wrong answer
- "Export CSV" button (generates and downloads file per Section 5.3)
- "Back to Dashboard" link

### 10.2 Player Views

**Join Page** (`/play`)
- Session code input: large, auto-uppercase, max 6 chars, triggers alphanumeric keyboard on mobile
- Display name input: 2–20 chars
- "Join Game" button
- Error messages: invalid/expired code, game already started, name taken, name too short/long

**Waiting Room** (`/play/[code]`, `phase = 'lobby'`)
- "You're in as: [name]" at top
- Session name displayed
- Live list of other players (updates via Presence)
- "Waiting for host to start…" with pulsing indicator
- Game details: question count, time limit

**Question View** (`phase = 'question'`)
- "Question X of Y" header
- Large countdown timer — color shifts green → yellow → red; freezes at 0 (does not auto-advance)
- Question text (large, minimum 20px, readable on phone without scrolling)
- 4 full-width answer buttons, minimum 64px tall:
  - **A — Red** (`bg-red-600`)
  - **B — Blue** (`bg-blue-600`)
  - **C — Amber** (`bg-amber-500`)
  - **D — Violet** (`bg-violet-600`)
- After tapping: selected button stays highlighted (slightly dimmed + checkmark), others fade; "Locked in — waiting for reveal" message below
- Buttons are disabled immediately on first tap — no second submission possible

**Reveal View** (`phase = 'revealed'`)
- Question text still visible (player can re-read what they were answering)
- Selected correct answer: green highlight + ✓
- Selected wrong answer: red highlight + ✗, correct answer shown in green
- Points earned this round: large "+850 pts" (green if correct, grey if wrong)
- Running total: "Total: 3,250 pts"
- Explanation text (from `quiz_questions.explanation`)
- "Waiting for leaderboard…" indicator

**Leaderboard View** (`phase = 'leaderboard'`)
- Full ranked list; player's own row highlighted in orange
- Rank change indicator: ▲2 / ▼1 / —
- "Waiting for host to continue…" pulsing indicator at bottom
- No auto-advance countdown — leaderboard stays until host clicks Next

**Final Results View** (`state = 'finished'`)
- "Game over!" heading
- 🥇🥈🥉 top 3 with names and scores
- Player's own rank and score prominently shown
- "Play Again?" button → returns to `/play` (clears game state, keeps player_id)

### 10.3 Mobile-First Requirements

- All answer buttons: minimum 64px tall, full width, at least 16px font
- Session code input: `inputMode="text"` with `autoCapitalize="characters"` on the input
- Countdown timer: visible in the top half of screen without any scrolling on iPhone SE (375px width)
- All body text: minimum 16px to prevent iOS auto-zoom on focus
- Leaderboard list: scrollable if it overflows; player's own row sticky or scrolled into view automatically
- Join URL must be short enough to share via iMessage — use `pipetrades.app/play?code=WELD42` format

---

## 11. Edge Cases & Error Handling

| Scenario | Behaviour |
|---|---|
| Player tab sleeps / network drops briefly | On reconnect, player calls `GET /api/kahoot/state/[code]` and renders the current phase correctly; re-subscribes to Realtime channel |
| Player disconnects and wants to rejoin | Player goes to `/play`, enters same code + same display name → API detects matching `player_id` in localStorage → returns existing player data and puts them back in the game |
| Player rejoins with different device (no localStorage) | Treated as a new player; existing player row is orphaned (keeps their score in the DB but they can't see it); they get a new `player_id` and effectively start fresh — acceptable tradeoff for guest players |
| Host disconnects | Server detects via Presence disconnect event; updates `state = 'in_progress'` (no change) but records `host_disconnected_at`; broadcasts `HOST_DISCONNECT`; players see "Host disconnected — game paused"; timer is frozen client-side (no new questions can be revealed without the host); host can reconnect within 5 minutes and resume from current state |
| Host disconnects > 5 minutes | pg_cron cleanup job marks session `abandoned`; remaining clients polling state see this and show "Session ended" screen |
| Host accidentally closes tab | Same as host disconnect — host can navigate back to `/study/kahoot/[sessionId]`; `GET /api/kahoot/state/[code]` restores full game state; host re-subscribes and sees current question/phase |
| Host double-clicks "Reveal Answer" or "Next Question" | API checks `phase` before acting — second call finds `phase` has already advanced and returns a 409 Conflict; UI disables button immediately on first click |
| New player tries to join after game started | Join API checks `state`; if `in_progress`, returns error: "This game has already started" |
| Timer expires, player hasn't answered | Player receives 0 points; a `kahoot_answers` row is inserted with `selected_answer = null`, `is_correct = false`, `score_awarded = 0`, `response_ms = null`; `answers_timeout` incremented in `kahoot_question_stats` |
| Player submits answer after timer expired | `answered_at > question_revealed_at + time_limit_seconds` → API returns 200 with `{ late: true, score: 0 }`; client shows "Too slow!" |
| Player submits answer twice (e.g. network retry) | `UNIQUE(session_id, player_id, question_index)` on `kahoot_answers` causes a conflict; API catches it and returns the existing answer data — no duplicate, no crash |
| "X/Y answered" denominator: player disconnects mid-question | `expected_answer_count` is snapshot at `question_revealed_at`; if a player disconnects, the host's count UI shows "(1 player disconnected)" below the count rather than hanging at N-1/N indefinitely |
| Session created with too few approved questions | API counts `approved = true` questions for selected sections; if fewer than `question_count` exist, returns error: "Not enough questions (need 20, found 14 in selected sections)" |
| Session code collision on generation | Retry up to 10 times checking uniqueness among `state IN ('lobby', 'in_progress')` sessions; after 10 failures (astronomically unlikely), return 500 with a clear error |
| Duplicate display names (race condition) | `UNIQUE(session_id, display_name)` DB constraint catches the race; second insert throws a conflict error; API returns "That name is already taken" |
| Session name empty or too long | Client validates (required, max 40 chars); API validates again server-side |
| 0 players in session when host starts | "Start Game" button disabled below 2 players; API validates minimum 2 players in `kahoot_player_scores` for this session |

---

## 12. Security & RLS

### 12.1 Who Can Do What

| Action | Requirement |
|---|---|
| Create a session | Must be logged in (any `role` in `profiles`) |
| View a session's questions / state | Anyone with the session code (needed for guest players) |
| Join a session as player | Anyone with a valid session code in `lobby` state |
| Rejoin a session in progress | Anyone with valid code + matching `player_id` |
| Submit an answer | Anyone with a valid `player_id` registered for this session |
| Start / reveal / next / end | Must be the `host_user_id` of the session (API validates via `requireUser()`) |
| View final results | Must be `host_user_id` or `role = 'admin'` |
| Export CSV | Must be `host_user_id` |

### 12.2 RLS Policies

**`kahoot_sessions`**
- `SELECT`: `code` is used as the lookup key by guest players → row is readable by anyone who knows the code (low-risk; code is short-lived). For results: `host_user_id = auth.uid() OR role = 'admin'`.
- `INSERT`: `auth.uid() IS NOT NULL`
- `UPDATE`: service role only (all state changes go through API routes with `createAdminClient()`)

**`kahoot_player_scores`**
- `INSERT`: open insert (guests have no auth token); validated server-side that session is in `lobby` state and display name is unique
- `SELECT`: service role only for host views; player can read own row if `player_id` matches (sent as a header, not as auth)
- `UPDATE`: service role only

**`kahoot_answers`**
- `INSERT` / `UPDATE`: service role only
- `SELECT`: service role only

**`kahoot_question_stats`**
- All operations: service role only

### 12.3 Anti-Cheat

- All scoring is calculated server-side; clients send only their selected answer (A/B/C/D)
- `question_revealed_at` is set by the server, not the client — speed bonus cannot be faked
- Duplicate submissions blocked at DB level by `UNIQUE` constraint
- Session codes expire when session ends; brute-forcing 32^6 combinations against a handful of active short-lived sessions is impractical
- Channel broadcast security: only server API routes send Broadcast events (see Section 6.2); a malicious client subscribing to the channel can read events but cannot inject fake ones via the server

---

## 13. Integration with Existing App

### 13.1 Navigation Changes

- **`StudyNav.tsx`**: add "Live Game 🎮" link → `/study/kahoot`
- **`/study` dashboard**: add "Host a Live Game" card below the "Start Studying" button
- **`/play`**: fully standalone page — no StudyNav, no auth layout; just the join form and player game view

### 13.2 Reused Infrastructure

| Existing piece | How it's reused |
|---|---|
| `quiz_questions` table | All questions for all sessions come from here (`approved = true`) |
| `sections` + `classes` tables | Host's class/section selector |
| `profiles` table | `requireUser()` uses it; `role` field used for admin access to results |
| `createAdminClient()` | All new API routes use the service role client for DB writes (same pattern as existing progress/quiz APIs) |
| `requireUser()` | Used in all host-side API routes and the `/study/kahoot` pages |
| Supabase browser client | Used for Realtime channel subscriptions in client components |
| Tailwind + `bg-gray-950` dark theme | All new UI matches existing design system |
| Inter font + `app/layout.tsx` | Inherited automatically by all new routes |

### 13.3 No Existing Table Modified

All new functionality is isolated to the four new tables. The existing flashcard, quiz, and session flows are completely unaffected.

---

## 14. Session Cleanup

Sessions must be cleaned up to prevent stale codes from accumulating and to keep the database tidy.

**Mechanism: `pg_cron`** (built into Supabase; available on all plans)

**Schedule:** Run every hour

**Task:** Mark sessions as `abandoned` if:
- `state = 'in_progress'` AND `ended_at IS NULL` AND `started_at < now() - interval '3 hours'` (game running for > 3 hours — clearly stale)
- `state = 'lobby'` AND `created_at < now() - interval '24 hours'` (lobby never started)

**Cleanup query (pseudocode):**
```
UPDATE kahoot_sessions
SET state = 'abandoned', ended_at = now()
WHERE state IN ('lobby', 'in_progress')
  AND (
    (state = 'lobby' AND created_at < now() - interval '24 hours')
    OR
    (state = 'in_progress' AND started_at < now() - interval '3 hours')
  )
```

**Result data retention:** Finished sessions and their `kahoot_player_scores` / `kahoot_answers` / `kahoot_question_stats` rows are kept indefinitely for the host to review and export.

---

## 15. Success Metrics

| Metric | Target |
|---|---|
| Question sync delay | All players see the same question within 500ms of host clicking "Next Question" |
| Answer count accuracy | "X/Y answered" count correct within 1 second of each submission |
| Score accuracy | Zero calculation errors in server-side scoring |
| Concurrent players | 30 players in one session without visible lag or dropped events |
| Session completion | 30-question game completes without crash or data loss |
| Reconnect success | Player or host can disconnect for up to 5 minutes and resume correctly |
| Guest join speed | Player joins from a cold browser tab in under 30 seconds |
| Final results saved | 100% of finished sessions have results retrievable by the host |
| Double-click safety | Rapid repeated API calls never skip a question or corrupt game state |

---

## 16. Future Enhancements (Post-MVP)

| Feature | Notes |
|---|---|
| QR code in lobby | Scan to join instead of typing code; one-line addition once MVP is live |
| Practice mode | Single-player timed MCQ — essentially the existing quiz mode with a timer; minimal new work |
| Team mode | Players split into teams; team's fastest correct answer scores |
| Streak bonus | Extra points for N correct answers in a row |
| Power-ups | 50/50 (eliminate two wrong options); one use per game per player |
| Instructor-only hosting | `role = 'instructor'` gating on session creation |
| Most-missed question analytics | Aggregate across all sessions; surfaces weak areas for the class |
| Saved replay / shareable results | Read-only results link the host can share with the class |
| Custom question sets | Host builds a one-off question bank outside the approved pool |

---

## 17. Implementation Phases

### Phase 1 — Data Layer
- Create all four tables with correct columns, constraints, and RLS
- Set up `pg_cron` cleanup job
- Build `GET /api/kahoot/state/[code]` (the state-recovery endpoint — build this first)
- Build `POST /api/kahoot/create`
- Build `POST /api/kahoot/join` (including rejoin logic)

### Phase 2 — Core Game Backend
- Build `POST /api/kahoot/start`
- Build `POST /api/kahoot/answer` with server-side scoring and atomic DB updates
- Build `GET /api/kahoot/answer-count/[id]`
- Build `POST /api/kahoot/reveal`
- Build `POST /api/kahoot/leaderboard`
- Build `POST /api/kahoot/next`
- Build `POST /api/kahoot/end`

### Phase 3 — Host Flow
- Session creation form at `/study/kahoot`
- Lobby view with Presence-based live player list
- Question view with polling answer count
- Reveal view with answer breakdown
- Leaderboard view
- Final results + CSV export

### Phase 4 — Player Flow
- Join page at `/play` (localStorage `player_id` pattern)
- Waiting room with Presence player list
- Question view with colour-coded buttons and answer locking
- Reveal view (showing question text + correct/wrong + points)
- Leaderboard view (host-controlled advancement)
- Final results screen

### Phase 5 — Reliability & Polish
- Host disconnect / reconnect flow
- Player rejoin flow (matching localStorage `player_id`)
- Mobile layout audit (button sizes, timer visibility, no-scroll requirement)
- All error states (invalid code, game started, name taken, etc.)
- Double-click protection on all host buttons
- Realtime channel unsubscribe on navigation

### Phase 6 — Integration
- Add "Live Game 🎮" to `StudyNav.tsx`
- Add "Host a Live Game" card to `/study` dashboard
- End-to-end test with 5+ concurrent real players
- Verify session cleanup job works

---

## Appendix: Corrected Data Flow

```
                      ┌──────────────────────────┐
                      │   HOST (logged-in user)   │
                      └────────────┬─────────────┘
                                   │
                    POST /api/kahoot/create
                                   │
                      ┌────────────▼─────────────┐
                      │     kahoot_sessions        │
                      │     state: lobby           │
                      │     phase: lobby           │
                      │     question_ids: [locked] │
                      │     code: WELD42           │
                      └────────────┬─────────────┘
                                   │
               Players call GET /api/kahoot/state/WELD42 on mount
               Players POST /api/kahoot/join
               Presence: game:WELD42 channel
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
  ┌────────▼──────┐      ┌─────────▼──────┐      ┌────────▼──────┐
  │  PLAYER 1     │      │  PLAYER 2      │      │  PLAYER N     │
  │  (guest)      │      │  (guest)       │      │  (guest)      │
  └────────┬──────┘      └────────────────┘      └───────────────┘
           │
           │  POST /api/kahoot/answer
           │  → Server checks phase = 'question'
           │  → Server calculates score from question_revealed_at
           │  → Inserts into kahoot_answers (UNIQUE constraint prevents duplicates)
           │  → Atomic UPDATE on kahoot_player_scores total_score
           │  → Atomic INCREMENT on kahoot_question_stats
           │
           │  Host polls GET /api/kahoot/answer-count/[id] (every 1s)
           │  → Returns { answered: X, expected: Y }
           │
  HOST clicks "Reveal Answer"
  POST /api/kahoot/reveal
           │  → Validates phase = 'question' (prevents double-click)
           │  → Sets phase = 'revealed' in DB FIRST
           │  → Then broadcasts REVEAL event with correct answer + scores
           │
  HOST clicks "Show Leaderboard"
  POST /api/kahoot/leaderboard
           │  → Validates phase = 'revealed'
           │  → Sets phase = 'leaderboard' in DB FIRST
           │  → Then broadcasts LEADERBOARD event
           │
  HOST clicks "Next Question"
  POST /api/kahoot/next
           │  → Validates phase = 'leaderboard'
           │  → Increments current_question_index
           │  → Sets question_revealed_at = now(), phase = 'question'
           │  → Snapshots expected_answer_count from current player count
           │  → DB write completes FIRST, then broadcasts QUESTION event
           │
  [Repeat reveal → leaderboard → next for each question]
           │
  HOST clicks "End Game"
  POST /api/kahoot/end
           │  → Sets state = 'finished', phase = 'finished'
           │  → Calculates and writes final_rank to all kahoot_player_scores rows
           │  → Broadcasts GAME_END
           │  → Host and all players call channel.unsubscribe()
           ▼
      Results persisted. CSV export available.
```

---

*End of KAHOOT_1.md — Rev 2*
