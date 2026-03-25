let parsedData = null

const pasteArea = document.getElementById("pasteArea")
const csvFileInput = document.getElementById("csvFile")
const uploadArea = document.getElementById("uploadArea")
const uploadText = document.getElementById("uploadText")
const fileNameEl = document.getElementById("fileName")
const categoryEl = document.getElementById("category")
const rowCountEl = document.getElementById("rowCount")
const previewBody = document.getElementById("previewBody")
const previewContainer = document.getElementById("previewContainer")
const importBtn = document.getElementById("importBtn")
const statusEl = document.getElementById("status")

function showStatus(message, type) {
  statusEl.textContent = message
  statusEl.className = `status visible ${type}`
}

function formatBetrag(amount) {
  const formatted = amount.toFixed(2).replace(".", ",") + " \u20AC"
  return { text: formatted, isNegative: amount < 0 }
}

function renderPreview(data) {
  previewBody.innerHTML = ""

  data.rows.forEach(row => {
    const tr = document.createElement("tr")
    const { text, isNegative } = formatBetrag(row.betrag)

    const datumTd = document.createElement("td")
    datumTd.textContent = row.datum
    tr.appendChild(datumTd)

    const bezTd = document.createElement("td")
    bezTd.textContent = row.bezeichnung
    tr.appendChild(bezTd)

    const betragTd = document.createElement("td")
    betragTd.textContent = text
    betragTd.className = isNegative ? "betrag-negative" : "betrag-positive"
    tr.appendChild(betragTd)

    const hinweisTd = document.createElement("td")
    hinweisTd.textContent = row.hinweis
    tr.appendChild(hinweisTd)

    previewBody.appendChild(tr)
  })

  previewContainer.classList.add("visible")
}

function loadData(data) {
  parsedData = data

  if (parsedData.rows.length === 0) {
    showStatus("Keine Daten gefunden.", "error")
    importBtn.disabled = true
    return
  }

  if (parsedData.category) {
    categoryEl.textContent = parsedData.category
  }

  rowCountEl.textContent = `${parsedData.rows.length} Zeilen`
  renderPreview(parsedData)
  importBtn.disabled = false
  showStatus("Bereit zum Import.", "info")
}

pasteArea.addEventListener("input", () => {
  const text = pasteArea.value.trim()
  if (!text) {
    importBtn.disabled = true
    previewContainer.classList.remove("visible")
    return
  }
  loadData(parsePasted(text))
})

function readFileWithEncoding(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, encoding)
  })
}

csvFileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0]
  if (!file) return

  let content = await readFileWithEncoding(file, "UTF-8")
  if (content.includes("\uFFFD")) {
    content = await readFileWithEncoding(file, "ISO-8859-1")
  }

  fileNameEl.textContent = file.name
  uploadArea.classList.add("has-file")
  uploadText.textContent = "Datei geladen:"
  pasteArea.value = ""

  loadData(parseCsv(content))
})

importBtn.addEventListener("click", async () => {
  if (!parsedData) return

  importBtn.disabled = true
  showStatus("Importiere...", "info")

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab?.id) {
    showStatus("Kein aktiver Tab gefunden.", "error")
    importBtn.disabled = false
    return
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["csv-parser.js", "content.js"]
    })
  } catch (_) {}

  chrome.tabs.sendMessage(tab.id, { type: "INJECT_CSV_DATA", payload: parsedData })
  setTimeout(() => window.close(), 100)
})
