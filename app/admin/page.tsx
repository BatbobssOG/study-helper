import Link from 'next/link'

export default function AdminPage() {
  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">⚙️ Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">Manage course content for the Pipetrades Study Helper.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/sections"
          className="block p-6 bg-gray-900 border border-gray-800 rounded-xl hover:border-orange-500 transition-colors"
        >
          <div className="text-3xl mb-3">📑</div>
          <h2 className="text-lg font-semibold text-white">Manage Sections</h2>
          <p className="text-gray-400 text-sm mt-1">Generate AI questions from slides, section by section.</p>
        </Link>

        <Link
          href="/admin/review"
          className="block p-6 bg-gray-900 border border-gray-800 rounded-xl hover:border-orange-500 transition-colors"
        >
          <div className="text-3xl mb-3">✅</div>
          <h2 className="text-lg font-semibold text-white">Review Queue</h2>
          <p className="text-gray-400 text-sm mt-1">Approve or delete AI-generated quiz questions.</p>
        </Link>

        <Link
          href="/admin/upload"
          className="block p-6 bg-gray-900 border border-gray-800 rounded-xl hover:border-orange-500 transition-colors"
        >
          <div className="text-3xl mb-3">📤</div>
          <h2 className="text-lg font-semibold text-white">Upload PowerPoint</h2>
          <p className="text-gray-400 text-sm mt-1">Add a new section by uploading a .pptx file.</p>
        </Link>

        <Link
          href="/admin/questions/upload"
          className="block p-6 bg-gray-900 border border-gray-800 rounded-xl hover:border-orange-500 transition-colors"
        >
          <div className="text-3xl mb-3">📋</div>
          <h2 className="text-lg font-semibold text-white">Upload Past Exam Questions</h2>
          <p className="text-gray-400 text-sm mt-1">Bulk import real exam questions via CSV.</p>
        </Link>
      </div>
    </main>
  )
}
