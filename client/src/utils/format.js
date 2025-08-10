export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '¥0'
  
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

export function formatDate(dateString) {
  if (!dateString) return '-'
  
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP')
  } catch (error) {
    return dateString
  }
}

export function formatAssetName(name, note) {
  if (!name) return ''
  
  // BDD requirement: Only show parentheses if note is not empty
  if (note && note.trim()) {
    return `${name} (${note})`
  }
  
  return name
}