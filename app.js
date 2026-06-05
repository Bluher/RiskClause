// ======================================================
// PDF.JS SETUP 
// ======================================================

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// ======================================================
// PDF LOADER
// ======================================================

async function lirePDF(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + " ";
  }
  return text.replace(/\s+/g, " ").trim();
}

// ======================================================
// FILE INPUT — drag & drop + click
// ======================================================

const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");

uploadZone.addEventListener("click", () => fileInput.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("drag-over");
});

uploadZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") {
    await loadPDF(file);
  }
});

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) await loadPDF(file);
});

async function loadPDF(file) {
  setStatus("Lecture du PDF…");
  try {
    const text = await lirePDF(file);
    document.getElementById("contractText").value = text;
    updateCharCount(text);
    setStatus(`PDF chargé — ${Math.round(text.length / 5)} mots`);
  } catch (err) {
    setStatus("Erreur lors de la lecture du PDF.");
    console.error(err);
  }
}

// ======================================================
// CHAR COUNT
// ======================================================

const textarea = document.getElementById("contractText");

textarea.addEventListener("input", () => {
  updateCharCount(textarea.value);
});

function updateCharCount(text) {
  const n = text.length;
  document.getElementById("charCount").textContent =
    n.toLocaleString("fr-FR") + " caractères";
}

// ======================================================
// UTILITIES
// ======================================================

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function clearAll() {
  textarea.value = "";
  fileInput.value = "";
  document.getElementById("output").innerHTML = "";
  document.getElementById("charCount").textContent = "0 caractères";
  setStatus("");
}

// ======================================================
// API CALL
// ======================================================

async function callAI(contractText) {
  try {
    const response = await fetch("https://riskclause.bluher.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: contractText })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Worker error:", data);
      throw new Error(data?.error || "Worker error");
    }

    return data;

  } catch (err) {
    console.error("Fetch failed:", err);
    throw err;
  }
}

// ======================================================
// MAIN ANALYSIS
// ======================================================

async function startAnalysis() {
  const text = textarea.value.trim();

  if (text.length < 50) {
    setStatus("Texte trop court — minimum 50 caractères.");
    return;
  }

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  setStatus("");

  document.getElementById("output").innerHTML = `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <p class="spinner-label">Analyse en cours…</p>
    </div>
  `;

  try {
    const result = await callAI(text);
    renderResult(result, text);
    setStatus("");
  } catch (err) {
    document.getElementById("output").innerHTML = `
      <div class="result-card">
        <p style="color:var(--red);font-size:14px">
          Erreur lors de l'analyse. Vérifiez votre connexion et réessayez.
        </p>
        <p style="color:var(--text-3);font-size:12px;margin-top:8px;font-family:var(--font-mono)">${err.message}</p>
      </div>
    `;
    console.error(err);
  }

  btn.disabled = false;
}

// ======================================================
// RENDER RESULT
// ======================================================

function renderResult(r, rawText) {
  // Normalise verdict
  const verdictKey =
    r.verdict === "ÉLEVÉ" || r.verdict === "ELEVE"
      ? "high"
      : r.verdict === "MODÉRÉ" || r.verdict === "MODERE"
      ? "med"
      : "low";

  const verdictLabel =
    verdictKey === "high" ? "ÉLEVÉ" : verdictKey === "med" ? "MODÉRÉ" : "FAIBLE";

  const scoreClass = verdictKey;
  const score = Math.min(100, Math.max(0, r.score || 0));
  const nbChars = rawText.length;

  const clauses = r.clauses || [];
  const hautes = clauses.filter((c) => c.severite === "haute");
  const moyennes = clauses.filter((c) => c.severite === "moyenne");
  const faibles = clauses.filter((c) => c.severite === "faible");
  const positifs = r.points_positifs || [];

  // KPI color
  function kpiColor(n, thresholds) {
    if (n >= thresholds[1]) return "var(--red)";
    if (n >= thresholds[0]) return "var(--orange)";
    return "var(--green)";
  }

  // Clause HTML
  function clauseHTML(c, delay) {
    const sev = c.severite || "faible";
    const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
    return `
      <div class="clause-item ${sev}" style="animation-delay:${delay}ms">
        <div class="clause-cat">
          <span class="clause-cat-name">${escapeHTML(c.categorie || "—")}</span>
          <span class="clause-sev ${sev}">${sevLabel}</span>
        </div>
        <div class="clause-extrait">"${escapeHTML(c.extrait || "")}"</div>
        <p class="clause-explication">${escapeHTML(c.explication || "")}</p>
      </div>
    `;
  }

  // Build HTML
  let html = `
    <div class="result-card" style="animation-delay:0ms">

      <!-- Verdict header -->
      <div class="verdict-header">
        <div class="verdict-left">
          <div class="verdict-badge badge-${verdictKey}">
            ${verdictKey === "high" ? "⚠" : verdictKey === "med" ? "◉" : "✓"}
            RISQUE ${verdictLabel}
          </div>
          <div class="verdict-type">${escapeHTML(r.type_contrat || "Contrat")}</div>
        </div>
        <div class="score-display">
          <div class="score-num ${scoreClass}">${score}</div>
          <div class="score-label">/ 100</div>
        </div>
      </div>

      <!-- Score bar -->
      <div class="score-bar">
        <div class="score-fill ${scoreClass}" style="width:${score}%"></div>
      </div>

      <!-- KPI grid -->
      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Clauses détectées</div>
          <div class="kpi-value" style="color:${kpiColor(clauses.length,[2,5])}">${clauses.length}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Critiques</div>
          <div class="kpi-value" style="color:${hautes.length > 0 ? "var(--red)" : "var(--green)"}">${hautes.length}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">À surveiller</div>
          <div class="kpi-value" style="color:${kpiColor(moyennes.length,[1,3])}">${moyennes.length}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Mots analysés</div>
          <div class="kpi-value" style="font-size:16px;color:var(--text-2)">${nbMots.toLocaleString("fr-FR")}</div>
        </div>
      </div>

      <!-- Résumé -->
      <p class="resume-text">${escapeHTML(r.resume || "")}</p>

      ${
        positifs.length > 0
          ? `<ul class="positifs-list">${positifs.map((p) => `<li>${escapeHTML(p)}</li>`).join("")}</ul>`
          : ""
      }

      ${
        r.conseil
          ? `<div class="conseil-box">
               <span class="conseil-icon">💡</span>
               <span>${escapeHTML(r.conseil)}</span>
             </div>`
          : ""
      }

    </div>
  `;

  // Clauses critiques
  if (hautes.length > 0) {
    html += `
      <div class="section-title">
        <span class="section-dot high"></span>
        Clauses critiques (${hautes.length})
      </div>
      ${hautes.map((c, i) => clauseHTML(c, i * 60)).join("")}
    `;
  }

  // À surveiller
  if (moyennes.length > 0) {
    html += `
      <div class="section-title">
        <span class="section-dot medium"></span>
        À surveiller (${moyennes.length})
      </div>
      ${moyennes.map((c, i) => clauseHTML(c, i * 60)).join("")}
    `;
  }

  // Mineures
  if (faibles.length > 0) {
    html += `
      <div class="section-title">
        <span class="section-dot low"></span>
        Clauses mineures (${faibles.length})
      </div>
      ${faibles.map((c, i) => clauseHTML(c, i * 60)).join("")}
    `;
  }

  // Aucune clause
  if (clauses.length === 0) {
    html += `<div class="empty-clauses">Aucune clause problématique détectée.</div>`;
  }

  document.getElementById("output").innerHTML = html;
}

// ======================================================
// UTILS
// ======================================================

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
