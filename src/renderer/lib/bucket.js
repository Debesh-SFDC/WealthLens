// Need/Want bucketing (Option C): the category sets the default bucket, and each
// expense can override it per-entry. Shared between the Dashboard modal, the
// Expenses modal and TrackerHome.

export const BUCKET_META = {
  need: { label: 'Need', dot: '🔴', color: '#EF4444', bg: '#FEF2F2' },
  want: { label: 'Want', dot: '🟢', color: '#22C55E', bg: '#F0FDF4' },
}

// Fallback classification for categories that don't carry a `bucket` field yet
// (web mode seeds only a couple of categories server-side; the rest live as
// hardcoded lists in the forms). Anything not listed defaults to 'need'.
const FALLBACK_BUCKET = {
  Grocery: 'need', Groceries: 'need', 'Food & Dining': 'need', Food: 'need',
  Transportation: 'need', Transport: 'need', Healthcare: 'need', Health: 'need',
  Utilities: 'need', Rent: 'need', Education: 'need', Bills: 'need', EMI: 'need',
  Fuel: 'need', Insurance: 'need',
  Shopping: 'want', Entertainment: 'want', Travel: 'want', Dining: 'want',
  Restaurants: 'want', Others: 'want', Other: 'want', Gifts: 'want',
  Subscriptions: 'want', Hobbies: 'want',
}

export function normalizeBucket(b) {
  return b === 'want' ? 'want' : 'need'
}

// Default bucket for a category name, consulting the DB category list first.
export function bucketForCategory(name, categories = []) {
  const cat = categories.find(c => c.name === name)
  if (cat?.bucket === 'need' || cat?.bucket === 'want') return cat.bucket
  return FALLBACK_BUCKET[name] || 'need'
}
