import { useState, useEffect, useCallback } from 'react'

const EMOJI_OPTIONS = [
  '🍔','🍕','🍜','🥗','☕','🍰','🛒','🚗','🚌','✈️','🏠','💡','💧','📱','💊','🏋️',
  '🎬','🎮','🎵','📚','👗','👟','💄','🎁','⛽','🔧','🏦','💳','📄','🧾','💸','💰',
  '🏪','🌿','🐾','🎓','🏥','🧹','🪴','🛠️','🎯','🌍','🎉','🍷','🧴','🪑','🖥️','📦',
]

const COLOR_OPTIONS = [
  '#FF6B6B','#FF8E53','#F59E0B','#FBBF24','#A3E635','#10B981',
  '#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#EC4899',
  '#F43F5E','#64748B','#8B93A5','#0EA5E9','#14B8A6','#22C55E',
]

const DEFAULT_CATS = [
  { name: 'Food',          icon: '🍔', color: '#FF6B6B' },
  { name: 'Transport',     icon: '🚗', color: '#06B6D4' },
  { name: 'Shopping',      icon: '🛍️', color: '#A855F7' },
  { name: 'Health',        icon: '💊', color: '#10B981' },
  { name: 'Bills',         icon: '📄', color: '#6366F1' },
  { name: 'Entertainment', icon: '🎬', color: '#EC4899' },
  { name: 'Fuel',          icon: '⛽', color: '#F59E0B' },
  { name: 'Dining',        icon: '🍽️', color: '#F97316' },
  { name: 'Others',        icon: '💸', color: '#8B93A5' },
]

export default function TrackerCategories() {
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [name, setName]             = useState('')
  const [icon, setIcon]             = useState('🎯')
  const [color, setColor]           = useState('#6366F1')
  const [saving, setSaving]         = useState(false)
  const [deleteId, setDeleteId]     = useState(null)
  const [error, setError]           = useState('')

  const load = useCallback(async () => {
    try {
      const data = await window.electronAPI.getExpenseCategories()
      setCategories(data)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!name.trim()) { setError('Category name is required'); return }
    setSaving(true)
    try {
      await window.electronAPI.createExpenseCategory({ name: name.trim(), icon, color })
      setName(''); setIcon('🎯'); setColor('#6366F1')
      setShowForm(false); setError('')
      load()
    } catch {}
    setSaving(false)
  }

  async function deleteCategory(id) {
    await window.electronAPI.deleteExpenseCategory(id)
    setDeleteId(null)
    load()
  }

  const customCats = categories.filter(c => !c.is_default)

  return (
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cats-page { animation: fadeInUp 0.3s ease; }
      `}</style>

      <div className="cats-page p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Categories</h1>
            <p className="text-sm text-gray-400">Manage your spending categories</p>
          </div>
          <button onClick={() => { setShowForm(f => !f); setError('') }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg,#6C63FF,#4F46E5)' }}>
            <span className="text-lg leading-none">{showForm ? '✕' : '+'}</span>
            {showForm ? 'Cancel' : 'Add Category'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 mb-5">
            <p className="text-sm font-bold text-gray-700 mb-4">New Category</p>

            {/* Name */}
            <input type="text" placeholder="Category name" value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-800 outline-none mb-1 border-2 transition-all"
              style={{ borderColor: error ? '#EF4444' : name ? '#6C63FF' : 'transparent' }} />
            {error && <p className="text-xs text-red-400 mb-3 pl-1">{error}</p>}
            {!error && <div className="mb-3" />}

            {/* Preview */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl" style={{ backgroundColor: `${color}15` }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${color}25` }}>{icon}</div>
              <div>
                <p className="font-semibold text-gray-800">{name || 'Category name'}</p>
                <p className="text-xs text-gray-400">Preview</p>
              </div>
            </div>

            {/* Emoji picker */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pick an icon</p>
            <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-2xl max-h-36 overflow-y-auto">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setIcon(e)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xl transition-all"
                  style={{
                    backgroundColor: icon === e ? `${color}25` : 'transparent',
                    transform: icon === e ? 'scale(1.15)' : 'scale(1)',
                    border: icon === e ? `2px solid ${color}` : '2px solid transparent',
                  }}>{e}</button>
              ))}
            </div>

            {/* Color picker */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pick a color</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-xl transition-all"
                  style={{
                    backgroundColor: c,
                    transform: color === c ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${c}` : 'none',
                  }} />
              ))}
            </div>

            <button onClick={save} disabled={saving}
              className="w-full py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-60 transition-all"
              style={{ background: 'linear-gradient(135deg,#6C63FF,#4F46E5)' }}>
              {saving ? 'Saving…' : 'Save Category'}
            </button>
          </div>
        )}

        {/* Default categories */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-700">Default Categories</p>
            <p className="text-xs text-gray-400 mt-0.5">Built-in categories — cannot be deleted</p>
          </div>
          <div className="divide-y divide-gray-50">
            {DEFAULT_CATS.map(cat => (
              <div key={cat.name} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: `${cat.color}18` }}>{cat.icon}</div>
                <span className="text-sm font-semibold text-gray-700 flex-1">{cat.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${cat.color}18`, color: cat.color }}>Default</span>
              </div>
            ))}
          </div>
        </div>

        {/* Custom categories */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-700">Custom Categories</p>
            <p className="text-xs text-gray-400 mt-0.5">{customCats.length} custom {customCats.length === 1 ? 'category' : 'categories'}</p>
          </div>
          {customCats.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-3xl mb-2">🏷️</p>
              <p className="text-sm text-gray-400">No custom categories yet</p>
              <p className="text-xs text-gray-300 mt-1">Tap "Add Category" to create one</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {customCats.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 px-5 py-3.5 group">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
                    style={{ backgroundColor: `${cat.color || '#6C63FF'}18` }}>
                    {cat.icon || '🏷️'}
                  </div>
                  <span className="text-sm font-semibold text-gray-700 flex-1">{cat.name}</span>
                  {deleteId === cat.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => deleteCategory(cat.id)}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-xl">Delete</button>
                      <button onClick={() => setDeleteId(null)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(cat.id)}
                      className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all text-lg">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
