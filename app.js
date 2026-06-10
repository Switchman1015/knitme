const STORAGE_KEY = "knitme-state-v2";
const SERVICE_WORKER_URL = "./sw.js?v=4";
const CACHE_SAFE_MAX = 120;
const HEADER_WIDTH = 52;
const HEADER_HEIGHT = 40;

const DEFAULTS = {
  rows: 24,
  cols: 24,
  cellWidth: 28,
  cellHeight: 28,
  zoom: 100,
  mode: "draw",
  currentRow: 1,
  currentCol: 1,
};

const limits = {
  rows: { min: 1, max: CACHE_SAFE_MAX },
  cols: { min: 1, max: CACHE_SAFE_MAX },
  cellWidth: { min: 12, max: 60 },
  cellHeight: { min: 12, max: 60 },
  zoom: { min: 50, max: 250 },
};

const elements = {
  body: document.body,
  rowsInput: document.getElementById("rowsInput"),
  colsInput: document.getElementById("colsInput"),
  cellWidthInput: document.getElementById("cellWidthInput"),
  cellHeightInput: document.getElementById("cellHeightInput"),
  rowsValue: document.getElementById("rowsValue"),
  colsValue: document.getElementById("colsValue"),
  cellWidthValue: document.getElementById("cellWidthValue"),
  cellHeightValue: document.getElementById("cellHeightValue"),
  ratioValue: document.getElementById("ratioValue"),
  zoomInput: document.getElementById("zoomInput"),
  zoomValue: document.getElementById("zoomValue"),
  zoomRangeValue: document.getElementById("zoomRangeValue"),
  cellStatus: document.getElementById("cellStatus"),
  artboardStatus: document.getElementById("artboardStatus"),
  modeStatus: document.getElementById("modeStatus"),
  modeToggleButton: document.getElementById("modeToggleButton"),
  exportButton: document.getElementById("exportButton"),
  resetButton: document.getElementById("resetButton"),
  settingsToggleButton: document.getElementById("settingsToggleButton"),
  settingsCloseButton: document.getElementById("settingsCloseButton"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  settingsPanel: document.getElementById("settingsPanel"),
  artboardViewport: document.getElementById("artboardViewport"),
  artboardCanvas: document.getElementById("artboardCanvas"),
  gridScroller: document.getElementById("gridScroller"),
};

let state = loadState();
let cellElements = [];
let rowHeaderElements = [];
let isPainting = false;
let paintValue = 0;
let persistTimer = 0;
let settingsOpen = false;
let gesture = null;
let view = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  positioned: false,
};

setup();

function setup() {
  bindControls();
  buildArtboard();
  updateFormValues();
  render();
  registerServiceWorker();
}

function bindControls() {
  elements.rowsInput.addEventListener("input", applyArtboardSize);
  elements.colsInput.addEventListener("input", applyArtboardSize);
  elements.cellWidthInput.addEventListener("input", applyCellMetrics);
  elements.cellHeightInput.addEventListener("input", applyCellMetrics);
  elements.zoomInput.addEventListener("input", handleZoomSlider);

  elements.modeToggleButton.addEventListener("click", toggleMode);
  elements.exportButton.addEventListener("click", exportArtboardPng);
  elements.resetButton.addEventListener("click", resetArtboard);
  elements.settingsToggleButton.addEventListener("click", () => {
    setSettingsOpen(!settingsOpen);
  });
  elements.settingsCloseButton.addEventListener("click", () => {
    setSettingsOpen(false);
  });
  elements.settingsBackdrop.addEventListener("click", () => {
    setSettingsOpen(false);
  });

  elements.gridScroller.addEventListener("pointerdown", handlePointerDown);
  elements.gridScroller.addEventListener("pointermove", handlePointerMove);
  elements.artboardViewport.addEventListener("touchstart", handleTouchStart, {
    passive: false,
  });
  elements.artboardViewport.addEventListener("touchmove", handleTouchMove, {
    passive: false,
  });
  elements.artboardViewport.addEventListener("touchend", handleTouchEnd, {
    passive: false,
  });
  elements.artboardViewport.addEventListener("touchcancel", handleTouchEnd, {
    passive: false,
  });

  window.addEventListener("pointerup", stopPainting);
  window.addEventListener("pointercancel", stopPainting);
  window.addEventListener("keydown", handleKeydown);
  document.addEventListener("gesturestart", preventBrowserGesture);
  document.addEventListener("gesturechange", preventBrowserGesture);
  document.addEventListener("gestureend", preventBrowserGesture);
  window.addEventListener("resize", () => {
    measureArtboard();
  });
}

function applyArtboardSize() {
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
  buildArtboard();
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
  syncCellMetrics();
  updateFormValues();
  queuePersist();
}

function handleZoomSlider() {
  const nextZoom = clampInteger(elements.zoomInput.value, limits.zoom, state.zoom);
  setZoom(nextZoom);
  queuePersist();
}

function buildArtboard() {
  cellElements = Array.from({ length: state.rows }, () => Array(state.cols));
  rowHeaderElements = Array.from({ length: state.rows });

  const table = document.createElement("table");
  table.className = "knit-table";
  table.setAttribute("role", "grid");
  table.setAttribute("aria-label", "アートボード");

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
    th.textContent = String(col);
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
      cell.dataset.viewerLabel = String(col);
      cell.setAttribute("role", "gridcell");
      cellElements[row - 1][col - 1] = cell;
      tr.appendChild(cell);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  elements.gridScroller.replaceChildren(table);
  syncCellMetrics(true);
}

function render() {
  refreshCells();
  refreshViewerMode();
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
        `${formatPosition(row + 1, col + 1)} ${filled ? "黒" : "白"}`,
      );
    }
  }

  updateStatus();
}

function refreshViewerMode() {
  const viewerMode = state.mode === "viewer";

  for (let row = 0; row < state.rows; row += 1) {
    const rowHeader = rowHeaderElements[row];
    const isActiveRow = viewerMode && state.currentRow === row + 1;

    rowHeader.classList.toggle("is-emphasis", isActiveRow);
    rowHeader.classList.toggle("is-dim", viewerMode && !isActiveRow);

    for (let col = 0; col < state.cols; col += 1) {
      const cell = cellElements[row][col];
      const isCurrent = state.currentRow === row + 1 && state.currentCol === col + 1;
      const isRowActive = viewerMode && state.currentRow === row + 1;

      cell.classList.toggle("is-focus", viewerMode && isCurrent);
      cell.classList.toggle("is-active-row", isRowActive);
      cell.classList.toggle("is-dim", viewerMode && !isRowActive);
      cell.classList.toggle("show-column-number", isRowActive);
    }
  }

  updateStatus();
}

function updateStatus() {
  elements.body.dataset.mode = state.mode;
  elements.body.dataset.settingsOpen = String(settingsOpen);
  elements.cellStatus.textContent = formatPosition(state.currentRow, state.currentCol);
  elements.artboardStatus.textContent = `${state.cols}列 × ${state.rows}行`;
  elements.modeStatus.textContent = state.mode === "draw" ? "描画" : "ビュー";
  elements.modeToggleButton.textContent =
    state.mode === "draw" ? "ビューモード" : "描画モード";
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

  elements.rowsValue.textContent = String(state.rows);
  elements.colsValue.textContent = String(state.cols);
  elements.cellWidthValue.textContent = String(state.cellWidth);
  elements.cellHeightValue.textContent = String(state.cellHeight);
  elements.zoomValue.textContent = `${state.zoom}%`;
  elements.zoomRangeValue.textContent = `${state.zoom}%`;
  elements.ratioValue.textContent = formatRatio(state.cellWidth / state.cellHeight);
}

function syncCellMetrics(recenter = false) {
  document.documentElement.style.setProperty("--cell-width", `${state.cellWidth}px`);
  document.documentElement.style.setProperty("--cell-height", `${state.cellHeight}px`);
  measureArtboard(recenter);
}

function measureArtboard(recenter = false) {
  window.requestAnimationFrame(() => {
    view.width = elements.artboardCanvas.offsetWidth;
    view.height = elements.artboardCanvas.offsetHeight;

    if (!view.positioned || recenter) {
      centerArtboard();
    } else {
      clampArtboardPosition();
      renderArtboardTransform();
    }
  });
}

function centerArtboard() {
  const viewport = getViewportSize();
  const scale = state.zoom / 100;
  const scaledWidth = view.width * scale;
  const scaledHeight = view.height * scale;

  view.x = (viewport.width - scaledWidth) / 2;
  view.y = (viewport.height - scaledHeight) / 2;
  view.positioned = true;
  clampArtboardPosition();
  renderArtboardTransform();
}

function setZoom(nextZoom, anchorX = null, anchorY = null) {
  const clampedZoom = clamp(nextZoom, limits.zoom.min, limits.zoom.max);
  const currentScale = state.zoom / 100;
  const targetScale = clampedZoom / 100;
  const viewport = getViewportSize();
  const pivotX = anchorX ?? viewport.width / 2;
  const pivotY = anchorY ?? viewport.height / 2;

  if (!view.width || !view.height) {
    state.zoom = clampedZoom;
    renderArtboardTransform();
    updateFormValues();
    updateStatus();
    return;
  }

  const contentX = (pivotX - view.x) / currentScale;
  const contentY = (pivotY - view.y) / currentScale;

  state.zoom = clampedZoom;
  view.x = pivotX - contentX * targetScale;
  view.y = pivotY - contentY * targetScale;
  clampArtboardPosition();
  renderArtboardTransform();
  updateFormValues();
  updateStatus();
}

function clampArtboardPosition() {
  const viewport = getViewportSize();
  const scale = state.zoom / 100;
  const scaledWidth = view.width * scale;
  const scaledHeight = view.height * scale;

  if (scaledWidth <= viewport.width) {
    view.x = (viewport.width - scaledWidth) / 2;
  } else {
    const minVisibleWidth = Math.min(scaledWidth * 0.1, viewport.width);
    const minX = minVisibleWidth - scaledWidth;
    const maxX = viewport.width - minVisibleWidth;
    view.x = clamp(view.x, minX, maxX);
  }

  if (scaledHeight <= viewport.height) {
    view.y = (viewport.height - scaledHeight) / 2;
  } else {
    const minVisibleHeight = Math.min(scaledHeight * 0.1, viewport.height);
    const minY = minVisibleHeight - scaledHeight;
    const maxY = viewport.height - minVisibleHeight;
    view.y = clamp(view.y, minY, maxY);
  }
}

function renderArtboardTransform() {
  elements.artboardCanvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${state.zoom / 100})`;
}

function getViewportSize() {
  return {
    width: elements.artboardViewport.clientWidth,
    height: elements.artboardViewport.clientHeight,
  };
}

function toggleMode() {
  state.mode = state.mode === "draw" ? "viewer" : "draw";
  updateFormValues();
  refreshViewerMode();
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

function preventBrowserGesture(event) {
  event.preventDefault();
}

function handlePointerDown(event) {
  if (event.pointerType === "touch") {
    return;
  }

  const cell = findCellTarget(event.clientX, event.clientY);
  if (!cell) {
    return;
  }

  applyCellInteraction(cell, true);
}

function handlePointerMove(event) {
  if (event.pointerType === "touch" || !isPainting || state.mode !== "draw") {
    return;
  }

  const cell = findCellTarget(event.clientX, event.clientY);
  if (!cell) {
    return;
  }

  paintCell(Number(cell.dataset.row), Number(cell.dataset.col), paintValue);
}

function handleTouchStart(event) {
  if (event.touches.length === 2) {
    isPainting = false;
    startGesture(event);
    event.preventDefault();
    return;
  }

  if (event.touches.length !== 1 || gesture) {
    return;
  }

  const touch = event.touches[0];
  const cell = findCellTarget(touch.clientX, touch.clientY);
  if (!cell) {
    return;
  }

  applyCellInteraction(cell, true);
  event.preventDefault();
}

function handleTouchMove(event) {
  if (gesture && event.touches.length === 2) {
    updateGesture(event);
    event.preventDefault();
    return;
  }

  if (!isPainting || state.mode !== "draw" || event.touches.length !== 1) {
    return;
  }

  const touch = event.touches[0];
  const cell = findCellTarget(touch.clientX, touch.clientY);
  if (!cell) {
    return;
  }

  paintCell(Number(cell.dataset.row), Number(cell.dataset.col), paintValue);
  event.preventDefault();
}

function handleTouchEnd(event) {
  if (gesture && event.touches.length < 2) {
    gesture = null;
    queuePersist();
  }

  if (isPainting && event.touches.length === 0) {
    isPainting = false;
    queuePersist();
  }
}

function startGesture(event) {
  const touches = [...event.touches];
  const midpoint = getTouchMidpoint(touches);
  const distance = getTouchDistance(touches);
  const currentScale = state.zoom / 100;

  gesture = {
    startDistance: distance,
    startZoom: state.zoom,
    contentX: (midpoint.x - view.x) / currentScale,
    contentY: (midpoint.y - view.y) / currentScale,
  };
}

function updateGesture(event) {
  if (!gesture) {
    return;
  }

  const touches = [...event.touches];
  const midpoint = getTouchMidpoint(touches);
  const distance = getTouchDistance(touches);
  const rawZoom = gesture.startZoom * (distance / gesture.startDistance);
  const nextZoom = clamp(Math.round(rawZoom), limits.zoom.min, limits.zoom.max);
  const nextScale = nextZoom / 100;

  state.zoom = nextZoom;
  view.x = midpoint.x - gesture.contentX * nextScale;
  view.y = midpoint.y - gesture.contentY * nextScale;
  clampArtboardPosition();
  renderArtboardTransform();
  updateFormValues();
  updateStatus();
}

function getTouchMidpoint(touches) {
  const rect = elements.artboardViewport.getBoundingClientRect();
  return {
    x: ((touches[0].clientX + touches[1].clientX) / 2) - rect.left,
    y: ((touches[0].clientY + touches[1].clientY) / 2) - rect.top,
  };
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function applyCellInteraction(cell, allowPaint) {
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  state.currentRow = row;
  state.currentCol = col;

  if (state.mode === "viewer") {
    updateFormValues();
    refreshViewerMode();
    queuePersist();
    return;
  }

  if (!allowPaint) {
    return;
  }

  isPainting = true;
  paintValue = state.cells[row - 1][col - 1] === 1 ? 0 : 1;
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
    `${formatPosition(row, col)} ${value === 1 ? "黒" : "白"}`,
  );
  updateFormValues();
  updateStatus();
}

function findCellTarget(clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  return target?.closest?.(".cell") ?? null;
}

function resetArtboard() {
  if (!window.confirm("アートボードをすべて白に戻します。よろしいですか？")) {
    return;
  }

  state.cells = createGrid(state.rows, state.cols);
  refreshCells();
  refreshViewerMode();
  queuePersist();
}

function exportArtboardPng() {
  const width = HEADER_WIDTH + state.cols * state.cellWidth;
  const height = HEADER_HEIGHT + state.rows * state.cellHeight;
  const scale = 2;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, width, height);

  drawHeaderRow(ctx);
  drawCells(ctx);

  const link = document.createElement("a");
  link.download = `knitme-artboard-${formatTimestamp()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawHeaderRow(ctx) {
  ctx.save();
  ctx.fillStyle = "rgba(245, 240, 231, 0.96)";
  ctx.strokeStyle = "#d1c6b3";
  ctx.lineWidth = 1;
  ctx.font = '700 12px "Avenir Next", "Hiragino Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);
  ctx.strokeRect(0, 0, HEADER_WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = "#766750";
  ctx.fillText("#", HEADER_WIDTH / 2, HEADER_HEIGHT / 2);

  for (let col = 1; col <= state.cols; col += 1) {
    const x = HEADER_WIDTH + (col - 1) * state.cellWidth;
    ctx.fillStyle = "rgba(245, 240, 231, 0.96)";
    ctx.fillRect(x, 0, state.cellWidth, HEADER_HEIGHT);
    ctx.strokeRect(x, 0, state.cellWidth, HEADER_HEIGHT);
    ctx.fillStyle = "#766750";
    ctx.fillText(String(col), x + state.cellWidth / 2, HEADER_HEIGHT / 2);
  }

  for (let row = 1; row <= state.rows; row += 1) {
    const y = HEADER_HEIGHT + (row - 1) * state.cellHeight;
    const isActiveRow = state.mode === "viewer" && state.currentRow === row;
    ctx.fillStyle = isActiveRow ? "rgba(54, 95, 86, 0.16)" : "rgba(245, 240, 231, 0.96)";
    ctx.fillRect(0, y, HEADER_WIDTH, state.cellHeight);
    ctx.strokeRect(0, y, HEADER_WIDTH, state.cellHeight);
    ctx.fillStyle = isActiveRow ? "#294840" : "#766750";
    ctx.fillText(String(row), HEADER_WIDTH / 2, y + state.cellHeight / 2);
  }

  ctx.restore();
}

function drawCells(ctx) {
  ctx.save();
  ctx.strokeStyle = "#d1c6b3";
  ctx.lineWidth = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(11, Math.floor(Math.min(state.cellWidth, state.cellHeight) * 0.36))}px "Avenir Next", "Hiragino Sans", sans-serif`;

  for (let row = 1; row <= state.rows; row += 1) {
    for (let col = 1; col <= state.cols; col += 1) {
      const x = HEADER_WIDTH + (col - 1) * state.cellWidth;
      const y = HEADER_HEIGHT + (row - 1) * state.cellHeight;
      const filled = state.cells[row - 1][col - 1] === 1;
      const isActiveRow = state.mode !== "viewer" || state.currentRow === row;

      ctx.globalAlpha = state.mode === "viewer" && !isActiveRow ? 0.14 : 1;
      ctx.fillStyle = filled ? "#2d2925" : "#fffdfa";
      ctx.fillRect(x, y, state.cellWidth, state.cellHeight);
      ctx.strokeRect(x, y, state.cellWidth, state.cellHeight);

      if (state.mode === "viewer" && isActiveRow) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = filled ? "#f7f3ec" : "#294840";
        ctx.fillText(String(col), x + state.cellWidth / 2, y + state.cellHeight / 2);
      }
    }
  }

  ctx.restore();
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
    const zoom = normalizeZoom(parsed.zoom);
    const restored = {
      rows,
      cols,
      cellWidth: clampInteger(parsed.cellWidth, limits.cellWidth, DEFAULTS.cellWidth),
      cellHeight: clampInteger(
        parsed.cellHeight,
        limits.cellHeight,
        DEFAULTS.cellHeight,
      ),
      zoom,
      mode: parsed.mode === "viewer" ? "viewer" : "draw",
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
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        cells: state.cells,
      }),
    );
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeZoom(rawZoom) {
  const parsed = Number(rawZoom);
  if (Number.isNaN(parsed)) {
    return DEFAULTS.zoom;
  }
  if (parsed > 0 && parsed <= 4) {
    return clamp(Math.round(parsed * 100), limits.zoom.min, limits.zoom.max);
  }
  return clamp(Math.round(parsed), limits.zoom.min, limits.zoom.max);
}

function formatRatio(value) {
  return `${value.toFixed(2)} : 1`;
}

function formatPosition(row, col) {
  return `${row}行 ${col}列`;
}

function formatTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
}
