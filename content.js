const INJECTION_DELAY = 75
const ROW_WAIT_TIMEOUT = 3000

const FIELD_KEYWORDS = {
  datum: ["datum", "date", "tag"],
  bezeichnung: ["bezeichnung", "beschreibung", "name", "text", "description"],
  betrag: ["betrag", "summe", "amount", "preis", "wert", "euro"],
  hinweis: ["hinweis", "notiz", "note", "bemerkung", "kommentar"]
}

const ADD_ROW_KEYWORDS = [
  "hinzufuegen", "hinzufügen", "neue zeile", "zeile hinzufuegen",
  "zeile hinzufügen", "add", "neu", "+"
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function simulateInput(element, value) {
  element.focus()
  element.dispatchEvent(new Event("focus", { bubbles: true }))

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set

  if (nativeSetter) {
    nativeSetter.call(element, value)
  } else {
    element.value = value
  }

  element.dispatchEvent(new Event("input", { bubbles: true }))
  element.dispatchEvent(new Event("change", { bubbles: true }))
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }))
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }))
  element.blur()
  element.dispatchEvent(new Event("blur", { bubbles: true }))
}

function getElementText(el) {
  return (el.textContent || "").trim().toLowerCase()
}

function getFieldIdentifier(el) {
  const attrs = [
    el.getAttribute("name"),
    el.getAttribute("id"),
    el.getAttribute("placeholder"),
    el.getAttribute("aria-label"),
    el.getAttribute("data-field"),
    el.getAttribute("formcontrolname")
  ]

  const label = el.closest("label")?.textContent
    || document.querySelector(`label[for="${el.id}"]`)?.textContent
    || ""

  return [...attrs, label].filter(Boolean).join(" ").toLowerCase()
}

function matchFieldType(identifier) {
  for (const [type, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (keywords.some(kw => identifier.includes(kw))) return type
  }
  return null
}

function findAddRowButton() {
  const buttons = [...document.querySelectorAll("button, a, [role='button'], .btn")]

  for (const btn of buttons) {
    const text = getElementText(btn)
    if (ADD_ROW_KEYWORDS.some(kw => text.includes(kw))) return btn
  }

  for (const btn of buttons) {
    const ariaLabel = (btn.getAttribute("aria-label") || "").toLowerCase()
    const title = (btn.getAttribute("title") || "").toLowerCase()
    const combined = ariaLabel + " " + title
    if (ADD_ROW_KEYWORDS.some(kw => combined.includes(kw))) return btn
  }

  const iconBtns = [...document.querySelectorAll("[class*='add'], [class*='plus'], [class*='new']")]
  if (iconBtns.length > 0) return iconBtns[0]

  return null
}

function discoverTableInputs() {
  const tables = document.querySelectorAll("table")
  for (const table of tables) {
    const inputs = table.querySelectorAll("input, select, textarea")
    if (inputs.length >= 3) {
      return { container: table, type: "table" }
    }
  }

  const grids = document.querySelectorAll("[role='grid'], [role='table'], .grid, .table")
  for (const grid of grids) {
    const inputs = grid.querySelectorAll("input, select, textarea")
    if (inputs.length >= 3) {
      return { container: grid, type: "grid" }
    }
  }

  const forms = document.querySelectorAll("form")
  for (const form of forms) {
    const inputs = form.querySelectorAll("input, select, textarea")
    if (inputs.length >= 3) {
      return { container: form, type: "form" }
    }
  }

  return null
}

function mapFieldsInRow(row) {
  const inputs = [...row.querySelectorAll("input, select, textarea")]
  const mapped = {}

  for (const input of inputs) {
    const identifier = getFieldIdentifier(input)
    const fieldType = matchFieldType(identifier)
    if (fieldType) mapped[fieldType] = input
  }

  if (Object.keys(mapped).length < 2 && inputs.length >= 3) {
    const order = ["datum", "bezeichnung", "betrag", "hinweis"]
    inputs.forEach((input, i) => {
      if (i < order.length && !mapped[order[i]]) {
        mapped[order[i]] = input
      }
    })
  }

  return mapped
}

function getRows(container) {
  const rows = container.querySelectorAll("tr, [role='row'], .row")
  return [...rows].filter(r => {
    const inputs = r.querySelectorAll("input, select, textarea")
    return inputs.length > 0
  })
}

function waitForNewRow(container, previousCount) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const currentRows = getRows(container)
      if (currentRows.length > previousCount) {
        resolve(currentRows[currentRows.length - 1])
        return true
      }
      return false
    }

    if (check()) return

    const timeout = setTimeout(() => {
      observer.disconnect()
      if (!check()) {
        reject(new Error("Timeout: Neue Zeile nicht erschienen"))
      }
    }, ROW_WAIT_TIMEOUT)

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect()
        clearTimeout(timeout)
      }
    })

    observer.observe(container, { childList: true, subtree: true })
  })
}

async function loadStoredSelectors() {
  return new Promise(resolve => {
    chrome.storage.local.get("wisoSelectors", (result) => {
      resolve(result.wisoSelectors || null)
    })
  })
}

async function injectWithSelectors(selectors, data) {
  const addBtn = document.querySelector(selectors.addRowButton)
  if (!addBtn) {
    return { success: false, rowsInjected: 0, errors: ["Add-Row Button nicht gefunden mit gespeichertem Selektor"] }
  }

  let injected = 0
  const errors = []

  for (const row of data.rows) {
    addBtn.click()
    await sleep(200)

    const datumEl = document.querySelector(selectors.datum)
    const bezEl = document.querySelector(selectors.bezeichnung)
    const betragEl = document.querySelector(selectors.betrag)
    const hinweisEl = selectors.hinweis ? document.querySelector(selectors.hinweis) : null

    if (datumEl) simulateInput(datumEl, row.datum)
    if (bezEl) simulateInput(bezEl, row.bezeichnung)
    if (betragEl) simulateInput(betragEl, row.betrag.toString().replace(".", ","))
    if (hinweisEl && row.hinweis) simulateInput(hinweisEl, row.hinweis)

    injected++
    await sleep(INJECTION_DELAY)
  }

  return { success: true, rowsInjected: injected, errors }
}

async function injectWithAutoDiscovery(data) {
  const discovery = discoverTableInputs()
  if (!discovery) {
    return { success: false, rowsInjected: 0, errors: ["Keine Tabelle mit Eingabefeldern gefunden. Bitte Selektor-Modus verwenden."] }
  }

  const { container } = discovery
  const addBtn = findAddRowButton()

  let injected = 0
  const errors = []

  const existingRows = getRows(container)

  if (existingRows.length > 0 && !addBtn) {
    const lastRow = existingRows[existingRows.length - 1]
    const fields = mapFieldsInRow(lastRow)

    if (Object.keys(fields).length >= 2) {
      for (const row of data.rows) {
        if (fields.datum) simulateInput(fields.datum, row.datum)
        if (fields.bezeichnung) simulateInput(fields.bezeichnung, row.bezeichnung)
        if (fields.betrag) simulateInput(fields.betrag, row.betrag.toString().replace(".", ","))
        if (fields.hinweis && row.hinweis) simulateInput(fields.hinweis, row.hinweis)
        injected++

        if (addBtn) {
          const count = getRows(container).length
          addBtn.click()
          try {
            await waitForNewRow(container, count)
          } catch (_) {
            await sleep(300)
          }
        }

        await sleep(INJECTION_DELAY)
      }

      return { success: injected > 0, rowsInjected: injected, errors }
    }
  }

  if (addBtn) {
    for (const row of data.rows) {
      const count = getRows(container).length
      addBtn.click()

      let newRow
      try {
        newRow = await waitForNewRow(container, count)
      } catch (_) {
        await sleep(300)
        const rows = getRows(container)
        newRow = rows[rows.length - 1]
      }

      if (newRow) {
        const fields = mapFieldsInRow(newRow)
        if (fields.datum) simulateInput(fields.datum, row.datum)
        if (fields.bezeichnung) simulateInput(fields.bezeichnung, row.bezeichnung)
        if (fields.betrag) simulateInput(fields.betrag, row.betrag.toString().replace(".", ","))
        if (fields.hinweis && row.hinweis) simulateInput(fields.hinweis, row.hinweis)
        injected++
      } else {
        errors.push(`Zeile ${injected + 1}: Neue Zeile konnte nicht gefunden werden`)
      }

      await sleep(INJECTION_DELAY)
    }

    return { success: injected > 0, rowsInjected: injected, errors }
  }

  return { success: false, rowsInjected: 0, errors: ["Kein 'Zeile hinzufuegen' Button gefunden. Bitte Selektor-Modus verwenden."] }
}

async function injectData(data) {
  const storedSelectors = await loadStoredSelectors()

  if (storedSelectors) {
    return injectWithSelectors(storedSelectors, data)
  }

  return injectWithAutoDiscovery(data)
}

let selectorMode = false
let selectorStep = 0
let selectorOverlay = null
let collectedSelectors = {}

const SELECTOR_STEPS = [
  { key: "addRowButton", label: "Klicke auf den 'Zeile hinzufuegen' Button" },
  { key: "datum", label: "Klicke auf ein Datum-Eingabefeld" },
  { key: "bezeichnung", label: "Klicke auf ein Bezeichnung-Eingabefeld" },
  { key: "betrag", label: "Klicke auf ein Betrag-Eingabefeld" },
  { key: "hinweis", label: "Klicke auf ein Hinweis-Eingabefeld (oder druecke Escape zum Ueberspringen)" }
]

function getCssSelector(el) {
  if (el.id) return `#${el.id}`

  const parts = []
  let current = el

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    if (current.id) {
      parts.unshift(`#${current.id}`)
      break
    }

    if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/).filter(c => !c.includes("hover") && !c.includes("active") && !c.includes("focus"))
      if (classes.length > 0) {
        selector += "." + classes.slice(0, 2).join(".")
      }
    }

    const parent = current.parentElement
    if (parent) {
      const siblings = [...parent.children].filter(c => c.tagName === current.tagName)
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    parts.unshift(selector)
    current = current.parentElement
  }

  return parts.join(" > ")
}

function createOverlay() {
  const overlay = document.createElement("div")
  overlay.id = "wiso-csv-selector-overlay"
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;pointer-events:none;"

  const banner = document.createElement("div")
  banner.id = "wiso-csv-selector-banner"
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;background:#1565c0;color:white;padding:12px 16px;z-index:1000000;font-family:sans-serif;font-size:14px;text-align:center;pointer-events:auto;"
  banner.textContent = SELECTOR_STEPS[0].label

  document.body.appendChild(overlay)
  document.body.appendChild(banner)

  return { overlay, banner }
}

function startSelectorMode() {
  selectorMode = true
  selectorStep = 0
  collectedSelectors = {}

  const { overlay, banner } = createOverlay()
  selectorOverlay = { overlay, banner }

  let lastHighlighted = null

  const handleMouseMove = (e) => {
    if (!selectorMode) return
    if (lastHighlighted) lastHighlighted.style.outline = ""
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && el !== selectorOverlay.banner) {
      el.style.outline = "2px solid #1565c0"
      lastHighlighted = el
    }
  }

  const handleClick = (e) => {
    if (!selectorMode) return
    if (e.target === selectorOverlay.banner) return

    e.preventDefault()
    e.stopPropagation()

    if (lastHighlighted) lastHighlighted.style.outline = ""

    const step = SELECTOR_STEPS[selectorStep]
    collectedSelectors[step.key] = getCssSelector(e.target)

    selectorStep++

    if (selectorStep >= SELECTOR_STEPS.length) {
      finishSelectorMode()
      document.removeEventListener("mousemove", handleMouseMove, true)
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("keydown", handleKeydown, true)
    } else {
      selectorOverlay.banner.textContent = SELECTOR_STEPS[selectorStep].label
    }
  }

  const handleKeydown = (e) => {
    if (!selectorMode) return
    if (e.key === "Escape") {
      if (SELECTOR_STEPS[selectorStep].key === "hinweis") {
        selectorStep++
        if (selectorStep >= SELECTOR_STEPS.length) {
          finishSelectorMode()
        } else {
          selectorOverlay.banner.textContent = SELECTOR_STEPS[selectorStep].label
        }
      } else {
        cleanupSelectorMode()
      }
      document.removeEventListener("mousemove", handleMouseMove, true)
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("keydown", handleKeydown, true)
    }
  }

  document.addEventListener("mousemove", handleMouseMove, true)
  document.addEventListener("click", handleClick, true)
  document.addEventListener("keydown", handleKeydown, true)
}

function finishSelectorMode() {
  chrome.storage.local.set({ wisoSelectors: collectedSelectors })
  cleanupSelectorMode()
}

function cleanupSelectorMode() {
  selectorMode = false
  if (selectorOverlay) {
    selectorOverlay.overlay.remove()
    selectorOverlay.banner.remove()
    selectorOverlay = null
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "INJECT_CSV_DATA") {
    injectData(message.payload).then(sendResponse)
    return true
  }

  if (message.type === "START_SELECTOR_MODE") {
    startSelectorMode()
    sendResponse({ success: true })
    return false
  }
})
