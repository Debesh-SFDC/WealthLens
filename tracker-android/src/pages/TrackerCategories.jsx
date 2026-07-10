import { useState, useEffect } from 'react'
import { getExpenseCategories, createExpenseCategory, deleteExpenseCategory } from '../db/index.js'

const EMOJIS = ['🍔','🚗','🛍️','💊','📄','🎬','⛽','🍽️','💸','☕','🎓','🏋️','✈️','🎮','🛒','💄','🐾','🏠','💈','🧴','🎁','📱','🎵','🌿','🍕','🍺','🏥','🚌','📚','🎯']
const COLORS = ['#FF6B6B','#06B6D4','#A855F7','#10B981','#6366F1','#EC4899','#F59E0B','#F97316','#14B8A6','#EF4444','#8B5CF6','#3B82F6','#84CC16','#F43F5E','#0EA5E9','#D97706','#7C3AED','#059669']

const DEFAULT_NAMES = ['Food','Transport','Shopping','Health','Bills','Entertainment','Fuel','Dining','Others']

export default function TrackerCategories() {
  const [cats, setCats]       = useState([])
  const [name, setName]       = useState('')
  const [icon, setIcon]       = useState('💸')
  const [color, setColor]     = useState('#6C63FF')
  const [saving, setSaving]   = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  async function load() {
    try { setCats(await getExpenseCategories()) } catch {}
  }
  useEffect(() => { load() }, [])

  const defaults = cats.filter(c => DEFAULT_NAMES.includes(c.name) || c.is_default)
  const customs  = cats.filter(c => !DEFAULT_NAMES.includes(c.name) && !c.is_default)

  async function addCat() {
    if (!name.trim() || saving) return
    if (cats.find(c => c.name.toLowerCase() === name.trim().toLowerCase())) return
    setSaving(true)
    try {
      await createExpenseCategory({ name: name.trim(), icon, color })
      setName('')
      setIcon('💸')
      setColor('#6C63FF')
      await load()
    } finally { setSaving(false) }
  }

  async function doDelete(id) {
    await deleteExpenseCategory(id)
    setDeleteId(null)
    await load()
  }

  return (
    <div className="pb-24 px-4 pt-5" style={{ minHeight: '100vh', background: '#F8F9FF' }}>
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <p className="text-xl font-extrabold text-gray-900 mb-5" style={{ animation: 'fadeInUp 0.3s ease' }}>Categories</p>

      {/* Add custom */}
      <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 60ms both' }}>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Add Custom Category</p>

        {/* Preview */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl" style={{ backgroundColor: '#F9FAFB' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: color + '20', border: `2px solid ${color}` }}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{name || 'Category name'}</p>
            <p className="text-xs text-gray-400">Preview</p>
          </div>
        </div>

        <input
          type="text" placeholder="Category name" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addCat() }}
          className="w-full px-4 py-3 rounded-2xl text-sm text-gray-800 outline-none mb-3"
          style={{ backgroundColor: '#F9FAFB', border: '2px solid transparent' }}
        />

        {/* Emoji picker */}
        <p className="text-xs font-semibold text-gray-500 mb-2">Pick an icon</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setIcon(e)}
              className="w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all"
              style={{ backgroundColor: icon === e ? '#EEF2FF' : '#F3F4F6', border: `2px solid ${icon === e ? '#6C63FF' : 'transparent'}` }}>
              {e}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <p className="text-xs font-semibold text-gray-500 mb-2">Pick a color</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full transition-all"
              style={{
                backgroundColor: c,
                border: color === c ? '3px solid white' : '3px solid transparent',
                boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
              }}
            />
          ))}
        </div>

        <button onClick={addCat} disabled={!name.trim() || saving}
          className="w-full py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#6C63FF,#4338CA)' }}>
          {saving ? 'Adding…' : 'Add Category'}
        </button>
      </div>

      {/* Custom categories */}
      {customs.length > 0 && (
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm mb-4" style={{ animation: 'fadeInUp 0.3s ease 120ms both' }}>
          <p className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Your Categories</p>
          <div className="divide-y divide-gray-50">
            {customs.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                  style={{ backgroundColor: (cat.color || '#6C63FF') + '20' }}>
                  {cat.icon || '💸'}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{cat.name}</p>
                </div>
                <button onClick={() => setDeleteId(cat.id)}
                  className="p-2 rounded-xl" style={{ color: '#EF4444', backgroundColor: '#FEF2F2' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Default categories */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm" style={{ animation: 'fadeInUp 0.3s ease 180ms both' }}>
        <p className="px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">Default Categories</p>
        <div className="flex flex-wrap gap-2 p-4">
          {cats.filter(c => c.is_default || DEFAULT_NAMES.includes(c.name)).map(cat => (
            <div key={cat.id || cat.name}
              className="flex items-center gap-2 px-3 py-2 rounded-full"
              style={{ backgroundColor: (cat.color || '#8B93A5') + '15', border: `1px solid ${cat.color || '#8B93A5'}30` }}>
              <span>{cat.icon || '💸'}</span>
              <span className="text-xs font-semibold" style={{ color: cat.color || '#8B93A5' }}>{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-base font-bold text-gray-900 mb-1">Delete category?</p>
            <p className="text-sm text-gray-400 mb-5">Past expenses in this category won't be affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-700 border border-gray-200">Cancel</button>
              <button onClick={() => doDelete(deleteId)}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-bold"
                style={{ background: 'linear-gradient(135deg,#EF4444,#DC2626)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
