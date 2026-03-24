function detectDelimiter(lines) {
  const headerLine = lines.find(l => l.includes("Datum") && l.includes("Bezeichnung"))
  if (!headerLine) return ","
  if (headerLine.split(";").length >= 4) return ";"
  return ","
}

function parseAmount(raw) {
  let cleaned = raw.trim().replace(/\s*€\s*/, "").trim()
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    } else {
      cleaned = cleaned.replace(/,/g, "")
    }
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".")
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== "")

  if (lines.length < 3) {
    return { category: "", rows: [] }
  }

  const delimiter = detectDelimiter(lines)

  let categoryIndex = -1
  let headerIndex = -1

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parts = lines[i].split(delimiter).map(p => p.trim())
    if (parts.some(p => p.includes("Datum")) && parts.some(p => p.includes("Bezeichnung"))) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    return { category: "", rows: [] }
  }

  let category = ""
  for (let i = headerIndex - 1; i >= 0; i--) {
    const trimmed = lines[i].replace(/,+$/, "").replace(/;+$/, "").trim()
    if (trimmed) {
      category = trimmed
      break
    }
  }

  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const parts = lines[i].split(delimiter)
    if (parts.length < 3) continue

    const datum = parts[0].trim()
    const bezeichnung = parts[1].trim()
    const betrag = parseAmount(parts[2])
    const hinweis = parts.length > 3 ? parts[3].trim() : ""

    if (!datum && !bezeichnung) continue

    rows.push({ datum, bezeichnung, betrag, hinweis })
  }

  return { category, rows }
}

if (typeof module !== "undefined") {
  module.exports = { parseCsv, parseAmount, detectDelimiter }
}
