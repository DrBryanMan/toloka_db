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
  const titles = window.TOLOKA_CATALOG?.titles || [];
  _fillFromCatalog(titles);
  _fetchServerStats();
}

function _fillFromCatalog(allTitles) {
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

  _setStat('stat-releases-count', total.toLocaleString('uk-UA'));
  _setStat('stat-unique-titles', uniqueHikka.toLocaleString('uk-UA'));
  _setStat('stat-dubbed-count', dubbed.toLocaleString('uk-UA'));
  _setStat('stat-subbed-count', subbed.toLocaleString('uk-UA'));
  _setStat('stat-series-ona', seriesOna.toLocaleString('uk-UA'));
  _setStat('stat-movies', movies.toLocaleString('uk-UA'));
  _setStat('stat-ova-special', ovaSpecial.toLocaleString('uk-UA'));
}

async function _fetchServerStats() {
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
