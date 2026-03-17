'use strict';

/**
 * Shared helpers for report modules (vitality-report.js, canvas.js).
 */

const fs = require('fs-extra');

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

/**
 * Format an ISO date string.
 * @param {string} iso
 * @param {{ full?: boolean }} [opts] - full: true → "YYYY-MM-DD HH:MM:SS UTC"; false → "YYYY-MM-DD"
 */
function formatDate(iso, { full = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  if (full) return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return d.toISOString().replace('T', ' ').slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round(Math.abs(b - a) / 86400000));
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

module.exports = { readJsonSafe, formatDate, daysBetween, truncate };
