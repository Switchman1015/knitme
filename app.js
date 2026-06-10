const STORAGE_KEY = "knitme-state-v1";
const SERVICE_WORKER_URL = "./sw.js?v=2";
const CACHE_SAFE_MAX = 120;
const DEFAULTS = {
  rows: 24,
  cols: 24,
  cellWidth: 28,
  cellHeight: 28,
  zoom: 1,
  mode: "draw",
  focus: "cross",
  currentRow: 1,
  currentCol: 1,
};

const limits = {
  rows: { min: 1, max: CACHE_SAFE_MAX },
  cols: { min: 1, max: CACHE_SAFE_MAX },
  cellWidth: { min: 12, max: 60 },
  cellHeight: { min: 12, max: 60 },
  zoom: { min: 0.5, max: 4 },
};

const elements = {
  body: document.body,
  rowsInput: document.getElementById("rowsInput"),
  colsInput: document.getElementById("colsInput"),
  cellWidthInput: document.getElementById("cellWidthInput"),
  cellHeightInput: document.getElementById("cellHeightInput"),
  ratioValue: document.getElementById("ratioValue"),
  zoomInput: document.getElementById("zoomInput"),
  zoomValue: document.getElementById("zoomValue"),
  cellStatus: document.getElementById("cellStatus"),
  gridStatus: document.getElementById("gridStatus"),
  columnLabel: document.getElementById("columnLabel"),
  clearButton: document.getElementById("clearButton"),
  currentRowInput: document.getElementById("currentRowInput"),
  currentColInput: document.getElementById("currentColInput"),
  rowBackButton: document.getElementById("rowBackButton"),
  rowForwardButton: document.getElementById("rowForwardButton"),
  colBackButton: document.getElementById("colBackButton"),
  colForwardButton: document.getElementById("colForwardButton"),
  gridScroller: document.getElementById("gridScroller"),
  settingsToggleButton: document.getElementById("settingsToggleButton"),
  settingsCloseButton: document.getElementById("settingsCloseButton"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  settingsPanel: document.getElementById("settingsPanel"),
  modeButtons: [...document.querySelectorAll("[data-mode-button]")],
  focusButtons: [...document.querySelectorAll("[data-focus-button]")],
};

let state = loadState();
let cellElements = [];
let rowHeaderElements = [];
let colHeaderElements = [];
let isPainting = false;
let paintValue = 0;
let persistTimer = 0;
let settingsOpen = false;

setup();

function setup() {
  bindControls();
  buildGrid();
  updateFormValues();
  render();
  registerServiceWorker();
}

function bindControls() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.modeButton);
    });
  });

  elements.focusButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setFocus(button.dataset.focusButton);
    });
  });

  elements.rowsInput.addEventListener("change", applyGridSettings);
  elements.colsInput.addEventListener("change", applyGridSettings);
  elements.cellWidthInput.addEventListener("change", applyCellMetrics);
  elements.cellHeightInput.addEventListener("change", applyCellMetrics);

  elements.zoomInput.addEventListener("input", () => {
    state.zoom = clampFloat(elements.zoomInput.value, limits.zoom, DEFAULTS.zoom);
    syncMetrics();
    updateFormValues();
    queuePersist();
  });

  elements.clearButton.addEventListener("click", () => {
    if (!window.confirm("編み図を全て白に戻します。よろしいですか？")) {
      return;
    }

    state.cells = createGrid(state.rows, state.cols);
    refreshCells();
    queuePersist();
  });

  elements.currentRowInput.addEventListener("change", () => {
    setCurrentCell(
      clampInteger(elements.currentRowInput.value, limits.rows, state.currentRow),
      state.currentCol,
    );
  });

  elements.currentColInput.addEventListener("change", () => {
    setCurrentCell(
      state.currentRow,
      clampInteger(elements.currentColInput.value, limits.cols, state.currentCol),
    );
  });

  elements.rowBackButton.addEventListener("click", () => {
    setCurrentCell(state.currentRow - 1, state.currentCol);
  });

  elements.rowForwardButton.addEventListener("click", () => {
    setCurrentCell(state.currentRow + 1, state.currentCol);
  });

  elements.colBackButton.addEventListener("click", () => {
    setCurrentCell(state.currentRow, state.currentCol - 1);
  });

  elements.colForwardButton.addEventListener("click", () => {
    setCurrentCell(state.currentRow, state.currentCol + 1);
  });

  elements.gridScroller.addEventListener("pointerdown", handlePointerDown);
  elements.gridScroller.addEventListener("pointermove", handlePointerMove);
  elements.settingsToggleButton.addEventListener("click", () => {
    setSettingsOpen(!settingsOpen);
  });
  elements.settingsCloseButton.addEventListener("click", () => {
    setSettingsOpen(false);
  });
  elements.settingsBackdrop.addEventListener("click", () => {
    setSettingsOpen(false);
  });
  window.addEventListener("pointerup", stopPainting);
  window.addEventListener("pointercancel", stopPainting);
  window.addEventListener("keydown", handleKeydown);
}

function applyGridSettings() {
  const nextRows = clampInteger(elements.rowsInput.value, limits.rows, state.rows);
  const nextCols = clampInteger(elements.colsInput.value, limits.cols, state.cols);

  if (nextRows === state.rows && nextCols === state.cols) {
    updateFormValues();
    return;
  }

  state.cells = resizeGrid(state.cells, nextRows, nextCols);
  state.rows = nextRows;
  state.cols = nextCols;
  state.currentRow = clamp(state.currentRow, 1, state.rows);
  state.currentCol = clamp(state.currentCol, 1, state.cols);
  buildGrid();
  render();
  queuePersist();
}

function applyCellMetrics() {
  state.cellWidth = clampInteger(
    elements.cellWidthInput.value,
    limits.cellWidth,
    state.cellWidth,
  );
  state.cellHeight = clampInteger(
    elements.cellHeightInput.value,
    limits.cellHeight,
    state.cellHeight,
  );
  syncMetrics();
  updateFormValues();
  queuePersist();
}

function buildGrid() {
  cellElements = Array.from({ length: state.rows }, () => Array(state.cols));
  rowHeaderElements = Array.from({ length: state.rows });
  colHeaderElements = Array.from({ length: state.cols });

  const table = document.createElement("table");
  table.className = "knit-table";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "ドット編み図");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "corner-header";
  corner.scope = "col";
  corner.textContent = "#";
  headerRow.appendChild(corner);

  for (let col = 1; col <= state.cols; col += 1) {
    const th = document.createElement("th");
    th.className = "col-header";
    th.scope = "col";
    th.dataset.col = String(col);
    th.textContent = columnToLabel(col);
    colHeaderElements[col - 1] = th;
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let row = 1; row <= state.rows; row += 1) {
    const tr = document.createElement("tr");
    const rowHeader = document.createElement("th");
    rowHeader.className = "row-header";
    rowHeader.scope = "row";
    rowHeader.dataset.row = String(row);
    rowHeader.textContent = String(row);
    rowHeaderElements[row - 1] = rowHeader;
    tr.appendChild(rowHeader);

    for (let col = 1; col <= state.cols; col += 1) {
      const cell = document.createElement("td");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute("role", "gridcell");
      cellElements[row - 1][col - 1] = cell;
      tr.appendChild(cell);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  elements.gridScroller.replaceChildren(table);
  syncMetrics();
}

function render() {
  refreshCells();
  refreshViewerFocus();
  updateFormValues();
}

function refreshCells() {
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cell = cellElements[row][col];
      const filled = state.cells[row][col] === 1;
      cell.classList.toggle("is-filled", filled);
      cell.setAttribute(
        "aria-label",
        `${cellCode(row + 1, col + 1)} ${filled ? "黒" : "白"}`,
      );
    }
  }

  updateStatus();
}

function refreshViewerFocus() {
  const viewerMode = state.mode === "viewer";
  const activeRow =
    viewerMode && (state.focus === "row" || state.focus === "cross")
      ? state.currentRow
      : null;
  const activeCol =
    viewerMode && (state.focus === "column" || state.focus === "cross")
      ? state.currentCol
      : null;

  for (let row = 0; row < state.rows; row += 1) {
    const rowHeader = rowHeaderElements[row];
    rowHeader.classList.toggle("is-emphasis", viewerMode && activeRow === row + 1);

    for (let col = 0; col < state.cols; col += 1) {
      const cell = cellElements[row][col];
      const isRowFocus = activeRow === row + 1;
      const isColFocus = activeCol === col + 1;
      const isCurrent = state.currentRow === row + 1 && state.currentCol === col + 1;
      let isDimmed = false;

      if (viewerMode) {
        if (state.focus === "row") {
          isDimmed = !isRowFocus;
        } else if (state.focus === "column") {
          isDimmed = !isColFocus;
        } else {
          isDimmed = !isRowFocus && !isColFocus;
        }
      }

      cell.classList.toggle("is-row-focus", isRowFocus);
      cell.classList.toggle("is-col-focus", isColFocus);
      cell.classList.toggle("is-focus", viewerMode && isCurrent);
      cell.classList.toggle("is-dim", viewerMode && isDimmed);
    }
  }

  for (let col = 0; col < state.cols; col += 1) {
    const colHeader = colHeaderElements[col];
    colHeader.classList.toggle("is-emphasis", viewerMode && activeCol === col + 1);
  }

  updateStatus();
}

function updateStatus() {
  elements.body.dataset.mode = state.mode;
  elements.body.dataset.settingsOpen = String(settingsOpen);
  elements.cellStatus.textContent = cellCode(state.currentRow, state.currentCol);
  elements.gridStatus.textContent = `${state.cols}列 × ${state.rows}行`;
  elements.columnLabel.textContent = columnToLabel(state.currentCol);
  elements.settingsToggleButton.setAttribute("aria-expanded", String(settingsOpen));
  elements.settingsPanel.setAttribute("aria-hidden", String(!settingsOpen));
  elements.settingsBackdrop.setAttribute("aria-hidden", String(!settingsOpen));
}

function updateFormValues() {
  elements.rowsInput.value = String(state.rows);
  elements.colsInput.value = String(state.cols);
  elements.cellWidthInput.value = String(state.cellWidth);
  elements.cellHeightInput.value = String(state.cellHeight);
  elements.zoomInput.value = String(state.zoom);
  elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  elements.currentRowInput.max = String(state.rows);
  elements.currentColInput.max = String(state.cols);
  elements.currentRowInput.value = String(state.currentRow);
  elements.currentColInput.value = String(state.currentCol);
  elements.ratioValue.textContent = formatRatio(state.cellWidth / state.cellHeight);

  elements.modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modeButton === state.mode);
  });

  elements.focusButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.focusButton === state.focus);
  });
}

function syncMetrics() {
  const scaledWidth = Math.round(state.cellWidth * state.zoom);
  const scaledHeight = Math.round(state.cellHeight * state.zoom);
  document.documentElement.style.setProperty("--cell-width", `${scaledWidth}px`);
  document.documentElement.style.setProperty("--cell-height", `${scaledHeight}px`);
}

function setMode(mode) {
  if (mode !== "draw" && mode !== "viewer") {
    return;
  }

  state.mode = mode;
  updateFormValues();
  refreshViewerFocus();
  queuePersist();
}

function setFocus(focus) {
  if (!["cross", "row", "column"].includes(focus)) {
    return;
  }

  state.focus = focus;
  updateFormValues();
  refreshViewerFocus();
  queuePersist();
}

function setCurrentCell(row, col) {
  state.currentRow = clamp(row, 1, state.rows);
  state.currentCol = clamp(col, 1, state.cols);
  updateFormValues();
  refreshViewerFocus();
  queuePersist();
}

function setSettingsOpen(nextOpen) {
  settingsOpen = nextOpen;
  updateStatus();
}

function handleKeydown(event) {
  if (event.key === "Escape" && settingsOpen) {
    setSettingsOpen(false);
  }
}

function handlePointerDown(event) {
  const cell = findCellTarget(event);
  if (!cell) {
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  state.currentRow = row;
  state.currentCol = col;

  if (state.mode === "viewer") {
    updateFormValues();
    refreshViewerFocus();
    queuePersist();
    return;
  }

  event.preventDefault();
  isPainting = true;
  paintValue = state.cells[row - 1][col - 1] === 1 ? 0 : 1;
  paintCell(row, col, paintValue);
}

function handlePointerMove(event) {
  if (!isPainting || state.mode !== "draw") {
    return;
  }

  const cell = findCellTarget(event);
  if (!cell) {
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  paintCell(row, col, paintValue);
}

function stopPainting() {
  if (!isPainting) {
    return;
  }

  isPainting = false;
  queuePersist();
}

function paintCell(row, col, value) {
  if (state.cells[row - 1][col - 1] === value) {
    return;
  }

  state.cells[row - 1][col - 1] = value;
  state.currentRow = row;
  state.currentCol = col;
  cellElements[row - 1][col - 1].classList.toggle("is-filled", value === 1);
  cellElements[row - 1][col - 1].setAttribute(
    "aria-label",
    `${cellCode(row, col)} ${value === 1 ? "黒" : "白"}`,
  );
  updateFormValues();

  if (state.mode === "viewer") {
    refreshViewerFocus();
    return;
  }

  updateStatus();
}

function findCellTarget(event) {
  const directTarget = event.target.closest?.(".cell");
  if (directTarget) {
    return directTarget;
  }

  const hovered = document.elementFromPoint(event.clientX, event.clientY);
  return hovered?.closest?.(".cell") ?? null;
}

function createGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function resizeGrid(sourceGrid, nextRows, nextCols) {
  const nextGrid = createGrid(nextRows, nextCols);
  const maxRows = Math.min(sourceGrid.length, nextRows);
  const maxCols = Math.min(sourceGrid[0]?.length ?? 0, nextCols);

  for (let row = 0; row < maxRows; row += 1) {
    for (let col = 0; col < maxCols; col += 1) {
      nextGrid[row][col] = sourceGrid[row][col];
    }
  }

  return nextGrid;
}

function loadState() {
  const fallback = {
    ...DEFAULTS,
    cells: createGrid(DEFAULTS.rows, DEFAULTS.cols),
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    const rows = clampInteger(parsed.rows, limits.rows, DEFAULTS.rows);
    const cols = clampInteger(parsed.cols, limits.cols, DEFAULTS.cols);
    const restored = {
      rows,
      cols,
      cellWidth: clampInteger(parsed.cellWidth, limits.cellWidth, DEFAULTS.cellWidth),
      cellHeight: clampInteger(
        parsed.cellHeight,
        limits.cellHeight,
        DEFAULTS.cellHeight,
      ),
      zoom: clampFloat(parsed.zoom, limits.zoom, DEFAULTS.zoom),
      mode: parsed.mode === "viewer" ? "viewer" : "draw",
      focus: ["cross", "row", "column"].includes(parsed.focus)
        ? parsed.focus
        : DEFAULTS.focus,
      currentRow: 1,
      currentCol: 1,
      cells: createGrid(rows, cols),
    };

    if (Array.isArray(parsed.cells)) {
      restored.cells = resizeGrid(parsed.cells, rows, cols).map((row) =>
        row.map((value) => (value === 1 ? 1 : 0)),
      );
    }

    restored.currentRow = clampInteger(parsed.currentRow, limits.rows, 1);
    restored.currentCol = clampInteger(parsed.currentCol, limits.cols, 1);
    restored.currentRow = clamp(restored.currentRow, 1, rows);
    restored.currentCol = clamp(restored.currentCol, 1, cols);
    return restored;
  } catch (error) {
    console.warn("Failed to restore KnitMe state.", error);
    return fallback;
  }
}

function queuePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const snapshot = {
      ...state,
      cells: state.cells,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, 150);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}

function clampInteger(value, range, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return clamp(number, range.min, range.max);
}

function clampFloat(value, range, fallback) {
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return clamp(number, range.min, range.max);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatRatio(value) {
  return `${value.toFixed(2)} : 1`;
}

function columnToLabel(index) {
  let value = index;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function cellCode(row, col) {
  return `${columnToLabel(col)}${row}`;
}
