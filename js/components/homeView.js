/**
 * Home Page View — Catalog Statistics
 */

export function initHomeView({ onGoCatalog } = {}) {
  const btnGo = document.getElementById('btn-go-catalog');
  if (btnGo && onGoCatalog) {
    btnGo.addEventListener('click', onGoCatalog);
  }
}

export function renderHomeStats() {
  const catalog = window.TOLOKA_CATALOG;
  const titles = catalog?.titles || [];
  _fillFromCatalog(titles, catalog?.stats);
  _fetchServerStats();
}

function _parseSizeGb(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return null;
  const m = sizeStr.trim().match(/([\d\s]+(?:[.,]\d+)?)\s*([KMGTkmgt]?[iI]?[bB]|ГБ|МБ|КБ|ТБ|gb|mb|kb|tb)/i);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/\s+/g, '').replace(',', '.'));
  if (isNaN(val)) return null;
  const unit = m[2].toUpperCase();
  if (unit.includes('T') || unit.includes('Т')) return val * 1024;
  if (unit.includes('G') || unit.includes('Г')) return val;
  if (unit.includes('M') || unit.includes('М')) return val / 1024;
  if (unit.includes('K') || unit.includes('К')) return val / (1024 * 1024);
  return val;
}

function _formatSize(totalGb) {
  if (totalGb >= 1024) {
    return `${(totalGb / 1024).toFixed(1)} ТБ`;
  }
  return `${Math.round(totalGb)} ГБ`;
}

function _fillFromCatalog(allTitles, precomputedStats) {
  // If precomputed stats are provided in catalog.js / fallback JSON, use them directly
  if (precomputedStats) {
    if (precomputedStats.total_releases !== undefined) _setStat('stat-releases-count', precomputedStats.total_releases.toLocaleString('uk-UA'));
    if (precomputedStats.unique_titles !== undefined)  _setStat('stat-unique-titles', precomputedStats.unique_titles.toLocaleString('uk-UA'));
    if (precomputedStats.total_size_str)               _setStat('stat-total-size', precomputedStats.total_size_str);
    if (precomputedStats.dubbed !== undefined)         _setStat('stat-dubbed-count', precomputedStats.dubbed.toLocaleString('uk-UA'));
    if (precomputedStats.subbed !== undefined)         _setStat('stat-subbed-count', precomputedStats.subbed.toLocaleString('uk-UA'));
    if (precomputedStats.series_ona !== undefined)     _setStat('stat-series-ona', precomputedStats.series_ona.toLocaleString('uk-UA'));
    if (precomputedStats.movies !== undefined)         _setStat('stat-movies', precomputedStats.movies.toLocaleString('uk-UA'));
    if (precomputedStats.ova_special !== undefined)    _setStat('stat-ova-special', precomputedStats.ova_special.toLocaleString('uk-UA'));
    return;
  }

  // Client-side fallback calculation from titles array
  // Exclude child compilation cards to count actual releases (4 262)
  const titles = allTitles.filter(t => !t.is_compilation_item && !t.parent_id);
  const total = titles.length;
  const uniqueHikka = new Set(
    titles.map(t => (t.hikka_url || '').trim().toLowerCase()).filter(Boolean)
  ).size;

  const seriesOna = titles.filter(t => t.type === 'tv' || t.type === 'ona').length;
  const movies = titles.filter(t => t.type === 'movie' || t.type === 'movie?').length;
  const ovaSpecial = titles.filter(t => t.type === 'ova' || t.type === 'special').length;
  const subbed = titles.filter(t => t.has_sub).length;
  const dubbed = total;

  let totalGb = 0;
  for (const t of titles) {
    const gb = _parseSizeGb(t.torrent_size);
    if (gb !== null) totalGb += gb;
  }
  const sizeStr = totalGb > 0 ? _formatSize(totalGb) : '—';

  _setStat('stat-releases-count', total.toLocaleString('uk-UA'));
  _setStat('stat-unique-titles', uniqueHikka.toLocaleString('uk-UA'));
  _setStat('stat-total-size', sizeStr);
  _setStat('stat-dubbed-count', dubbed.toLocaleString('uk-UA'));
  _setStat('stat-subbed-count', subbed.toLocaleString('uk-UA'));
  _setStat('stat-series-ona', seriesOna.toLocaleString('uk-UA'));
  _setStat('stat-movies', movies.toLocaleString('uk-UA'));
  _setStat('stat-ova-special', ovaSpecial.toLocaleString('uk-UA'));
}

async function _fetchServerStats() {
  // On static hosting (e.g. GitHub Pages or file:), avoid unnecessary fetch to /api/stats
  const isStaticHost = window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io');
  if (isStaticHost) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('/api/stats', { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return;

    const data = await res.json();

    if (data.total_releases !== undefined) _setStat('stat-releases-count', data.total_releases.toLocaleString('uk-UA'));
    if (data.unique_titles !== undefined)  _setStat('stat-unique-titles', data.unique_titles.toLocaleString('uk-UA'));
    if (data.total_size_str)               _setStat('stat-total-size', data.total_size_str);
    if (data.dubbed !== undefined)         _setStat('stat-dubbed-count', data.dubbed.toLocaleString('uk-UA'));
    if (data.subbed !== undefined)         _setStat('stat-subbed-count', data.subbed.toLocaleString('uk-UA'));
    if (data.series_ona !== undefined)     _setStat('stat-series-ona', data.series_ona.toLocaleString('uk-UA'));
    if (data.movies !== undefined)         _setStat('stat-movies', data.movies.toLocaleString('uk-UA'));
    if (data.ova_special !== undefined)    _setStat('stat-ova-special', data.ova_special.toLocaleString('uk-UA'));
  } catch {
    // Server not running — keep catalog.js values
  }
}

function _setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
