import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { extractSlides } from '@/lib/pptx-extract'
import { requireAdmin } from '@/lib/require-admin'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  await requireAdmin()
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const classId = formData.get('class_id') as string | null
  const sectionName = formData.get('section_name') as string | null

  if (!file || !classId || !sectionName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (!file.name.endsWith('.pptx')) {
    return NextResponse.json({ error: 'Must be a .pptx file' }, { status: 400 })
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const slides = await extractSlides(buffer)

  if (slides.length === 0) {
    return NextResponse.json({ error: 'No text content found in this deck' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Create section
  const { data: section, error: secErr } = await admin
    .from('sections')
    .insert({
      class_id: classId,
      name: sectionName.trim(),
      pptx_filename: file.name,
      slide_count: slides.length,
    })
    .select()
    .single()

  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 400 })
  }

  // Bulk insert slides
  const slideRows = slides.map(s => ({
    section_id: section.id,
    slide_number: s.slide_number,
    title: s.title,
    content: s.content,
    notes: s.notes,
  }))

  const { error: slidesErr } = await admin.from('slides').insert(slideRows)

  if (slidesErr) {
    // Roll back section if slides fail
    await admin.from('sections').delete().eq('id', section.id)
    return NextResponse.json({ error: slidesErr.message }, { status: 500 })
  }

  return NextResponse.json({
    section_id: section.id,
    section_name: section.name,
    slide_count: slides.length,
  })
}
