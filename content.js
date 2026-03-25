;(() => {

const ROW_WAIT_TIMEOUT = 5000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fillInput(input, value) {
  for (let attempt = 0; attempt < 3; attempt++) {
    input.focus()
    input.click()
    input.select()
    document.execCommand("selectAll")
    document.execCommand("delete")
    await sleep(50)
    document.execCommand("insertText", false, value)
    await sleep(50)

    const clean = (s) => s.replace(/[^0-9a-zA-Z.,]/g, "")
    if (clean(input.value).includes(clean(value).substring(0, 3))) break

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    await sleep(100)

    if (clean(input.value).includes(clean(value).substring(0, 3))) break
    await sleep(200)
  }

  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  input.dispatchEvent(new Event("blur", { bubbles: true }))
  input.dispatchEvent(new Event("focusout", { bubbles: true }))
  await sleep(200)
}

function getEmptyRow(container) {
  const rows = [...container.querySelectorAll(".row")]
  for (let i = rows.length - 1; i >= 0; i--) {
    const ei = rows[i].querySelector(".col-euro input")
    if (ei && (ei.value === "" || ei.value === "0,00 \u20AC")) return rows[i]
  }
  return null
}

async function waitForNewRow(container) {
  for (let i = 0; i < ROW_WAIT_TIMEOUT / 100; i++) {
    await sleep(100)
    const row = getEmptyRow(container)
    if (row) return row
  }
  return null
}

async function activateDateCell(row) {
  const cell = row.querySelector(".col-date")
  if (!cell) return
  cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
  cell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
  cell.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  await sleep(200)
  const input = row.querySelector(".col-date input")
  if (input) {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    input.focus()
    await sleep(200)
  }
}

async function fillRow(row, rowData) {
  await activateDateCell(row)

  const dateInput = row.querySelector(".col-date input")
  if (dateInput) await fillInput(dateInput, rowData.datum)

  if (rowData.bezeichnung) {
    const acInput = row.querySelector(".col-autocomplete input")
    if (acInput) await fillInput(acInput, rowData.bezeichnung)
  }

  const euroInput = row.querySelector(".col-euro input")
  if (euroInput) await fillInput(euroInput, rowData.betrag.toString().replace(".", ","))
}

async function injectData(data) {
  const container = document.querySelector(".table")
  if (!container) {
    return { success: false, rowsInjected: 0, errors: ["Keine Tabelle gefunden."] }
  }

  await sleep(500)

  let injected = 0
  const errors = []

  for (const rowData of data.rows) {
    const row = getEmptyRow(container)
    if (!row) {
      errors.push(`Zeile ${injected + 1}: Keine editierbare Zeile gefunden`)
      break
    }

    await fillRow(row, rowData)
    injected++

    if (injected < data.rows.length) {
      const newRow = await waitForNewRow(container)
      if (!newRow) {
        errors.push(`Zeile ${injected + 1}: Neue Zeile wurde nicht erstellt`)
        break
      }
    }
  }

  return { success: injected > 0, rowsInjected: injected, errors }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "INJECT_CSV_DATA") {
    injectData(message.payload)
      .then(sendResponse)
      .catch(e => sendResponse({ success: false, rowsInjected: 0, errors: [e.message] }))
    return true
  }
})

})()
