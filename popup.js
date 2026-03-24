let parsedData = null

const csvFileInput = document.getElementById("csvFile")
const uploadArea = document.getElementById("uploadArea")
const uploadText = document.getElementById("uploadText")
const fileNameEl = document.getElementById("fileName")
const categoryEl = document.getElementById("category")
const rowCountEl = document.getElementById("rowCount")
const previewBody = document.getElementById("previewBody")
const previewContainer = document.getElementById("previewContainer")
const importBtn = document.getElementById("importBtn")
const configBtn = document.getElementById("configBtn")
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

function readFileWithEncoding(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, encoding)
  })
}

async function handleFile(file) {
  let content = await readFileWithEncoding(file, "UTF-8")

  if (content.includes("\uFFFD")) {
    content = await readFileWithEncoding(file, "ISO-8859-1")
  }

  parsedData = parseCsv(content)

  if (parsedData.rows.length === 0) {
    showStatus("Keine Daten in der CSV gefunden.", "error")
    importBtn.disabled = true
    return
  }

  fileNameEl.textContent = file.name
  uploadArea.classList.add("has-file")
  uploadText.textContent = "Datei geladen:"

  if (parsedData.category) {
    categoryEl.textContent = parsedData.category
  }

  rowCountEl.textContent = `${parsedData.rows.length} Zeilen`
  renderPreview(parsedData)
  importBtn.disabled = false
  showStatus("CSV geladen. Bereit zum Import.", "info")
}

csvFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0]
  if (file) handleFile(file)
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

  chrome.tabs.sendMessage(tab.id, { type: "INJECT_CSV_DATA", payload: parsedData }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus(`Fehler: ${chrome.runtime.lastError.message}`, "error")
      importBtn.disabled = false
      return
    }

    if (response?.success) {
      showStatus(`${response.rowsInjected} Zeilen erfolgreich importiert.`, "success")
    } else {
      const errors = response?.errors?.join(", ") || "Unbekannter Fehler"
      showStatus(`Import fehlgeschlagen: ${errors}`, "error")
    }
    importBtn.disabled = false
  })
})

configBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    showStatus("Kein aktiver Tab gefunden.", "error")
    return
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["csv-parser.js", "content.js"]
    })
  } catch (_) {}

  chrome.tabs.sendMessage(tab.id, { type: "START_SELECTOR_MODE" }, (response) => {
    if (chrome.runtime.lastError) {
      showStatus(`Fehler: ${chrome.runtime.lastError.message}`, "error")
      return
    }
    showStatus("Selektor-Modus aktiviert. Elemente auf der Seite auswaehlen.", "info")
  })
})
