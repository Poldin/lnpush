export function parseCsv(text: string): Record<string, string>[] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const header = rows[0]?.map((cell) => cell.trim()) ?? []
  if (header.length === 0) return []

  return rows.slice(1).flatMap((cells) => {
    if (cells.every((cell) => cell.trim() === '')) return []
    const record: Record<string, string> = {}
    header.forEach((name, cellIndex) => {
      if (!name) return
      record[name] = cells[cellIndex] ?? ''
    })
    return [record]
  })
}
