const STORE_KEY = "intelligentBoqCalculator.v1";

const ELEMENTS = {
  slab: {
    title: "Slabs",
    badge: "Slab",
    defaultName: "Concrete slab",
    thicknesses: [100, 125, 150, 175, 200, 250, 300],
    heightLabel: "Thickness is used for volume. Height can stay empty.",
    defaults: { thicknessMm: 150, height: "" }
  },
  isolatedFooting: {
    title: "Isolated Footing",
    badge: "Isolated footing",
    defaultName: "Isolated footing",
    thicknesses: [300, 450, 500, 600, 750, 900],
    heightLabel: "Use height as footing depth.",
    defaults: { thicknessMm: "", height: 0.6 }
  },
  padFooting: {
    title: "Pad Footing",
    badge: "Pad footing",
    defaultName: "Pad footing",
    thicknesses: [300, 450, 600, 750, 900, 1200],
    heightLabel: "Use height as pad depth.",
    defaults: { thicknessMm: "", height: 0.6 }
  },
  wall: {
    title: "Walls",
    badge: "Wall",
    defaultName: "Concrete wall",
    thicknesses: [100, 150, 180, 200, 250, 300],
    heightLabel: "Length x height gives wall face area. Thickness gives concrete volume.",
    defaults: { thicknessMm: 200, height: 2.7 }
  },
  roundColumn: {
    title: "Round / Radius",
    badge: "Radius element",
    defaultName: "Round column / pier",
    thicknesses: [200, 250, 300, 400, 500, 600],
    heightLabel: "Use radius or diameter, plus height.",
    defaults: { thicknessMm: "", height: 1 }
  }
};

let activeElement = "slab";
let boq = loadBoq();

const form = document.getElementById("calcForm");
const tabs = document.querySelectorAll(".tab");
const shapeSelect = document.getElementById("shapeSelect");
const thicknessChips = document.getElementById("thicknessChips");

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  setElement("slab");
  renderBoq();
  calculateAndRender();
});

function bindEvents() {
  tabs.forEach((tab) => tab.addEventListener("click", () => setElement(tab.dataset.element)));
  form.addEventListener("input", calculateAndRender);
  form.addEventListener("change", calculateAndRender);
  form.addEventListener("submit", addBoqLine);
  form.addEventListener("reset", () => setTimeout(() => setElement(activeElement), 0));
  shapeSelect.addEventListener("change", updateShapeVisibility);

  document.getElementById("toggleThicknessBtn").addEventListener("click", () => togglePanel("thicknessPanel", "toggleThicknessBtn"));
  document.getElementById("toggleFormworkBtn").addEventListener("click", () => togglePanel("formworkPanel", "toggleFormworkBtn"));
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("clearBtn").addEventListener("click", clearBoq);
  document.getElementById("boqRows").addEventListener("click", deleteLine);
}

function setElement(elementKey) {
  activeElement = elementKey;
  const config = ELEMENTS[elementKey];
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.element === elementKey));
  document.getElementById("pageTitle").textContent = config.title;
  document.getElementById("elementBadge").textContent = config.badge;

  form.name.value = config.defaultName;
  form.thicknessMm.value = config.defaults.thicknessMm;
  form.height.value = config.defaults.height;
  form.shape.value = elementKey === "roundColumn" ? "circle" : "rectangle";

  if (elementKey === "wall") {
    form.slabFormwork.checked = false;
    form.edgeBoard.checked = false;
    form.wallFaces.checked = true;
  } else if (elementKey === "slab") {
    form.slabFormwork.checked = false;
    form.edgeBoard.checked = true;
    form.wallFaces.checked = false;
  } else {
    form.edgeBoard.checked = true;
    form.wallFaces.checked = true;
  }

  renderThicknessChips(config.thicknesses, config.defaults.thicknessMm);
  updateShapeVisibility();
  calculateAndRender();

  if (window.matchMedia("(max-width: 700px)").matches) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderThicknessChips(values, selected) {
  thicknessChips.replaceChildren(...values.map((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip ${Number(selected) === value ? "active" : ""}`;
    button.textContent = `${value} mm`;
    button.addEventListener("click", () => {
      form.thicknessMm.value = value;
      document.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip === button));
      calculateAndRender();
    });
    return button;
  }));
}

function updateShapeVisibility() {
  const isCircle = shapeSelect.value === "circle";
  document.querySelectorAll(".circle-only").forEach((node) => node.classList.toggle("hidden", !isCircle));
  document.querySelectorAll(".rectangle-only").forEach((node) => node.classList.toggle("hidden", isCircle));
}

function togglePanel(panelId, buttonId) {
  const panel = document.getElementById(panelId);
  const button = document.getElementById(buttonId);
  const hidden = panel.classList.toggle("hidden");
  button.textContent = hidden ? "⌄" : "⌃";
  button.setAttribute("aria-expanded", String(!hidden));
}

function calculateAndRender() {
  const result = calculate();
  document.getElementById("planArea").textContent = `${fmt(result.area)} m²`;
  document.getElementById("volume").textContent = `${fmt(result.volume)} m³`;
  document.getElementById("perimeter").textContent = `${fmt(result.perimeter)} lm`;
  document.getElementById("formworkArea").textContent = `${fmt(result.formworkArea)} m²`;
  renderSmartNotes(result);
}

function calculate() {
  const data = getFormValues();
  const count = data.count || 1;
  const thicknessM = data.thicknessMm / 1000;
  let area = 0;
  let perimeter = 0;
  let volume = 0;
  let formworkArea = 0;
  let concreteDepth = data.height || thicknessM;
  const notes = [];

  if (data.shape === "circle") {
    const radius = data.radius || (data.diameter ? data.diameter / 2 : 0);
    area = Math.PI * radius * radius;
    perimeter = 2 * Math.PI * radius;
    concreteDepth = data.height || thicknessM;
    volume = area * concreteDepth;
    notes.push(`Radius element uses πr² for area and circumference x height for side formwork.`);
  } else if (activeElement === "wall") {
    area = data.length * data.height;
    perimeter = data.length;
    volume = data.length * thicknessM * data.height;
    notes.push(`Wall concrete volume uses length x thickness x height.`);
  } else {
    area = data.length * data.width;
    perimeter = 2 * (data.length + data.width);
    volume = area * concreteDepth;
    notes.push(`${ELEMENTS[activeElement].badge} plan area uses length x width.`);
  }

  if (activeElement === "wall") {
    formworkArea += data.wallFaces ? data.length * data.height * 2 : 0;
    formworkArea += data.edgeBoard ? thicknessM * data.height * 2 : 0;
  } else if (data.shape === "circle") {
    formworkArea += data.wallFaces || data.edgeBoard ? perimeter * concreteDepth : 0;
  } else {
    formworkArea += data.edgeBoard ? perimeter * concreteDepth : 0;
    formworkArea += data.slabFormwork ? area : 0;
    formworkArea += data.wallFaces ? perimeter * concreteDepth : 0;
  }

  const wasteFactor = 1 + data.waste / 100;
  const volumeWithWaste = volume * wasteFactor;
  const formworkWithWaste = formworkArea * wasteFactor;
  const plywoodSheetArea = data.plyLength * data.plyWidth;
  const plywoodSheets = data.plywood && plywoodSheetArea ? Math.ceil(formworkWithWaste / plywoodSheetArea) : 0;

  if (data.waste > 0) notes.push(`Waste allowance of ${data.waste}% is included in BOQ volume and formwork totals.`);
  if (data.plywood) notes.push(`Plywood sheets use ${data.plyLength} m x ${data.plyWidth} m sheet size.`);
  notes.push(ELEMENTS[activeElement].heightLabel);

  return {
    ...data,
    element: activeElement,
    elementTitle: ELEMENTS[activeElement].badge,
    area: area * count,
    perimeter: perimeter * count,
    volume: volume * count,
    formworkArea: formworkArea * count,
    volumeWithWaste: volumeWithWaste * count,
    formworkWithWaste: formworkWithWaste * count,
    plywoodSheets,
    notes
  };
}

function getFormValues() {
  return {
    name: form.name.value.trim(),
    count: numberValue(form.count.value),
    shape: form.shape.value,
    length: numberValue(form.length.value),
    width: numberValue(form.width.value),
    radius: numberValue(form.radius.value),
    diameter: numberValue(form.diameter.value),
    height: numberValue(form.height.value),
    thicknessMm: numberValue(form.thicknessMm.value),
    waste: numberValue(form.waste.value),
    edgeBoard: form.edgeBoard.checked,
    slabFormwork: form.slabFormwork.checked,
    wallFaces: form.wallFaces.checked,
    plywood: form.plywood.checked,
    plyLength: numberValue(form.plyLength.value),
    plyWidth: numberValue(form.plyWidth.value)
  };
}

function renderSmartNotes(result) {
  const wrapper = document.getElementById("smartNotes");
  wrapper.replaceChildren(...result.notes.map((note) => {
    const p = document.createElement("p");
    p.textContent = note;
    return p;
  }));
}

function addBoqLine(event) {
  event.preventDefault();
  const result = calculate();
  if (!result.name) {
    alert("Enter an element name.");
    return;
  }
  if (result.volumeWithWaste <= 0 && result.formworkWithWaste <= 0) {
    alert("Enter dimensions before adding to BOQ.");
    return;
  }

  boq.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...result
  });
  saveBoq();
  renderBoq();
}

function renderBoq() {
  const tbody = document.getElementById("boqRows");
  if (!boq.length) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="8">No BOQ lines yet.</td></tr>`;
    renderTotals();
    return;
  }

  tbody.innerHTML = boq.map((line) => `
    <tr>
      <td>${escapeHtml(line.elementTitle)}</td>
      <td><b>${escapeHtml(line.name)}</b><div class="empty-row">${line.count || 1} item(s)</div></td>
      <td>${dimensionsText(line)}</td>
      <td>${fmt(line.area)} m²</td>
      <td><b>${fmt(line.volumeWithWaste)} m³</b><div class="empty-row">raw ${fmt(line.volume)} m³</div></td>
      <td><b>${fmt(line.formworkWithWaste)} m²</b><div class="empty-row">raw ${fmt(line.formworkArea)} m²</div></td>
      <td>${line.plywoodSheets || 0} sheets</td>
      <td><button class="delete-line" data-id="${line.id}" type="button">X</button></td>
    </tr>
  `).join("");
  renderTotals();
}

function renderTotals() {
  const volume = boq.reduce((total, line) => total + numberValue(line.volumeWithWaste), 0);
  const formwork = boq.reduce((total, line) => total + numberValue(line.formworkWithWaste), 0);
  const plywood = boq.reduce((total, line) => total + numberValue(line.plywoodSheets), 0);
  document.getElementById("totalVolume").textContent = `${fmt(volume)} m³`;
  document.getElementById("totalFormwork").textContent = `${fmt(formwork)} m² FW`;
  document.getElementById("totalPlywood").textContent = `${plywood} sheets`;
}

function dimensionsText(line) {
  if (line.shape === "circle") {
    return `R ${fmt(line.radius || line.diameter / 2)} m, D ${fmt(line.diameter || line.radius * 2)} m, H ${fmt(line.height)} m`;
  }
  if (line.element === "wall") {
    return `L ${fmt(line.length)} lm, T ${fmt(line.thicknessMm)} mm, H ${fmt(line.height)} m`;
  }
  return `L ${fmt(line.length)} lm, W ${fmt(line.width)} m, H ${fmt(line.height || line.thicknessMm / 1000)} m`;
}

function deleteLine(event) {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  boq = boq.filter((line) => line.id !== button.dataset.id);
  saveBoq();
  renderBoq();
}

function clearBoq() {
  if (!boq.length) return;
  if (!confirm("Clear all BOQ lines?")) return;
  boq = [];
  saveBoq();
  renderBoq();
}

function exportCsv() {
  const headers = ["element", "name", "count", "dimensions", "area_m2", "volume_m3_with_waste", "formwork_m2_with_waste", "plywood_sheets"];
  const rows = boq.map((line) => [
    line.elementTitle,
    line.name,
    line.count,
    dimensionsText(line),
    fmt(line.area),
    fmt(line.volumeWithWaste),
    fmt(line.formworkWithWaste),
    line.plywoodSheets || 0
  ]);
  download("boq-calculator-lines.csv", "text/csv", [headers, ...rows].map(csvRow).join("\n"));
}

function exportJson() {
  download("boq-calculator-backup.json", "application/json", JSON.stringify(boq, null, 2));
}

function download(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function loadBoq() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveBoq() {
  localStorage.setItem(STORE_KEY, JSON.stringify(boq));
}

function csvRow(row) {
  return row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",");
}

function numberValue(value) {
  return Number.parseFloat(value) || 0;
}

function fmt(value) {
  return Number(value || 0).toFixed(3);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
