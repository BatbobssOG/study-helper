import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/require-admin'

export const maxDuration = 60

function buildPrompt(
  className: string,
  sectionName: string,
  slideTitle: string,
  slideContent: string
): string {
  return `You are writing exam-quality multiple-choice questions for SAIT Common First Period Pipetrades apprentices (Pre-Employment program). Aim for Alberta Trades Qualifier rigour — application and analysis, not pure recall — while keeping the difficulty at apprentice (not journeyperson) level.

CLASS: ${className}
SECTION: ${sectionName}
SLIDE: ${slideTitle}

SLIDE CONTENT:
${slideContent}

GROUNDING RULES
1. Every fact you assert must be supported by the slide content above. Do not invent numbers, ratings, procedures, or fitting types not present in the slide.
2. You MAY reference Alberta/Canadian codes and standards (NPC 2015, CAN/CSA-B149.1, ASME B31.1/B31.3, AWWA, ASTM, CSA Z462, Alberta Building Code) ONLY when the slide content itself references them. Cite the specific section/clause if the slide does.

QUESTION DESIGN
3. Generate exactly 4 multiple-choice questions.
4. Each question has exactly 4 options labelled A, B, C, D, with one definitively correct answer and three plausible distractors built from common apprentice misconceptions (off-by-one numbers, swapped definitions, similar-sounding fittings, wrong code section, reversed cause/effect, etc.).
5. Vary question types across the four:
   - one definition/identification
   - one application ("which would you use when…", "what is the next step…")
   - one safety or consequence ("what happens if…", "why must you…")
   - one comparison ("which has the higher…", "what is the difference between…")
6. Favour application/analysis stems over pure recall when the slide content allows; pure recall is acceptable only when the slide is itself a definition or specification.

QUALITY CHECKLIST — every question must pass before you output it
- Stem is clear and unambiguous
- One definitively correct answer; three distractors are all plausible
- No clue inside the stem or options that gives the answer away (no "all of the above", no grammatical mismatch between stem and options, no longest-option-is-correct pattern)
- Difficulty is apprentice-level, not journeyperson-level
- All numbers, procedures, and terminology match the slide exactly

OUTPUT FORMAT
7. The correct_answer field must be a single uppercase letter: "A", "B", "C", or "D".
8. Each question must include a 1–2 sentence explanation that states why the correct answer is right and, where useful, briefly debunks the most tempting distractor.
9. Return ONLY a valid JSON array — no markdown fences, no commentary, no extra text.

JSON format:
[
  {
    "question": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct_answer": "A",
    "explanation": "..."
  }
]`
}

export async function POST(req: NextRequest) {
  // Let Next.js handle redirect/not-found naturally — don't swallow NEXT_REDIRECT
  await requireAdmin()

  try {
    const body = await req.json()
    const { slide_id } = body

    if (!slide_id) {
      return NextResponse.json({ error: 'slide_id is required' }, { status: 400 })
    }

    const db = createAdminClient()

    // Fetch the slide
    const { data: slide, error: slideErr } = await db
      .from('slides')
      .select('id, title, content, slide_number, section_id')
      .eq('id', slide_id)
      .single()

    if (slideErr || !slide) {
      return NextResponse.json({ error: `Slide not found: ${slideErr?.message}` }, { status: 404 })
    }

    if (!slide.content?.trim()) {
      return NextResponse.json({ skipped: true, reason: 'Slide has no content' })
    }

    // Fetch section + class
    const { data: section, error: secErr } = await db
      .from('sections')
      .select('id, name, class_id, classes(id, name)')
      .eq('id', slide.section_id)
      .single()

    if (secErr || !section) {
      return NextResponse.json({ error: `Section not found: ${secErr?.message}` }, { status: 404 })
    }

    const cls = section.classes as unknown as { id: string; name: string }

    if (!cls?.id || !cls?.name) {
      return NextResponse.json({ error: 'Class not found for this section' }, { status: 404 })
    }

    // Skip if already has 4+ AI questions for this slide
    const { count: existing } = await db
      .from('quiz_questions')
      .select('id', { count: 'exact', head: true })
      .eq('slide_id', slide_id)
      .eq('source', 'ai')

    if ((existing ?? 0) >= 4) {
      return NextResponse.json({ skipped: true, reason: 'Already generated', existing })
    }

    // Call Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: buildPrompt(
            cls.name,
            section.name,
            slide.title ?? `Slide ${slide.slide_number}`,
            slide.content
          ),
        },
      ],
    })

    const rawText = (message.content[0] as { type: string; text: string }).text.trim()
    // Strip markdown code fences if the model wraps its response
    const jsonText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

    let questions: Array<{
      question: string
      options: Record<string, string>
      correct_answer: string
      explanation: string
    }>

    try {
      questions = JSON.parse(jsonText)
    } catch {
      return NextResponse.json(
        { error: 'AI returned invalid JSON', raw: rawText.slice(0, 500) },
        { status: 500 }
      )
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'AI returned empty question list' }, { status: 500 })
    }

    const rows = questions.map(q => ({
      slide_id,
      section_id: section.id,
      class_id: cls.id,
      question: q.question,
      options: q.options,
      correct_answer: String(q.correct_answer).toUpperCase(),
      explanation: q.explanation,
      source: 'ai',
      approved: false,
    }))

    const { data: inserted, error: insertErr } = await db
      .from('quiz_questions')
      .insert(rows)
      .select('id')

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ generated: inserted?.length ?? 0, slide_id })
  } catch (err) {
    console.error('[generate-from-slide] Unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
