import JSZip from 'jszip'

export interface ExtractedSlide {
  slide_number: number
  title: string | null
  content: string
  notes: string | null
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractText(xml: string): string[] {
  const matches = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
  return matches
    .map(m => decodeXmlEntities(m[1]))
    .filter(t => t.trim().length > 0)
}

export async function extractSlides(buffer: Buffer): Promise<ExtractedSlide[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slides: ExtractedSlide[] = []

  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const ai = parseInt(a.match(/slide(\d+)/)![1])
      const bi = parseInt(b.match(/slide(\d+)/)![1])
      return ai - bi
    })

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string')
    const texts = extractText(xml)

    if (texts.length === 0) continue

    // Speaker notes
    let notes: string | null = null
    const notesFile = zip.files[`ppt/notesSlides/notesSlide${i + 1}.xml`]
    if (notesFile) {
      const notesXml = await notesFile.async('string')
      const notesTexts = extractText(notesXml).join(' ').trim()
      if (notesTexts) notes = notesTexts
    }

    slides.push({
      slide_number: i + 1,
      title: texts[0] ?? null,
      content: texts.join('\n\n'),
      notes,
    })
  }

  return slides
}
