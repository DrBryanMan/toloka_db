/**
 * Utility functions for Toloka Anime Catalog
 */

export function debounce(fn, delay = 150) {
  let timerId = null;
  return (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delay);
  };
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return new Intl.NumberFormat('uk-UA').format(num);
}

/**
 * Generates an SVG placeholder image for missing or failed posters
 */
export function getSvgPlaceholder(title = '') {
  const cleanTitle = (title || 'Anime').trim();
  const initial = cleanTitle.charAt(0).toUpperCase();
  const safeTitle = escapeHtml(cleanTitle.slice(0, 30));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="435" viewBox="0 0 300 435">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#182338"/>
        <stop offset="50%" stop-color="#121826"/>
        <stop offset="100%" stop-color="#0a0e17"/>
      </linearGradient>
      <linearGradient id="iconGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="150" cy="180" r="55" fill="url(#iconGlow)" opacity="0.15"/>
    <circle cx="150" cy="180" r="42" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <text x="150" y="196" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="bold" fill="#60a5fa" text-anchor="middle">${initial}</text>
    <path d="M125 255 L175 255 M135 265 L165 265" stroke="rgba(255,255,255,0.15)" stroke-width="2" stroke-linecap="round"/>
    <text x="150" y="320" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">${safeTitle}</text>
    <text x="150" y="342" font-family="system-ui, -apple-system, sans-serif" font-size="11" fill="#475569" text-anchor="middle">Постер відсутній</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
