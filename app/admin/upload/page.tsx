'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ClassRow {
  id: string
  name: string
  slug: string
  display_order: number
}

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [classes, setClasses] = useState<ClassRow[]>([])
  const [classId, setClassId] = useState('')
  const [sectionName, setSectionName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/classes')
      .then(r => r.json())
      .then(setClasses)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !classId || !sectionName.trim()) return

    setStatus('uploading')
    setMessage('')

    const form = new FormData()
    form.append('file', file)
    form.append('class_id', classId)
    form.append('section_name', sectionName.trim())

    const res = await fetch('/api/admin/upload-pptx', {
      method: 'POST',
      body: form,
    })

    const data = await res.json()

    if (!res.ok) {
      setStatus('error')
      setMessage(data.error ?? 'Upload failed')
      return
    }

    setStatus('success')
    setMessage(`✅ Uploaded "${data.section_name}" — ${data.slide_count} slides extracted`)

    // Reset form
    setSectionName('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''

    // After 2 seconds, redirect to admin sections page
    setTimeout(() => {
      router.push(`/admin/sections/${data.section_id}`)
    }, 2000)
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <Link href="/admin" className="text-orange-400 hover:text-orange-300 text-sm">
          ← Admin Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white mt-2">Upload PowerPoint</h1>
        <p className="text-gray-400 mt-1">Upload a .pptx file to extract slides and generate study content.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-gray-900 border border-gray-800 rounded-xl p-6">

        {/* Class selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Class <span className="text-red-400">*</span>
          </label>
          <select
            required
            value={classId}
            onChange={e => setClassId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-orange-500 transition-colors"
          >
            <option value="">Select a class…</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Section name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Section Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={sectionName}
            onChange={e => setSectionName(e.target.value)}
            placeholder="e.g. Shielded Metal Arc Welding"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
          <p className="text-gray-500 text-xs mt-1">The topic this PowerPoint covers.</p>
        </div>

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            PowerPoint File <span className="text-red-400">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pptx"
            required
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-orange-600 file:text-white file:text-sm file:cursor-pointer cursor-pointer focus:outline-none focus:border-orange-500 transition-colors"
          />
          {file && (
            <p className="text-gray-400 text-xs mt-1">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>
          )}
        </div>

        {/* Status message */}
        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm ${status === 'error' ? 'bg-red-900/50 border border-red-700 text-red-300' : 'bg-green-900/50 border border-green-700 text-green-300'}`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'uploading' || !file || !classId || !sectionName.trim()}
          className="w-full py-3 px-6 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
        >
          {status === 'uploading' ? 'Extracting slides…' : 'Upload & Extract Slides'}
        </button>
      </form>
    </main>
  )
}
