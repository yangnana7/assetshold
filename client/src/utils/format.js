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

// Generic integer number formatter with grouping
export function formatInt(amount) {
  const n = Number(amount) || 0
  return new Intl.NumberFormat('ja-JP', {
    style: 'decimal',
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(n)
}

// Convert JPY amount to man-yen (rounded) and format with grouping
export function formatManNumber(amount) {
  // Interpret the input as already scaled for display (e.g., 万円単位の値)
  // Avoid double division by 10000 in callers like Dashboard pie chart
  return formatInt(Number(amount) || 0)
}

// JPY unit price formatter (two decimals)
export function formatYenUnit(amount) {
  if (amount == null || isNaN(amount)) return '¥0.00'
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
