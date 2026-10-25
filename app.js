const EXIFR_URL = "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs";
const captures = [];
let exifrModule;
let map;
let flightLine;
let captureMarkers = [];
let previewMode = "thermal";
let toastTimer;

const input = document.querySelector("#image-input");
const captureList = document.querySelector("#capture-list");
const mapEmpty = document.querySelector("#map-empty");
const mosaicCanvas = document.querySelector("#mosaic-canvas");
const toast = document.querySelector("#toast");

function initializeMap() {
  if (!window.L) {
    showToast("The map library could not load. Check your internet connection and refresh.");
    return;
  }

  map = L.map("map", { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4200);
}

function classifyImage(name) {
  const lowerName = name.toLowerCase();
  if (/(thermal|infrared|therm|_tir|\btir\b|\bir\b)/i.test(lowerName)) return "thermal";
  if (/(rgb|visible|_vis|\bvis\b)/i.test(lowerName)) return "rgb";
  return "unknown";
}

function getPairKey(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/(?:[_\-. ]?(?:thermal|infrared|therm|rgb|visible|vis|tir|ir))+/gi, "")
    .replace(/[_\-. ]+/g, "")
    .trim();
}

function toCapture(file, gps, exif) {
  const latitude = Number(gps?.latitude);
  const longitude = Number(gps?.longitude);
  const hasGps =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    type: classifyImage(file.name),
    pairKey: getPairKey(file.name),
    url: URL.createObjectURL(file),
    latitude: hasGps ? latitude : null,
    longitude: hasGps ? longitude : null,
    capturedAt: exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null,
    dimensions: `${file.type || "image"} · ${formatBytes(file.size)}`,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCoordinate(value) {
  return value === null ? "No GPS" : value.toFixed(6);
}

function getFlightCaptures() {
  return captures
    .filter((capture) => capture.latitude !== null)
    .sort((a, b) => {
      if (a.capturedAt && b.capturedAt) return a.capturedAt - b.capturedAt;
      if (a.capturedAt) return -1;
      if (b.capturedAt) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
}

function isPaired(capture) {
  return capture.pairKey.length > 0 &&
    captures.some((candidate) => candidate.pairKey === capture.pairKey &&
      candidate.type !== capture.type &&
      candidate.type !== "unknown" &&
      capture.type !== "unknown");
}

function renderCaptureList() {
  document.querySelector("#image-count").textContent = String(captures.length);
  document.querySelector("#clear-button").disabled = captures.length === 0;
  document.querySelector("#sort-button").disabled = captures.length < 2;

  if (captures.length === 0) {
    captureList.innerHTML =
      '<div class="empty-list"><span aria-hidden="true">◈</span><p>Your uploaded captures will appear here.</p></div>';
    return;
  }

  captureList.replaceChildren();
  const ordered = [...captures].sort((a, b) => {
    if (a.latitude !== null && b.latitude === null) return -1;
    if (a.latitude === null && b.latitude !== null) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  for (const capture of ordered) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "capture-item";
    item.dataset.captureId = capture.id;
    item.title = capture.name;

    const thumb = document.createElement("img");
    thumb.className = "capture-thumb";
    thumb.src = capture.url;
    thumb.alt = "";

    const meta = document.createElement("span");
    meta.className = "capture-meta";
    const name = document.createElement("span");
    name.className = "capture-name";
    name.textContent = capture.name;
    const detail = document.createElement("span");
    detail.className = "capture-detail";
    detail.textContent = isPaired(capture)
      ? `${capture.type.toUpperCase()} · RGB/THERMAL PAIR`
      : `${capture.type.toUpperCase()} · ${capture.latitude === null ? "NO GPS" : "GPS READY"}`;
    meta.append(name, detail);

    const type = document.createElement("i");
    type.className = `capture-type ${capture.type}`;
    type.setAttribute("aria-hidden", "true");
    item.append(thumb, meta, type);
    item.addEventListener("click", () => focusCapture(capture));
    captureList.append(item);
  }
}

function focusCapture(capture) {
  document.querySelectorAll(".capture-item").forEach((item) => {
    item.classList.toggle("selected", item.dataset.captureId === capture.id);
  });

  if (capture.latitude === null) {
    showToast(`${capture.name} has no readable GPS coordinates in its metadata.`);
    return;
  }

  if (map) {
    document.querySelector('[data-view="map-view"]').click();
    map.setView([capture.latitude, capture.longitude], Math.max(map.getZoom(), 17));
    const marker = captureMarkers.find((entry) => entry.capture.id === capture.id)?.marker;
    if (marker) marker.openPopup();
  }
}

function renderMap() {
  if (!map) return;
  captureMarkers.forEach(({ marker }) => marker.remove());
  captureMarkers = [];
  if (flightLine) {
    flightLine.remove();
    flightLine = null;
  }

  const geotagged = getFlightCaptures();
  mapEmpty.classList.toggle("hidden", geotagged.length > 0);

  for (const [index, capture] of geotagged.entries()) {
    const icon = L.divIcon({
      className: "",
      html: `<span class="capture-marker ${capture.type}" title="${escapeHtml(capture.name)}"></span>`,
      iconSize: [13, 13],
      iconAnchor: [6, 6],
    });
    const marker = L.marker([capture.latitude, capture.longitude], { icon }).addTo(map);
    const googleMapsUrl = `https://www.google.com/maps?q=${capture.latitude},${capture.longitude}`;
    const popup = document.createElement("div");
    popup.className = "map-popup";
    const title = document.createElement("strong");
    title.textContent = capture.name;
    const details = document.createElement("span");
    details.textContent = `${capture.type.toUpperCase()} · Flight point ${index + 1}`;
    const link = document.createElement("a");
    link.href = googleMapsUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open this location in Google Maps ↗";
    popup.append(title, details, document.createElement("br"), link);
    marker.bindPopup(popup);
    captureMarkers.push({ capture, marker });
  }

  if (geotagged.length > 1) {
    flightLine = L.polyline(
      geotagged.map(({ latitude, longitude }) => [latitude, longitude]),
      { color: "#54cda8", weight: 2, opacity: 0.85, dashArray: "5 7" },
    ).addTo(map);
  }

  if (geotagged.length === 1) {
    map.setView([geotagged[0].latitude, geotagged[0].longitude], 17);
  } else if (geotagged.length > 1) {
    map.fitBounds(L.latLngBounds(geotagged.map(({ latitude, longitude }) => [latitude, longitude])), {
      padding: [45, 45],
      maxZoom: 18,
    });
  }

  document.querySelector("#gps-count").textContent = String(geotagged.length);
  document.querySelector("#thermal-count").textContent = String(
    captures.filter((capture) => capture.type === "thermal").length,
  );
  document.querySelector("#rgb-count").textContent = String(
    captures.filter((capture) => capture.type === "rgb").length,
  );

  const pairCount = captures.filter((capture) => capture.type === "thermal" && isPaired(capture)).length;
  document.querySelector("#coordinate-note").textContent =
    pairCount > 0 ? `${pairCount} RGB / thermal pair${pairCount === 1 ? "" : "s"} matched by filename` :
      `${geotagged.length} of ${captures.length} captures geotagged`;
  drawMosaic();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function drawMosaic() {
  const wrapper = document.querySelector(".mosaic-canvas-wrap");
  const width = Math.max(1, Math.floor(wrapper.clientWidth));
  const height = Math.max(1, Math.floor(wrapper.clientHeight));
  const ratio = window.devicePixelRatio || 1;
  mosaicCanvas.width = Math.floor(width * ratio);
  mosaicCanvas.height = Math.floor(height * ratio);
  mosaicCanvas.style.width = `${width}px`;
  mosaicCanvas.style.height = `${height}px`;

  const context = mosaicCanvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const geotagged = getFlightCaptures().filter((capture) => (
    previewMode === "thermal" ? capture.type === "thermal" : capture.type === "rgb"
  ));
  document.querySelector("#mosaic-title").textContent =
    `${previewMode === "thermal" ? "Thermal" : "RGB"} array preview · ${geotagged.length} geotagged`;
  document.querySelector("#mosaic-empty").classList.toggle("hidden", geotagged.length > 0);
  if (geotagged.length === 0) return;

  const points = geotagged.map((capture) => ({
    capture,
    x: capture.longitude * Math.cos((capture.latitude * Math.PI) / 180),
    y: -capture.latitude,
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 0.00001);
  const spanY = Math.max(maxY - minY, 0.00001);
  const margin = Math.min(65, width * 0.08, height * 0.08);
  const availableWidth = Math.max(1, width - 2 * margin);
  const availableHeight = Math.max(1, height - 2 * margin);
  const scale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const imageWidth = Math.max(75, Math.min(230, scale * Math.max(spanX, spanY, 0.0001) * 0.36));
  const imageHeight = imageWidth * 0.68;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  context.strokeStyle = "rgba(121, 224, 189, 0.48)";
  context.lineWidth = 1.4;
  context.setLineDash([5, 5]);
  context.beginPath();
  points.forEach((point, index) => {
    const x = width / 2 + (point.x - centerX) * scale;
    const y = height / 2 + (point.y - centerY) * scale;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.setLineDash([]);

  for (const point of points) {
    const x = width / 2 + (point.x - centerX) * scale;
    const y = height / 2 + (point.y - centerY) * scale;
    const image = new Image();
    image.onload = () => {
      if (mosaicCanvas.width === Math.floor(width * ratio)) {
        context.save();
        context.shadowColor = "rgba(0, 0, 0, 0.55)";
        context.shadowBlur = 12;
        context.shadowOffsetY = 4;
        context.fillStyle = "#101a20";
        context.fillRect(x - imageWidth / 2 - 2, y - imageHeight / 2 - 2, imageWidth + 4, imageHeight + 4);
        context.restore();
        context.drawImage(image, x - imageWidth / 2, y - imageHeight / 2, imageWidth, imageHeight);
        context.strokeStyle = point.capture.type === "thermal" ? "#f5a75f" : "#64b8ee";
        context.lineWidth = 2;
        context.strokeRect(x - imageWidth / 2, y - imageHeight / 2, imageWidth, imageHeight);
      }
    };
    image.src = point.capture.url;
  }
}

async function processFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/") || /\.(tif|tiff)$/i.test(file.name));
  if (files.length === 0) {
    showToast("Choose image files such as JPG, PNG, or TIFF.");
    return;
  }

  try {
    exifrModule ??= await import(EXIFR_URL);
  } catch (error) {
    console.error("Could not load EXIF metadata reader:", error);
    showToast("Could not load the metadata reader. Check your internet connection and try again.");
    return;
  }

  let failedMetadata = 0;
  for (const file of files) {
    if (captures.some((capture) => capture.name === file.name && capture.file.size === file.size)) continue;
    let gps = null;
    let exif = null;
    try {
      gps = await exifrModule.default.gps(file);
      exif = await exifrModule.default.parse(file, ["DateTimeOriginal"]);
    } catch (error) {
      failedMetadata += 1;
      console.warn(`Could not read metadata from ${file.name}:`, error);
    }
    captures.push(toCapture(file, gps, exif));
  }

  renderCaptureList();
  renderMap();
  if (failedMetadata > 0) {
    showToast(`${failedMetadata} image${failedMetadata === 1 ? "" : "s"} could not be read for metadata. They are still in the library.`);
  } else if (getFlightCaptures().length === 0) {
    showToast("Images added. No GPS metadata was found; map pins need embedded GPS coordinates.");
  } else {
    showToast(`${files.length} image${files.length === 1 ? "" : "s"} added. Paired names such as _RGB and _TIR are matched automatically.`);
  }
}

input.addEventListener("change", async (event) => {
  await processFiles(event.target.files);
  input.value = "";
});

const uploadZone = document.querySelector("#upload-zone");
uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadZone.classList.add("dragging");
});
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragging"));
uploadZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  uploadZone.classList.remove("dragging");
  await processFiles(event.dataTransfer.files);
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((candidate) => candidate.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".view-container").forEach((view) => view.classList.add("hidden"));
    document.querySelector(`#${tab.dataset.view}`).classList.remove("hidden");
    if (tab.dataset.view === "map-view" && map) {
      window.setTimeout(() => map.invalidateSize(), 0);
    }
    if (tab.dataset.view === "mosaic-view") {
      window.requestAnimationFrame(drawMosaic);
    }
  });
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    previewMode = button.dataset.mode;
    document.querySelectorAll(".mode-button").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    drawMosaic();
  });
});

document.querySelector("#clear-button").addEventListener("click", () => {
  captures.forEach((capture) => URL.revokeObjectURL(capture.url));
  captures.length = 0;
  renderCaptureList();
  renderMap();
});

document.querySelector("#sort-button").addEventListener("click", () => {
  showToast("Flight order uses image capture time when available, otherwise the filename.");
});

window.addEventListener("resize", () => {
  if (!document.querySelector("#mosaic-view").classList.contains("hidden")) drawMosaic();
});

initializeMap();
