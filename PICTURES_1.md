# PICTURES_1.md — Image & Diagram Support for Quiz Questions

> **Status:** Planning only — no code, no database changes, no deployment.
> **Created:** 2026-04-24
> **Prerequisite:** KAHOOT_1.md Rev 3 is on record. This plan is written against the audited codebase state as of commit `13c78f7`.

---

## Executive Summary

Several classes in the Pipetrades Study Helper require diagrams, labelled technical drawings, and reference images to answer questions correctly. A question like "Identify component A in the diagram" cannot work with text alone. This document describes how to add **optional image/diagram support** to any quiz question — covering storage, database changes, upload workflows, PPTX extraction, rendering in all study modes, admin tooling, and the multiplayer Kahoot live game.

The design is **additive and non-breaking**: every existing question continues to work exactly as it does today. Images are strictly optional — a `nullable` column on the existing `quiz_questions` table. No existing code breaks; it just gains the ability to display an image above the question when one is present.

---

## 1. Where the Current System Fails for Image Questions

| Situation | What Happens Today | Why It Fails |
|---|---|---|
| Instructor uploads a PPTX slide that is entirely a diagram | `pptx-extract.ts` finds zero `<a:t>` text nodes on the slide | Slide is silently skipped; no questions are ever generated from it |
| Admin manually writes a question that references a diagram | Question text says "refer to the diagram below" | No image exists in the app; students see a broken reference |
| AI generation is triggered on a diagram-heavy slide | AI receives only the extracted text (which may be sparse or absent) | AI generates low-quality or fabricated questions with no visual context |
| A quiz question requires the student to identify a labelled part | Answer options say "Component A", "Component B" etc. | Without the image, students have no way to answer — they're guessing |
| Questions are displayed in Kahoot live game | Kahoot plan's `QUESTION` broadcast payload has no `image_url` field | Even if images existed in the DB, they would never reach the player screens |

---

## 2. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Image storage | Supabase Storage (public bucket) | Already in the stack; zero new services; direct CDN-style public URLs; integrates with existing `createAdminClient()` |
| DB change scope | Single nullable `image_url text` column on `quiz_questions` | Minimal — fully backward-compatible; no migration risk; all existing queries unaffected |
| Image type supported (MVP) | One optional **context image** displayed above the question text | Covers 95% of real use cases (diagrams, labelled drawings, reference photos); multi-image and answer-option images are post-MVP |
| Upload methods | Three paths: (1) manual admin upload per question, (2) PPTX slide image extraction, (3) direct URL paste | Each serves a different workflow; all three write the same `image_url` field |
| Public vs. signed URLs | Public URLs | Study content is not sensitive; public URLs work without auth tokens on player devices in Kahoot; signed URLs expire and would break saved questions |
| Image format handling | Accept: `.png`, `.jpg`, `.webp`; convert `.emf`/`.wmf` server-side | PPTX diagrams are often in Windows Metafile (EMF) format; browsers cannot render them; must be converted on upload |
| Rendering | Next.js `<Image>` component | Automatic WebP conversion, responsive sizing, lazy loading, prevents layout shift |
| Alt text | Required field when uploading an image | Accessibility; also useful for screen readers and low-bandwidth fallback |
| Kahoot compatibility | `image_url` included in `QUESTION` broadcast payload | Ensures image-backed questions work in live games from day one |

---

## 3. How It Works — End to End

### 3.1 The Mental Model

An image question is just a normal question with one extra field set. The question text might say:

> *"Refer to the diagram. What is the purpose of component B in the assembly?"*

When `image_url` is not null, the UI renders the image **above the question text** before showing the answer options. If `image_url` is null, the question renders exactly as it does today — no layout change, no placeholder, nothing different.

```
┌─────────────────────────────────────────────────┐
│  [IMAGE — e.g. pipe fitting cross-section]       │  ← Only shown if image_url is not null
│                                                   │
│  Question 4 / 20                                  │
│  "Refer to the diagram. Component B is:"          │
│                                                   │
│  A — A union fitting                             │
│  B — A gate valve                                │
│  C — A check valve                               │
│  D — A ball valve                                │
└─────────────────────────────────────────────────┘
```

### 3.2 Storage Layout

**Supabase Storage bucket:** `question-images`
**Bucket visibility:** Public (no auth token required to fetch)

**File path convention:**
```
question-images/
└── {class_slug}/
    └── {section_id}/
        └── {question_id}.{ext}
```

Example: `question-images/metal-fabrication/abc123-def456/q789-xyz.png`

**Why this structure:**
- Class and section folders make it easy for admin to browse or bulk-delete content when a section is removed
- Question ID as filename guarantees uniqueness and makes it trivial to look up the image for any question
- Extension preserved for human readability

**Public URL format:**
```
https://{SUPABASE_PROJECT_REF}.supabase.co/storage/v1/object/public/question-images/{path}
```

This URL is what gets stored in `quiz_questions.image_url`.

---

## 4. Database Change

**One column added to `quiz_questions`:**

| Column | Type | Default | Notes |
|---|---|---|---|
| `image_url` | `text` | `NULL` | Full public Supabase Storage URL; null means no image |
| `image_alt` | `text` | `NULL` | Accessibility description of the image; required when `image_url` is set |

**That is the entire schema change.** No other tables modified.

> `image_alt` is stored alongside `image_url` so the description travels with the question everywhere it appears — quiz, flashcard, Kahoot broadcast, CSV export, review queue — without additional joins.

---

## 5. Upload Workflows (Three Paths)

### Path 1 — Manual Upload Per Question (Admin UI)

The most direct path. An admin opens any question in the existing admin interface and attaches an image.

**Flow:**
1. Admin navigates to `SectionManager` → finds the question → clicks **"Add Image"**
2. A file picker appears (accepts `.png`, `.jpg`, `.jpeg`, `.webp` only; max 5 MB)
3. Admin selects the file and writes an alt text description
4. Client sends the file to `POST /api/admin/questions/[id]/image` (new route)
5. API uploads the file to Supabase Storage at `{class_slug}/{section_id}/{question_id}.{ext}`
6. API updates `quiz_questions.image_url` and `quiz_questions.image_alt` with the storage URL
7. Admin sees a preview of the uploaded image inline in the question card
8. A **"Remove Image"** button calls `DELETE /api/admin/questions/[id]/image`, which deletes the Storage object and sets both columns back to `NULL`

**This path handles:** retroactively adding images to already-existing text questions, and one-off diagram uploads for specific questions.

---

### Path 2 — PPTX Slide Image Extraction (Bulk Upload)

The existing `pptx-extract.ts` only reads text (`<a:t>` nodes). PPTX files are ZIP archives; all media (images, diagrams) live in `ppt/media/`. Each slide's relationship file (`ppt/slides/_rels/slideN.xml.rels`) maps image references to those media files.

**What needs to change in the extraction pipeline:**

The current extraction returns:
```typescript
interface ExtractedSlide {
  slide_number: number
  title: string | null
  content: string
  notes: string | null
}
```

The extended extraction adds:
```typescript
interface ExtractedSlide {
  slide_number: number
  title: string | null
  content: string
  notes: string | null
  images: ExtractedSlideImage[]   // ← NEW
}

interface ExtractedSlideImage {
  filename: string          // e.g. "image1.png"
  format: string            // "png", "jpg", "emf", "wmf"
  data: Buffer              // raw file bytes from the ZIP
  is_renderable: boolean    // false for EMF/WMF (need conversion)
}
```

**The EMF/WMF Problem:**

PowerPoint diagrams drawn with the built-in drawing tools are stored as `.emf` (Enhanced Metafile) or `.wmf` (Windows Metafile). These are vector formats that **browsers cannot render**. They must be converted server-side before being stored or displayed.

**Conversion approach:**
- On upload, the API detects `.emf` / `.wmf` files in the extracted media
- These are passed through a **server-side conversion** step using the `sharp` npm package (converts raster formats) combined with `canvas` or a headless approach
- Alternatively: if conversion tooling is unavailable, flag them as `needs_manual_replacement` in the admin UI — the admin sees a placeholder and a warning: "This diagram is in a format that requires manual replacement. Please upload a PNG version."
- Recommendation: **flag-and-warn approach for MVP** (EMF conversion is complex and fragile); add conversion as a post-MVP enhancement

**Admin review flow for extracted images:**

After PPTX upload, the admin sees the existing slide-by-slide review. Each slide card now shows:
- The extracted text (existing)
- **A thumbnail of the slide's image(s)** if any were found (new)
- A checkbox: "Attach this image to the questions generated from this slide"

If the admin checks the box and approves the questions, the image is uploaded to Supabase Storage and `image_url` is set on all questions derived from that slide.

**This path handles:** bulk import of diagram-heavy slides, where the image is the primary teaching tool for the entire slide.

---

### Path 3 — Direct URL Paste

The simplest path. In the question editor, admin pastes an external image URL directly.

**When to use:** images that are already hosted somewhere stable (e.g., a SAIT course website, official technical documentation, a controlled internal server).

**Risks:**
- External URLs can break if the host removes the image — question becomes image-less with no warning
- No control over image dimensions or optimization
- External requests from student browsers (privacy/CORS implications)

**Recommendation:** Support URL paste as a convenience feature, but display a **yellow warning** in the admin UI: "External URL — if this link breaks, the image will silently disappear. Upload to Supabase Storage for reliability." This path is useful for speed but should not be the primary workflow.

---

## 6. Rendering in All Study Modes

### 6.1 Quiz Mode (`QuizClient.tsx`)

The `Question` type currently has no image field. It will gain two optional fields:

```typescript
type Question = {
  id: string
  question: string
  options: { A: string; B: string; C: string; D: string }
  correct_answer: string
  explanation: string
  image_url: string | null    // ← NEW
  image_alt: string | null    // ← NEW
}
```

**Render logic:** before the question text, if `image_url` is not null, render a responsive image using Next.js `<Image>`. The image must:
- Be **full-width** within the question card
- Have `height: auto` to avoid stretching
- Show a **skeleton/placeholder** while loading (prevents layout shift that could cause accidental wrong answers from buttons moving mid-tap)
- Have `alt={image_alt}` for accessibility
- Not be clickable or zoomable in the basic MVP (pinch-to-zoom is handled by the browser natively on mobile)

**Results review page** (`/study/quiz/results`): images are shown again alongside the question for review, so students can re-examine the diagram while reading the explanation.

---

### 6.2 Flashcard Mode (`FlashcardClient.tsx`)

Flashcards show the question on the front and the answer + explanation on the back. The image is **shown on the front** (same as quiz) — it is part of the question context, not the answer.

The `/api/study/flashcards` route must be updated to include `image_url` and `image_alt` in its response. The FlashcardClient renders the image above the question text on the card front, using the same responsive `<Image>` approach as quiz mode.

---

### 6.3 Admin Review Queue (`ReviewClient.tsx`)

AI-generated questions that reference diagrams (after Path 2 is built) should show the image in the review card so the admin can verify the question makes sense in context.

The `QuestionRow` type gains `image_url` and `image_alt`. The review card shows the image in a fixed-height thumbnail (`object-contain`) above the question text. The reviewer can tell at a glance whether the AI-generated question correctly describes what is in the diagram.

---

### 6.4 Kahoot Live Game

The Kahoot plan's `QUESTION` broadcast payload (Section 6.4 of KAHOOT_1.md) must include image data:

```json
{
  "index": 2,
  "question_text": "Refer to the diagram. Component B is:",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "revealed_at": "2026-04-24T...",
  "image_url": "https://...supabase.co/storage/v1/...",
  "image_alt": "Cross-section diagram of a gate valve assembly"
}
```

Both the **host screen** (which may be projected to the class) and the **player screens** render the image. On host: image displayed large above the question, as it is the projected view the class is looking at. On player: image displayed at mobile width above the question text, before the A/B/C/D buttons.

> **Kahoot plan update required:** Section 6.4 (Broadcast Event Types) must be updated to add `image_url` and `image_alt` to the `QUESTION` event payload. This is tracked here rather than re-editing KAHOOT_1.md now.

---

## 7. PPTX Slide Image Extraction — Technical Detail

The PPTX ZIP structure relevant to images:

```
ppt/
├── slides/
│   ├── slide1.xml          ← Slide content (already parsed)
│   └── _rels/
│       └── slide1.xml.rels ← Maps rId1, rId2... to media files
├── media/
│   ├── image1.png
│   ├── image2.emf          ← Common for Office diagrams
│   └── image3.jpg
└── slideLayouts/           ← Theme/layout images (usually NOT content — must skip)
```

**What to extract vs. skip:**

Not every image in `ppt/media/` is a content diagram. PPTX files commonly include:
- **Logo/branding images** on the slide master or layout (appear on every slide — not content)
- **Background textures** referenced from `slideLayouts/` or `slideMasters/`
- **Icon/bullet images** embedded inline as decorations

**How to distinguish content images from layout images:**

Only images referenced in `ppt/slides/slideN.xml.rels` (not `slideLayouts/` rels) are slide-level content images. Images in `ppt/slideMasters/` and `ppt/slideLayouts/` rels are layout/template images and must be excluded.

**Extraction steps per slide:**
1. Parse `ppt/slides/_rels/slideN.xml.rels` for relationship entries where `Type` ends in `/image`
2. Collect the `Target` paths (e.g., `../media/image2.png`)
3. Fetch the raw bytes of those files from the ZIP using `jszip`
4. Detect the format from the filename extension
5. If renderable format (PNG, JPG, WEBP): include as-is
6. If non-renderable format (EMF, WMF): include with `is_renderable: false` flag

---

## 8. Security & Access Control

### 8.1 Storage Bucket Policy

The `question-images` bucket is **public** (read-only for anyone with the URL). Write access is restricted:

- `INSERT` / `UPDATE` / `DELETE` on bucket objects: service role only (same `SUPABASE_SERVICE_ROLE_KEY` already used in all admin API routes)
- No anonymous or authenticated-user write access

This matches the existing pattern — all data writes go through `createAdminClient()` API routes.

### 8.2 API Route Auth

- `POST /api/admin/questions/[id]/image` — requires admin role (`requireAdmin()`)
- `DELETE /api/admin/questions/[id]/image` — requires admin role
- Image URLs in quiz/flashcard API responses are read-only — no auth change needed; they are just text columns in `quiz_questions`

### 8.3 File Type Validation

Server-side file type validation must check both the file extension **and the MIME type** (not just the extension, which a user can spoof):
- Allowed: `image/png`, `image/jpeg`, `image/webp`
- Max file size: 5 MB
- Reject everything else with a 400 error and a clear message

---

## 9. Edge Cases & Failure Modes

| Scenario | Behaviour |
|---|---|
| Question has `image_url` but the Supabase Storage object was deleted | Next.js `<Image>` shows a broken image icon; the `image_alt` text is still shown via the `alt` attribute; admin sees the broken image in the review queue and is prompted to re-upload |
| PPTX slide contains only an image and zero text | The existing text extractor skips this slide entirely. With image extraction in place: the slide is no longer skipped; its image is extracted and flagged for admin review; admin can manually write a question and attach the image |
| PPTX slide image is EMF/WMF format | Image is flagged `is_renderable: false`; admin sees a warning card: "This diagram is in Windows Metafile format and cannot be displayed in a browser. Please export it as PNG from PowerPoint and re-upload manually." |
| Image is too large (> 5 MB) | API returns 400: "Image too large (max 5 MB). Export at a lower resolution or compress the file before uploading." |
| Admin uploads a non-image file (e.g., PDF or EXE) | MIME type check fails; API returns 400: "Only PNG, JPG, and WebP images are accepted." |
| Student is on a slow mobile connection | Next.js `<Image>` lazy-loads the image; a CSS skeleton placeholder is shown while it loads, preventing layout shift from causing an accidental wrong-answer tap |
| Image dimensions are very wide (e.g., a landscape technical drawing) | `width: 100%` + `height: auto` + `max-height: 40vh` CSS constraint ensures the image fits within the question card without pushing the answer buttons off-screen on mobile |
| Same image needs to be used on multiple questions from the same slide | After PPTX extraction, the same image URL from Storage is written to all questions derived from that slide. No image is stored twice. |
| Admin removes a section that had image-backed questions | Deleting the section should also delete all Storage objects under `question-images/{class_slug}/{section_id}/`. This should be a documented admin responsibility or an automated cleanup step added to the section-deletion API. |
| External URL (Path 3) stops working | `image_url` still exists in the DB; `<Image>` renders a broken image icon. The admin review queue runs a periodic check (post-MVP) that flags broken URLs. For MVP: the admin must notice and fix it manually. |

---

## 10. New API Routes

```
app/api/admin/questions/[id]/
└── image/route.ts    POST   Upload image for this question; store in Supabase Storage; update image_url + image_alt
                      DELETE Remove image from Storage and clear image_url + image_alt to NULL
```

**Extended existing routes:**

| Route | Change |
|---|---|
| `GET /api/study/quiz` | Include `image_url`, `image_alt` in question objects returned |
| `GET /api/study/flashcards` | Include `image_url`, `image_alt` in question objects returned |
| `GET /api/kahoot/state/[code]` | Include `image_url`, `image_alt` in current question data |
| `POST /api/kahoot/next` | Include `image_url`, `image_alt` in `QUESTION` broadcast payload |
| `POST /api/admin/upload-pptx` | Extract slide images alongside text; return `images[]` in slide objects |

---

## 11. New Supabase Storage Resources

| Resource | Type | Public | Purpose |
|---|---|---|---|
| `question-images` | Storage bucket | Yes | Stores all question diagram/photo images |

No new DB tables. No new auth policies beyond bucket write restriction.

---

## 12. UI Components Needed (Admin)

### 12.1 Image Uploader (per-question, in SectionManager)

- Appears in each question card in `SectionManager.tsx`
- If `image_url` is null: shows a dashed-border drop zone with "Add diagram/photo" label and a file browse button
- If `image_url` is set: shows a thumbnail of the current image, the alt text, a "Replace" button, and a "Remove" button
- Validates file type and size client-side before upload
- Shows an upload progress indicator
- On success: thumbnail updates inline without page reload

### 12.2 Image Review Card (in ReviewClient)

- If an AI-generated question has `image_url` set: shows the image in a fixed-height preview (max 200px) above the question text in the review card
- Reviewer can see what the AI was looking at when it wrote the question
- No new actions required — approve/delete still work as normal

### 12.3 Alt Text Input

- Whenever an image is uploaded (manual or PPTX-extracted), an alt text field is presented
- Required — cannot save the image without alt text
- Placeholder: "e.g. Cross-section diagram of a gate valve assembly, with parts A–D labelled"

---

## 13. Integration with Existing PPTX Upload Flow

The current upload flow (`app/admin/upload/page.tsx` → `POST /api/admin/upload-pptx` → AI generation per slide) becomes:

```
BEFORE (text only):
Upload PPTX → Extract slide text → AI generates questions → Admin reviews text-only questions

AFTER (text + images):
Upload PPTX → Extract slide text + images → AI generates questions (with image context if available)
           → Admin reviews questions + sees slide image thumbnails
           → Admin checks "Attach image to these questions"
           → On approve: image uploaded to Storage, image_url set on questions
```

The image is **not automatically attached** — the admin must consciously check the box. This prevents noise (not every slide image is useful context for its question).

---

## 14. AI Generation with Image Context (Phase 6 — Post-MVP)

The existing AI question generator (`POST /api/admin/generate-from-slide`) sends slide text to the Claude API. When a slide contains an image, Claude's **vision capability** (multimodal input) can receive the image directly and generate much higher-quality questions about what is in the diagram.

**How it would work:**

Instead of passing only text, the API would send:
```
User message:
  [image: <base64 PNG of the slide diagram>]
  [text: "Slide title: Gate Valve Assembly. Notes: Students must identify the valve components."]
  
  Generate 4 multiple-choice questions about this diagram...
```

Claude can then write questions like "Which component in the diagram controls flow direction?" that are grounded in what is actually depicted, rather than generic textbook questions.

**Why this is Phase 6 (not MVP):**
- Requires image data to be available at AI generation time (before Storage upload)
- Requires EMF → PNG conversion to be working (Claude cannot read EMF)
- Image tokens cost more than text tokens — need AI budget consideration
- The MVP path (attach image after question generation) already delivers most of the value

---

## 15. Implementation Phases

### Phase 1 — Database & Storage Foundation
- Add `image_url text NULLABLE` and `image_alt text NULLABLE` columns to `quiz_questions`
- Create `question-images` Supabase Storage bucket (public read, service-role write)
- Define Storage bucket path convention and document it

### Phase 2 — Admin Manual Upload (Per Question)
- Add image upload UI to `SectionManager.tsx` (drop zone, thumbnail, remove button, alt text field)
- Build `POST /api/admin/questions/[id]/image` route (validate type + size, upload to Storage, update DB)
- Build `DELETE /api/admin/questions/[id]/image` route (delete from Storage, null out DB)

### Phase 3 — Quiz & Flashcard Display
- Update `Question` type in `QuizClient.tsx` to include `image_url` + `image_alt`
- Update `/api/study/quiz` and `/api/study/flashcards` to return `image_url` + `image_alt`
- Render image above question text using Next.js `<Image>` with skeleton loader
- Update quiz results page to show images alongside explanations
- Update `FlashcardClient.tsx` to show image on card front

### Phase 4 — PPTX Image Extraction
- Extend `pptx-extract.ts` to extract images from `ppt/media/` matched via relationship files
- Flag EMF/WMF as non-renderable with admin warning
- Update admin PPTX upload UI to show image thumbnails per slide
- Add "Attach image to questions from this slide" checkbox to slide review
- On approve-with-image: upload to Storage and set `image_url` on all questions for that slide

### Phase 5 — Admin Review Queue Image Preview
- Update `QuestionRow` type in `ReviewClient.tsx` to include `image_url` + `image_alt`
- Render image thumbnail in each review card (max 200px height)
- Verify AI-generated questions make sense in context of their diagram

### Phase 6 — Kahoot Live Game Integration
- Update `QUESTION` broadcast payload to include `image_url` + `image_alt`
- Update host question view to render image (large, projected-screen friendly)
- Update player question view to render image above A/B/C/D buttons
- Verify mobile layout: image + question + 4 buttons all visible without scrolling on iPhone SE

### Phase 7 — AI Multimodal Generation (Post-MVP)
- Update AI generation route to pass slide images as base64 to Claude vision input
- Build EMF → PNG conversion step (prerequisite)
- Monitor AI token usage impact and update `MONTHLY_AI_BUDGET_USD` if needed
- Evaluate question quality improvement vs. cost

---

## 16. What This Does NOT Change

- The `flashcards` table (unused — confirmed in earlier audit)
- The quiz session, attempt, or progress tracking tables
- The scoring or submission logic
- The Kahoot session, player, or answer tables
- Any existing question that has `image_url = NULL` — renders exactly as before
- The admin role check or auth flow

---

## Appendix: File Format Quick Reference

| Format | Extension | Browser Renderable | Action |
|---|---|---|---|
| PNG | `.png` | ✅ Yes | Store as-is |
| JPEG | `.jpg`, `.jpeg` | ✅ Yes | Store as-is |
| WebP | `.webp` | ✅ Yes | Store as-is |
| GIF | `.gif` | ✅ Yes | Accept for upload but warn (prefer PNG/WebP for diagrams) |
| Enhanced Metafile | `.emf` | ❌ No | Flag for manual PNG replacement |
| Windows Metafile | `.wmf` | ❌ No | Flag for manual PNG replacement |
| SVG | `.svg` | ⚠️ Technically yes, but security risk in `<img>` tags | Reject at upload; ask admin to export as PNG |
| TIFF | `.tif`, `.tiff` | ❌ No | Reject; ask admin to convert to PNG |

---

*End of PICTURES_1.md — Rev 1*
