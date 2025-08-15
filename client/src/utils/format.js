export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '¥0'
  
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

export function formatUsd(amount) {
  if (amount == null || isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
