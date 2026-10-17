/** Dates are calendar values, not instants. Legacy ISO timestamps remain untouched. */
export function isExperienceDate(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (typeof value !== 'string') return false
  const match = /^([1-9]\d{3})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value)
  if (match) {
    const [, y, m, d] = match
    if (!m) return true
    const month = Number(m)
    if (month < 1 || month > 12) return false
    return !d || (Number(d) >= 1 && Number(d) <= new Date(Date.UTC(Number(y), month, 0)).getUTCDate())
  }
  return /^[1-9]\d{3}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}

export function experienceDateInput(value?: string | null): string {
  if (!value) return ''
  if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return value
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
    : value
}

export const validateExperienceDate = (value: unknown) => isExperienceDate(value) || '请输入年份、年月或完整日期，例如 2020、2020-05、2020-05-18。'
