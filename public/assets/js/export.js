// SPDX-License-Identifier: AGPL-3.0-or-later
// Exports : JSON (fichier projet), CSV, PNG et PDF.

import { flatten } from './project.js';
import { computeLayout, headerSVG, bodySVG, SVG_CSS, SVG_LIGHT_VARS, HEAD_H, ROW_H } from './gantt.js';
import { toCSV } from './csv.js';
import { slotLabel, formatFR, today, toISO, toDay } from './dates.js';
import { download, slugify, esc } from './ui.js';
import { computedSnapshot, buildICS } from './ical.js';

const FONT = 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function fileBase(project) {
  return slugify(project.project.name);
}

export function exportJSON(project, sched) {
  // Les dates calculées accompagnent le fichier : elles servent à l'abonnement iCal (ical.php).
  const data = { ...project, savedAt: new Date().toISOString(), computed: computedSnapshot(project, sched) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `${fileBase(project)}.kgantt.json`;
  download(blob, name);
  return name;
}

export function exportICS(project, sched, opts) {
  const ics = buildICS(project, computedSnapshot(project, sched), opts);
  download(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${fileBase(project)}.ics`);
}

export function exportCSV(project, sched) {
  const blob = new Blob([toCSV(project, sched)], { type: 'text/csv;charset=utf-8' });
  download(blob, `${fileBase(project)}-${toISO(today())}.csv`);
}

/** Construit un SVG autonome (titre + tableau + diagramme + légende) pour l'export. */
export function buildExportSVG(project, sched, { zoom = 'week', showBaseline = true, expandAll = true } = {}) {
  const rows = expandAll ? flatten(project) : flatten(project, { includeCollapsed: false });
  const L = computeLayout(project, sched, rows, zoom);
  const half = project.project.halfDays;
  const cols = [
    { key: 'wbs', title: 'N°', w: 44 },
    { key: 'name', title: 'Tâche', w: 250 },
    { key: 'dur', title: 'Durée', w: 56, right: true },
    { key: 'start', title: 'Début', w: half ? 120 : 82 },
    { key: 'end', title: 'Fin', w: half ? 120 : 82 },
    { key: 'pct', title: '%', w: 44, right: true },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const titleH = 70, legendH = 34;
  const bodyH = Math.max(L.height, ROW_H);
  const W = tableW + L.width;
  const H = titleH + HEAD_H + bodyH + legendH;
  const P = project.project;

  const sub = [P.team, P.className, P.teacher && `Enseignant·e : ${P.teacher}`].filter(Boolean).join('  •  ');
  const range = `${formatFR(Math.floor(sched.start / 2))} → ${formatFR(Math.floor(sched.end / 2))}`;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT}'>`);
  out.push(`<style>svg{${SVG_LIGHT_VARS}}${SVG_CSS}</style>`);
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);

  // Titre
  out.push(`<rect x="16" y="18" width="34" height="34" rx="9" fill="#4f46e5"/><text x="33" y="42" text-anchor="middle" style="fill:#fff;font-size:19px;font-weight:800">K</text>`);
  out.push(`<text class="g-title" x="62" y="34">${esc(P.name)}</text>`);
  out.push(`<text class="g-subtitle" x="62" y="54">${esc([sub, range].filter(Boolean).join('  •  '))}</text>`);
  out.push(`<text class="g-subtitle" x="${W - 16}" y="34" text-anchor="end">Avancement : <tspan style="font-weight:700;fill:#0f172a">${sched.progress} %</tspan> (attendu ${sched.expected} %)</text>`);
  out.push(`<text class="g-subtitle" x="${W - 16}" y="54" text-anchor="end">Exporté le ${formatFR(today())} avec K-Gantt</text>`);

  // Tableau
  const top = titleH;
  out.push(`<g transform="translate(0 ${top})">`);
  out.push(`<rect class="g-head-bg" width="${tableW}" height="${HEAD_H}"/>`);
  let cx = 0;
  out.push('<defs>');
  cx = 0;
  for (const c of cols) { out.push(`<clipPath id="clip-${c.key}"><rect x="${cx + 4}" y="0" width="${c.w - 8}" height="${HEAD_H + bodyH}"/></clipPath>`); cx += c.w; }
  out.push('</defs>');
  cx = 0;
  for (const c of cols) {
    const tx = c.right ? cx + c.w - 8 : cx + 8;
    out.push(`<text class="g-head-muted" style="font-size:11px;font-weight:700;text-transform:uppercase" x="${tx}" y="${HEAD_H - 14}" ${c.right ? 'text-anchor="end"' : ''}>${c.title}</text>`);
    cx += c.w;
  }
  out.push(`<line class="g-head-line" x1="0" y1="${HEAD_H - 0.5}" x2="${tableW}" y2="${HEAD_H - 0.5}"/>`);
  for (const row of L.rows) {
    const t = row.task, it = sched.items.get(t.id);
    const y = HEAD_H + row.y + ROW_H / 2 + 4;
    const vals = {
      wbs: row.wbs,
      name: (it.milestone ? '◆ ' : '') + t.name,
      dur: it.milestone ? '—' : `${String(it.summary ? it.span : t.duration).replace('.', ',')} j`,
      start: slotLabel(it.start, half),
      end: slotLabel(it.milestone ? it.start : it.end, half),
      pct: `${it.progress}%`,
    };
    cx = 0;
    for (const c of cols) {
      const indent = c.key === 'name' ? row.depth * 14 : 0;
      const tx = c.right ? cx + c.w - 8 : cx + 8 + indent;
      const cls = c.key === 'wbs' ? 'g-cell-muted' : c.key === 'name' && it.summary ? 'g-cell-strong' : 'g-cell-text';
      out.push(`<text class="${cls}" x="${tx}" y="${y}" clip-path="url(#clip-${c.key})" ${c.right ? 'text-anchor="end"' : ''}>${esc(vals[c.key])}</text>`);
      cx += c.w;
    }
    out.push(`<line class="g-grid-soft" x1="0" y1="${HEAD_H + row.y + ROW_H - 0.5}" x2="${tableW}" y2="${HEAD_H + row.y + ROW_H - 0.5}"/>`);
  }
  out.push(`<line x1="${tableW - 0.5}" y1="0" x2="${tableW - 0.5}" y2="${HEAD_H + bodyH}" stroke="#cbd5e1"/>`);
  out.push('</g>');

  // Diagramme
  out.push(`<g transform="translate(${tableW} ${top})">${headerSVG(L, sched.resolver)}</g>`);
  const body = bodySVG(project, sched, L, { interactive: false, showBaseline, minHeight: bodyH });
  out.push(`<g transform="translate(${tableW} ${top + HEAD_H})">${body.svg}</g>`);
  out.push(`<rect x="0.5" y="${top + 0.5}" width="${W - 1}" height="${HEAD_H + bodyH - 1}" fill="none" stroke="#e2e8f0"/>`);

  // Légende
  const ly = top + HEAD_H + bodyH + 22;
  const leg = [
    ['#ffffff', 'École'], ['#fef3c7', 'Entreprise'], ['#f1f5f9', 'Libre / vacances'],
  ];
  let lx = 16;
  for (const [c, label] of leg) {
    out.push(`<rect x="${lx}" y="${ly - 11}" width="14" height="14" rx="3" fill="${c}" stroke="#cbd5e1"/><text class="g-subtitle" x="${lx + 20}" y="${ly}">${label}</text>`);
    lx += 40 + label.length * 7;
  }
  out.push(`<line x1="${lx}" y1="${ly - 12}" x2="${lx}" y2="${ly + 3}" stroke="#e11d48" stroke-width="2" stroke-dasharray="3 2"/><text class="g-subtitle" x="${lx + 8}" y="${ly}">Aujourd’hui</text>`);
  lx += 100;
  if (project.baseline && showBaseline) {
    out.push(`<rect x="${lx}" y="${ly - 6}" width="22" height="4" rx="2" fill="#94a3b8"/><text class="g-subtitle" x="${lx + 28}" y="${ly}">Prévu (référence du ${formatFR(toDay(project.baseline.date))})</text>`);
  }
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: H };
}

/** Rend un SVG dans un canvas, avec un facteur d'échelle borné par les limites du navigateur. */
export function svgToCanvas(svg, width, height, scale = 2) {
  const maxSide = 16000, maxArea = 100e6;
  scale = Math.min(scale, maxSide / width, maxSide / height, Math.sqrt(maxArea / (width * height)));
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale);
      c.height = Math.round(height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ canvas: c, scale });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Impossible de générer l’image.')); };
    img.src = url;
  });
}

export async function exportPNG(project, sched, opts) {
  const { svg, width, height } = buildExportSVG(project, sched, opts);
  const { canvas } = await svgToCanvas(svg, width, height, 2);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  download(blob, `${fileBase(project)}-${toISO(today())}.png`);
}

const PAPERS = { a4: [297, 210], a3: [420, 297] };

/**
 * opts : { paper: 'a4'|'a3', fit: 'page'|'pages', zoom, showBaseline, expandAll }
 */
export async function exportPDF(project, sched, opts) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('La bibliothèque PDF n’est pas chargée.');
  const [pw, ph] = PAPERS[opts.paper] || PAPERS.a4;
  const margin = 8;
  const aw = pw - 2 * margin, ah = ph - 2 * margin - 6; // 6 mm pour le pied de page
  const { svg, width, height } = buildExportSVG(project, sched, opts);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pw, ph], compress: true });
  doc.setProperties({ title: project.project.name, creator: 'K-Gantt' });

  const footer = (i, n) => {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${ascii(project.project.name)} - K-Gantt`, margin, ph - margin + 2);
    if (n > 1) doc.text(`Page ${i} / ${n}`, pw - margin, ph - margin + 2, { align: 'right' });
  };

  if (opts.fit === 'page') {
    const mmPerPx = Math.min(aw / width, ah / height);
    const targetPx = (width * mmPerPx) / 25.4 * 200; // ~200 dpi
    const { canvas } = await svgToCanvas(svg, width, height, Math.max(1, targetPx / width));
    const w = width * mmPerPx, h = height * mmPerPx;
    doc.addImage(canvas, 'PNG', margin + (aw - w) / 2, margin, w, h, undefined, 'FAST');
    footer(1, 1);
  } else {
    // Taille réelle (1 px = 0,2646 mm à 96 dpi), découpée en pages.
    const mmPerPx = 25.4 / 96;
    const { canvas, scale } = await svgToCanvas(svg, width, height, 2);
    const tileW = Math.floor((aw / mmPerPx) * scale), tileH = Math.floor((ah / mmPerPx) * scale);
    const nx = Math.ceil(canvas.width / tileW), ny = Math.ceil(canvas.height / tileH);
    const n = nx * ny;
    let i = 0;
    for (let ty = 0; ty < ny; ty++) {
      for (let tx = 0; tx < nx; tx++) {
        const sw = Math.min(tileW, canvas.width - tx * tileW), sh = Math.min(tileH, canvas.height - ty * tileH);
        const tile = document.createElement('canvas');
        tile.width = sw; tile.height = sh;
        tile.getContext('2d').drawImage(canvas, tx * tileW, ty * tileH, sw, sh, 0, 0, sw, sh);
        if (i > 0) doc.addPage([pw, ph], 'landscape');
        doc.addImage(tile, 'PNG', margin, margin, (sw / scale) * mmPerPx, (sh / scale) * mmPerPx, undefined, 'FAST');
        footer(++i, n);
      }
    }
  }
  doc.save(`${fileBase(project)}-${toISO(today())}.pdf`);
}

/** Les polices standard de jsPDF ne couvrent pas toute l'Unicode : on simplifie le texte. */
function ascii(s) {
  return String(s || '').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\xFF]/g, '');
}
