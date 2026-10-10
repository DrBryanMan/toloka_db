/**
 * Modal Dialog Component for Title Details
 */
import { escapeHtml, getSvgPlaceholder, showToast } from '../utils.js';
import { openEditModal } from './editModal.js';

let modalElement = null;
let currentModalItem = null;

export function initModal() {
  modalElement = document.getElementById('title-modal');
  if (!modalElement) return;

  // Delegated click handler for header action buttons & backdrop
  modalElement.addEventListener('click', (event) => {
    const enrichBtn = event.target.closest('.modal-enrich-hikka-btn');
    if (enrichBtn) {
      if (currentModalItem && currentModalItem.id) {
        enrichCurrentModalItem(currentModalItem, enrichBtn);
      }
      return;
    }

    const editBtn = event.target.closest('.modal-edit-btn');
    if (editBtn) {
      if (currentModalItem) {
        const itemToEdit = currentModalItem;
        modalElement.close();
        openEditModal(itemToEdit, {
          onSave: (updatedItem) => {
            openTitleModal(updatedItem);
          }
        });
      }
      return;
    }

    const closeBtn = event.target.closest('.modal-close-btn');
    if (closeBtn) {
      modalElement.close();
      return;
    }

    // Close when clicking on backdrop
    const rect = modalElement.getBoundingClientRect();
    const isInDialog = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      modalElement.close();
    }
  });

  // Remove id parameter from URL upon modal close
  modalElement.addEventListener('close', () => {
    currentModalItem = null;
    const url = new URL(window.location.href);
    if (url.searchParams.has('id') || url.searchParams.has('title')) {
      url.searchParams.delete('id');
      url.searchParams.delete('title');
      const targetUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      history.replaceState(null, '', targetUrl);
    }
  });

  // Touch swipe-down gesture to dismiss modal on mobile
  let touchStartY = 0;
  let touchStartX = 0;
  let isSwiping = false;

  modalElement.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const modalInner = modalElement.querySelector('.modal-inner');
    if (modalInner && modalInner.scrollTop > 5) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    isSwiping = true;
  }, { passive: true });

  modalElement.addEventListener('touchmove', (e) => {
    if (!isSwiping || e.touches.length !== 1) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - touchStartY;
    const diffX = Math.abs(currentX - touchStartX);

    // If scrolling up or horizontal scroll is dominant, cancel swipe gesture
    if (diffY < 0 || diffX > diffY) {
      isSwiping = false;
    }
  }, { passive: true });

  modalElement.addEventListener('touchend', (e) => {
    if (!isSwiping) return;
    isSwiping = false;
    const endY = e.changedTouches[0].clientY;
    const diffY = endY - touchStartY;
    // If pulled down by more than 80px, close modal
    if (diffY > 80) {
      modalElement.close();
    }
  }, { passive: true });
}

export function closeTitleModal() {
  if (modalElement && modalElement.open) {
    modalElement.close();
  }
}

function formatTrackProperties(val) {
  if (typeof val !== 'string') return `<span>${escapeHtml(JSON.stringify(val))}</span>`;
  const lines = val.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  return `<div class="track-meta-props">` + lines.map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 35) {
      const subKey = line.slice(0, colonIdx).trim();
      const subVal = line.slice(colonIdx + 1).trim();
      const subKeyLower = subKey.toLowerCase();

      let propClass = 'prop-default';
      if (subKeyLower.includes('мов')) {
        propClass = 'prop-lang';
      } else if (subKeyLower.includes('переклад') || subKeyLower.includes('озвучення')) {
        propClass = 'prop-trans';
      } else if (subKeyLower.includes('кодек')) {
        propClass = 'prop-codec';
      } else if (subKeyLower.includes('біт')) {
        propClass = 'prop-bitrate';
      } else if (subKeyLower.includes('тип')) {
        propClass = 'prop-type';
      } else if (subKeyLower.includes('формат')) {
        propClass = 'prop-format';
      } else if (subKeyLower.includes('кадр') || subKeyLower.includes('розмір')) {
        propClass = 'prop-frame';
      }

      const isNumeric = /\d/.test(subVal) && (propClass === 'prop-bitrate' || propClass === 'prop-codec' || propClass === 'prop-frame');
      const cleanVal = subVal.replace(/,\s*$/, '');

      return `
        <div class="track-prop-row">
          <span class="track-prop-label ${propClass}">${escapeHtml(subKey)}:</span>
          <span class="track-prop-value${isNumeric ? ' numeric' : ''}">${escapeHtml(cleanVal)}</span>
        </div>
      `;
    }
    return `<div class="track-prop-note">${escapeHtml(line)}</div>`;
  }).join('') + `</div>`;
}

function getTrackKindIcon(key) {
  const kl = (key || '').toLowerCase();
  if (kl.startsWith('відео')) {
    return `<svg class="track-kind-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7"></polygon>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
    </svg>`;
  }
  if (kl.startsWith('аудіо')) {
    return `<svg class="track-kind-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>`;
  }
  if (kl.startsWith('субтитри')) {
    return `<svg class="track-kind-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
      <path d="M7 15h4M15 15h2M7 11h2M13 11h4"></path>
    </svg>`;
  }
  return '';
}

function splitTrackHeading(key) {
  if (!key) return { main: '', sub: '' };
  const m = key.match(/^([^(]+?)\s*(\([^)]{15,}\))$/);
  if (m) {
    return { main: m[1].trim(), sub: m[2].trim() };
  }
  return { main: key.trim(), sub: '' };
}

function extractTrackBadges(val, key) {
  if (typeof val !== 'string') return [];
  const badges = [];
  const lines = val.split('\n').map(l => l.trim()).filter(Boolean);

  let lang = '';
  let codec = '';
  let trans = '';
  let subType = '';
  let resBadge = '';

  const keyLow = (key || '').toLowerCase();
  const isSubs = keyLow.includes('субтитри');
  const isVideo = keyLow.includes('відео');
  const fullText = `${key || ''} ${val || ''}`.toLowerCase();

  for (const line of lines) {
    const lLower = line.toLowerCase();
    if (lLower.startsWith('мова:')) {
      const v = line.slice(5).trim();
      const vLow = v.toLowerCase();
      if (vLow.includes('укр')) lang = 'UKR';
      else if (vLow.includes('япон')) lang = 'JAP';
      else if (vLow.includes('англ')) lang = 'ENG';
      else if (vLow.includes('рос')) lang = 'RUS';
      else {
        const first = v.split(/[\s,(|]/)[0];
        if (first && first.length <= 6) lang = first.toUpperCase();
      }
      if (vLow.includes('написи') && !subType) subType = 'Написи';
      else if (vLow.includes('повні') && !subType) subType = 'Повні';
    } else if (lLower.startsWith('кодек:') || lLower.startsWith('формат:')) {
      const v = line.split(':')[1]?.trim() || '';
      codec = v.replace(/\*\./g, '').replace(/,\s*$/g, '').replace(/,\s*/g, '/').toUpperCase();
    } else if (lLower.startsWith('переклад:') || lLower.startsWith('озвучення:')) {
      const v = (line.split(':')[1] || '').trim().toLowerCase();
      if (v.includes('дубл')) trans = 'Дубляж';
      else if (v.includes('багатоголос')) trans = 'Багатоголосий';
      else if (v.includes('двоголос')) trans = 'Двоголосий';
      else if (v.includes('одноголос')) trans = 'Одноголосий';
      else if (v.includes('оригінал')) trans = 'Оригінал';
      else if (v.includes('авторськ')) trans = 'Авторський';
      else if (v.includes('commentary') || v.includes('коментар')) trans = 'Коментарі';
    } else if (lLower.startsWith('тип:')) {
      const v = line.slice(4).trim().toLowerCase();
      if (!subType) {
        if (v.includes('м\'як') || v.includes('програмн')) subType = 'М\'які';
        else if (v.includes('жорстк') || v.includes('вбудован')) subType = 'Хардсаб';
      }
    } else if (isVideo && (lLower.startsWith('розмір кадру:') || lLower.startsWith('роздільність:'))) {
      const v = line.split(':')[1]?.trim() || '';
      const m = v.match(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/i);
      if (m) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        if (w >= 3800 || h >= 2100) resBadge = '2160p (4K)';
        else if (w >= 1900 || h >= 1040) resBadge = '1080p';
        else if (w >= 1260 || h >= 700) resBadge = '720p';
        else if (h >= 560) resBadge = '576p';
        else if (h >= 460) resBadge = '480p';
        else if (h > 0) resBadge = `${h}p`;
      }
    }
  }

  // Fallback codec detection for video if not in 'кодек:' line
  if (isVideo && !codec) {
    if (fullText.includes('h.265') || fullText.includes('hevc') || fullText.includes('x265')) codec = 'H.265';
    else if (fullText.includes('h.264') || fullText.includes('avc') || fullText.includes('x264') || fullText.includes('x.264')) codec = 'H.264';
    else if (fullText.includes('xvid')) codec = 'XVID';
    else if (fullText.includes('divx')) codec = 'DIVX';
    else if (fullText.includes('wmv')) codec = 'WMV';
    else if (fullText.includes('av1')) codec = 'AV1';
  }

  // Fallback resolution detection for video
  if (isVideo && !resBadge) {
    if (fullText.includes('2160p') || fullText.includes('4k')) resBadge = '2160p (4K)';
    else if (fullText.includes('1080p')) resBadge = '1080p';
    else if (fullText.includes('720p')) resBadge = '720p';
    else if (fullText.includes('576p')) resBadge = '576p';
    else if (fullText.includes('480p')) resBadge = '480p';
    else {
      const m = fullText.match(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/i);
      if (m) {
        const w = parseInt(m[1], 10);
        const h = parseInt(m[2], 10);
        if (w >= 3800 || h >= 2100) resBadge = '2160p (4K)';
        else if (w >= 1900 || h >= 1040) resBadge = '1080p';
        else if (w >= 1260 || h >= 700) resBadge = '720p';
        else if (h >= 560) resBadge = '576p';
        else if (h >= 460) resBadge = '480p';
      }
    }
  }

  if (lang) badges.push({ text: lang, type: 'lang' });
  if (codec) badges.push({ text: codec, type: 'codec' });
  if (resBadge) badges.push({ text: resBadge, type: 'res' });
  if (trans) badges.push({ text: trans, type: 'trans' });

  if (isVideo) {
    if (fullText.includes('10-bit') || fullText.includes('10 біт') || fullText.includes('10bit') || fullText.includes('hi10p')) {
      badges.push({ text: '10-bit', type: 'depth' });
    }
    if (fullText.includes('hdr10+')) {
      badges.push({ text: 'HDR10+', type: 'hdr' });
    } else if (fullText.includes('hdr') || fullText.includes('hdr10')) {
      badges.push({ text: 'HDR', type: 'hdr' });
    }
    if (fullText.includes('dolby vision') || /\bdv\b/.test(fullText)) {
      badges.push({ text: 'DV', type: 'hdr' });
    }
  }

  if (isSubs) {
    if (fullText.includes('forced') || fullText.includes('форсован')) {
      badges.push({ text: 'Forced', type: 'forced' });
    }
    if (fullText.includes('full') || fullText.includes('повні')) {
      badges.push({ text: 'Full', type: 'full' });
    }
    if (fullText.includes('sdh')) {
      badges.push({ text: 'SDH', type: 'sdh' });
    }
    if (subType && !['Forced', 'Full', 'Написи', 'Повної', 'Повні'].includes(subType)) {
      badges.push({ text: subType, type: 'type' });
    }
  } else if (subType) {
    badges.push({ text: subType, type: 'type' });
  }

  return badges;
}

function formatPersonOrPills(roleName, val) {
  if (typeof val !== 'string') return `<span>${escapeHtml(JSON.stringify(val))}</span>`;
  const isRoleList = /ролі|дублюв|озвуч|читали|актор/i.test(roleName);
  if (isRoleList && val.includes(',')) {
    const names = val.split(',').map(n => n.trim()).filter(Boolean);
    if (names.length > 1) {
      return `<div class="actor-pills-wrap">${names.map(n => `<span class="actor-pill">${escapeHtml(n)}</span>`).join('')}</div>`;
    }
  }
  return `<span>${escapeHtml(val)}</span>`;
}

function formatSingleSourceValue(trimmed) {
  if (/^https?:\/\/[^\s]+$/.test(trimmed)) {
    return `
      <a href="${escapeHtml(trimmed)}" target="_blank" rel="noopener noreferrer" class="source-url-link" title="Відкрити джерело">
        <span>${escapeHtml(trimmed)}</span>
        <svg class="source-link-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </a>
    `;
  }
  const isReleaseTag = /\.(?:remux|bluray|bdrip|web-dl|webrip|dvdrip|hevc|x264|x265|aac|dts)\b/i.test(trimmed);
  return `<span class="source-value-text${isReleaseTag ? ' numeric' : ''}">${escapeHtml(trimmed)}</span>`;
}

function formatSourceValue(val) {
  if (typeof val !== 'string') return `<span>${escapeHtml(JSON.stringify(val))}</span>`;
  const lines = val.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return `<div class="source-multiline-wrap">${lines.map(line => formatSingleSourceValue(line)).join('')}</div>`;
  }
  return formatSingleSourceValue(val.trim());
}

function renderAdaptationContent(adapt = {}, teamsList = []) {
  const adaptKeys = Object.keys(adapt).filter(k => k !== 'Озвучення VOC' && !k.endsWith(' - переклад') && !k.endsWith(' - команда') && adapt[k]);
  const trackKeys = adaptKeys.filter(k => /^(?:аудіо|субтитри|відео)/i.test(k));
  const sourceKeys = adaptKeys.filter(k => /^джерел/i.test(k));
  const creditKeys = adaptKeys.filter(k => !/^(?:аудіо|субтитри|відео)/i.test(k) && !/^джерел/i.test(k));

  trackKeys.sort((a, b) => {
    const getRank = (k) => {
      const kl = k.toLowerCase();
      if (kl.startsWith('відео')) return 1;
      if (kl.startsWith('аудіо')) return 2;
      if (kl.startsWith('субтитри')) return 3;
      return 4;
    };
    const rA = getRank(a);
    const rB = getRank(b);
    if (rA !== rB) return rA - rB;
    return a.localeCompare(b, 'uk', { numeric: true, sensitivity: 'base' });
  });

  sourceKeys.sort((a, b) => a.localeCompare(b, 'uk', { sensitivity: 'base' }));

  let tracksHtml = '';
  if (trackKeys.length > 0) {
    tracksHtml = `
      <div class="adaptation-tracks-block">
        <div class="tracks-header-row">
          <span class="tracks-subtitle">Медіадоріжки (${trackKeys.length})</span>
          ${trackKeys.length > 1 ? `
            <button type="button" class="btn-toggle-all-tracks" aria-label="Розгорнути або згорнути всі доріжки">
              <svg class="toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"></polyline>
                <polyline points="7 6 12 11 17 6"></polyline>
              </svg>
              <span class="btn-toggle-text">Розгорнути всі</span>
            </button>
          ` : ''}
        </div>
        <div class="tracks-accordion-list">
          ${trackKeys.map(key => {
            const val = adapt[key];
            if (!val) return '';

            const crew = adapt[`${key} - команда`] || (key.startsWith('Аудіо') ? adapt['Над озвученням працювали'] : null);
            let crewHtml = '';
            if (crew && typeof crew === 'object' && Object.keys(crew).length > 0) {
              crewHtml = `
                <div class="audio-crew-plate">
                  <div class="audio-crew-header">
                    <svg class="audio-crew-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>Над озвученням працювали</span>
                  </div>
                  <div class="audio-crew-list">
                    ${Object.entries(crew).map(([role, person]) => `
                      <div class="audio-crew-row">
                        <span class="audio-crew-role">${escapeHtml(role)}:</span>
                        <div class="audio-crew-names">${formatPersonOrPills(role, person)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            }

            const { main: trackMainTitle, sub: trackSubTitle } = splitTrackHeading(key);
            const badges = extractTrackBadges(val, key);
            const personContentHtml = formatTrackProperties(val);
            const badgesHtml = badges.map(b => `<span class="track-badge badge-${b.type}">${escapeHtml(b.text)}</span>`).join('');

            return `
              <details class="track-accordion">
                <summary class="track-summary">
                  <span class="track-summary-icon">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </span>
                  <span class="track-kind-badge" title="${escapeHtml(trackMainTitle)}">
                    ${getTrackKindIcon(key)}
                  </span>
                  <div class="track-summary-title">
                    <span class="track-title-main">${escapeHtml(trackMainTitle)}</span>
                    ${trackSubTitle ? `<span class="track-title-sub" title="${escapeHtml(trackSubTitle)}">${escapeHtml(trackSubTitle)}</span>` : ''}
                  </div>
                  <div class="track-summary-badges">
                    ${badgesHtml}
                  </div>
                </summary>
                <div class="track-content-body">
                  ${personContentHtml}
                  ${crewHtml}
                </div>
              </details>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let creditsHtml = '';
  if (creditKeys.length > 0) {
    creditsHtml = `
      <div class="adaptation-credits-card">
        <div class="credits-card-header">
          <svg class="credits-header-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Команда релізу та адаптації</span>
        </div>
        <div class="credits-card-body">
          ${creditKeys.map(key => {
            const val = adapt[key];
            if (!val) return '';
            return `
              <div class="credit-row-item">
                <span class="credit-role-label">${escapeHtml(key)}:</span>
                <div class="credit-role-value">${formatPersonOrPills(key, val)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let sourcesHtml = '';
  if (sourceKeys.length > 0) {
    sourcesHtml = `
      <div class="adaptation-sources-card">
        <div class="sources-card-header">
          <svg class="sources-header-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span>${sourceKeys.length === 1 ? 'Джерело' : 'Джерела'}</span>
        </div>
        <div class="sources-card-body">
          ${sourceKeys.map(key => {
            const val = adapt[key];
            if (!val) return '';
            return `
              <div class="source-row-item">
                <span class="source-role-label">${escapeHtml(key)}:</span>
                <div class="source-role-value">${formatSourceValue(val)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return {
    tracksHtml,
    creditsHtml,
    sourcesHtml,
    trackCount: trackKeys.length,
    hasContent: (trackKeys.length > 0 || creditKeys.length > 0 || sourceKeys.length > 0)
  };
}

export function openTitleModalById(id) {
  if (!id) return;
  const numId = Number(id);
  const catalog = window.TOLOKA_CATALOG?.titles || [];
  const found = catalog.find(t => t.id === numId || String(t.id) === String(id));
  if (found) {
    openTitleModal(found);
  } else {
    fetch(`/api/titles/${id}`)
      .then(res => res.json())
      .then(item => {
        if (item && item.id) {
          openTitleModal(item);
        }
      })
      .catch(err => console.warn('Could not load title by id:', err));
  }
}

export function openTitleModal(titleItem, updateHistory = true) {
  if (!modalElement || !titleItem) return;
  currentModalItem = titleItem;

  const primaryPoster = titleItem.local_poster || titleItem.poster || getSvgPlaceholder(titleItem.title_ua);
  const svgPlaceholder = getSvgPlaceholder(titleItem.title_ua);

  // External DB badges
  const extIds = titleItem.external_ids || {};
  let extLinksHtml = '';
  if (extIds.imdb) {
    extLinksHtml += `<a href="${escapeHtml(extIds.imdb)}" target="_blank" rel="noopener noreferrer" class="external-link-btn imdb" title="Відкрити на IMDb">
      <img src="img/icons/imdb.ico" class="ext-btn-icon" alt="IMDb">
      <span>IMDb</span>
    </a>`;
  }
  if (extIds.myanimelist) {
    extLinksHtml += `<a href="${escapeHtml(extIds.myanimelist)}" target="_blank" rel="noopener noreferrer" class="external-link-btn mal" title="Відкрити на MyAnimeList">
      <img src="img/icons/myanimelist.ico" class="ext-btn-icon" alt="MyAnimeList">
      <span>MyAnimeList</span>
    </a>`;
  }
  if (extIds.anilist) {
    extLinksHtml += `<a href="${escapeHtml(extIds.anilist)}" target="_blank" rel="noopener noreferrer" class="external-link-btn anilist" title="Відкрити на AniList">
      <img src="img/icons/anilist.ico" class="ext-btn-icon" alt="AniList">
      <span>AniList</span>
    </a>`;
  }
  if (extIds.anidb) {
    extLinksHtml += `<a href="${escapeHtml(extIds.anidb)}" target="_blank" rel="noopener noreferrer" class="external-link-btn anidb" title="Відкрити на AniDB">
      <img src="img/icons/anidb.ico" class="ext-btn-icon" alt="AniDB">
      <span>AniDB</span>
    </a>`;
  }
  const hikkaUrl = titleItem.hikka_url || extIds.hikka;
  if (hikkaUrl) {
    extLinksHtml += `<a href="${escapeHtml(hikkaUrl)}" target="_blank" rel="noopener noreferrer" class="external-link-btn hikka" title="Відкрити на Hikka">
      <img src="img/icons/hikka.ico" class="ext-btn-icon" alt="Hikka">
      <span>Hikka</span>
    </a>`;
  }

  // Where to watch online section (strictly Anitube and Mikai only)
  const watchList = (titleItem.where_to_watch || []).filter(item => 
    item && item.url && (item.id === 'anitube' || item.id === 'mikai')
  );
  let watchHtml = '';
  if (watchList.length > 0) {
    watchHtml = `
      <div class="modal-watch-section">
        <h4 class="modal-section-title">Де дивитись онлайн</h4>
        <div class="watch-links-group">
          ${watchList.map(item => `
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="watch-platform-btn" title="Дивитися на ${escapeHtml(item.name)}">
              <img src="${escapeHtml(item.icon || 'img/icons/' + item.id + '.ico')}" class="watch-platform-icon" alt="${escapeHtml(item.name)}">
              <span>${escapeHtml(item.name)}</span>
              <svg class="watch-external-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Genres
  const genresHtml = (titleItem.genres || [])
    .map(g => `<span class="tag-badge">${escapeHtml(g)}</span>`)
    .join('');

  // Adaptation and Dubbing team list
  const teamsList = Array.isArray(titleItem.teams) ? titleItem.teams : [];
  const adapt = titleItem.adaptation_team || {};

  let adaptHtml = '';
  if (titleItem.is_compilation && Array.isArray(titleItem.parts) && titleItem.parts.length > 0) {
    const partsList = titleItem.parts;
    adaptHtml = `
      <div class="modal-adaptation-section compilation-mode">
        <div class="compilation-section-header">
          <div class="compilation-header-title-wrap">
            <svg class="compilation-header-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            <h4 class="modal-section-title">Озвучення та переклад за тайтлами (${partsList.length})</h4>
          </div>
          <button type="button" class="btn-toggle-all-parts" aria-label="Розгорнути або згорнути всі частини">
            <svg class="toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
            <span class="btn-toggle-text">Розгорнути всі</span>
          </button>
        </div>
        <div class="compilation-parts-accordion-list">
          ${partsList.map(part => {
            const partAdapt = part.adaptation_team || {};
            const partTeams = Array.isArray(part.voc_teams) ? part.voc_teams : [];
            const { tracksHtml: partTracks, creditsHtml: partCredits, sourcesHtml: partSources, trackCount } = renderAdaptationContent(partAdapt, partTeams);
            const partTitle = part.title_ua || part.title;
            const partYear = part.year ? ` (${part.year})` : '';

            return `
              <details class="compilation-part-accordion" data-part-id="${part.id}">
                <summary class="compilation-part-summary">
                  <span class="part-accordion-icon">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </span>
                  <span class="part-index-badge numeric">${part.index}</span>
                  <div class="part-summary-title">
                    <span class="part-title-text" title="${escapeHtml(partTitle)}">${escapeHtml(partTitle)}</span>
                    ${partYear ? `<span class="part-year-badge numeric">${escapeHtml(partYear)}</span>` : ''}
                  </div>
                  <div class="part-meta-badges">
                    ${trackCount > 0 ? `<span class="part-tracks-badge numeric">${trackCount} дор.</span>` : ''}
                    ${partTeams.map(t => `<span class="team-badge-pill">${escapeHtml(t)}</span>`).join('')}
                  </div>
                  <button type="button" class="btn-open-part-modal" data-id="${part.id}" title="Відкрити окрему картку тайтла" aria-label="Відкрити окрему картку тайтла">
                    <span>Картка</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </button>
                </summary>
                <div class="compilation-part-content">
                  ${partTracks}
                  ${partCredits}
                  ${partSources}
                </div>
              </details>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    const { tracksHtml, creditsHtml, sourcesHtml, hasContent } = renderAdaptationContent(adapt, teamsList);
    if (teamsList.length > 0 || hasContent) {
      adaptHtml = `
        <div class="modal-adaptation-section">
          <h4 class="modal-section-title">Озвучення та переклад</h4>
          ${teamsList.length > 0 ? `
            <div class="modal-teams-badges">
              ${teamsList.map(t => `<span class="team-badge-pill">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
          ${tracksHtml}
          ${creditsHtml}
          ${sourcesHtml}
        </div>
      `;
    }
  }

  // Collapsible episode list
  let episodesHtml = '';
  if (titleItem.episode_list && titleItem.episode_list.trim()) {
    const rawLines = titleItem.episode_list.split('\n').map(l => l.trim()).filter(Boolean);
    if (rawLines.length > 0) {
      episodesHtml = `
        <div class="modal-episodes-section">
          <details class="modal-episodes-accordion">
            <summary class="episodes-summary">
              <span class="episodes-summary-icon">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </span>
              <span class="episodes-summary-title">Перелік серій</span>
              <span class="episodes-badge">${rawLines.length} серій</span>
            </summary>
            <div class="episodes-content-scroll">
              <ol class="episodes-list">
                ${rawLines.map(line => `<li><span class="episode-line-text">${escapeHtml(line)}</span></li>`).join('')}
              </ol>
            </div>
          </details>
        </div>
      `;
    }
  }

  // Collapsible files list
  let filesHtml = '';
  const filesData = Array.isArray(titleItem.files) ? titleItem.files : [];
  const totalFilesCount = filesData.reduce((acc, f) => acc + (f.items?.length || 0), 0);
  if (totalFilesCount > 0) {
    const fileWord = totalFilesCount === 1 ? 'файл' : (totalFilesCount < 5 ? 'файли' : 'файлів');
    filesHtml = `
      <div class="modal-files-section">
        <details class="modal-files-accordion">
          <summary class="files-summary">
            <span class="files-summary-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <span class="files-summary-title">Файли роздачі</span>
            <span class="files-badge">${totalFilesCount} ${fileWord}</span>
            ${titleItem.torrent_size ? `<span class="files-size-badge numeric">${escapeHtml(titleItem.torrent_size)}</span>` : ''}
          </summary>
          <div class="files-content-scroll">
            ${filesData.map(folder => `
              <div class="files-folder-group">
                ${folder.folder ? `
                  <div class="files-folder-name">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${escapeHtml(folder.folder)}</span>
                  </div>
                ` : ''}
                <ul class="files-list">
                  ${(folder.items || []).map(file => `
                    <li class="file-item-row">
                      <svg class="file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                      </svg>
                      <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                      <span class="file-size numeric">${escapeHtml(file.size)}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    `;
  }

  const modalContent = modalElement.querySelector('.modal-inner');
  if (modalContent) {
    modalContent.innerHTML = `
      <div class="modal-top-actions">
        <button type="button" class="modal-action-btn modal-enrich-hikka-btn" title="Оновити дані через Hikka API" aria-label="Оновити дані через Hikka API">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </button>
        <button type="button" class="modal-action-btn modal-edit-btn" title="Редагувати тайтл" aria-label="Редагувати тайтл">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="modal-action-btn modal-close-btn" title="Закрити вікно" aria-label="Закрити вікно">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-sidebar">
        <div class="modal-poster-wrap">
          <img 
            class="modal-poster-img" 
            src="${escapeHtml(primaryPoster)}" 
            alt="${escapeHtml(titleItem.title_ua)}"
            referrerpolicy="no-referrer"
            onerror="if(this.dataset.triedFallback !== '1' && '${escapeHtml(titleItem.local_poster || '')}' && '${escapeHtml(titleItem.poster || '')}') { this.dataset.triedFallback = '1'; this.src = '${escapeHtml(titleItem.poster)}'; } else { this.src = '${svgPlaceholder}'; }"
          />
        </div>

        <div class="modal-actions">
          ${titleItem.download_url ? `
            <a href="${escapeHtml(titleItem.download_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-download-torrent" title="Завантажити .torrent" aria-label="Завантажити .torrent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span class="btn-text">Торрент</span>
            </a>
          ` : ''}

          ${titleItem.url ? `
            <a href="${escapeHtml(titleItem.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-subtle btn-open-toloka" title="Відкрити тему на Толоці" aria-label="Відкрити тему на Толоці">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span class="btn-text">Толока</span>
            </a>
          ` : ''}

          <button type="button" class="btn btn-subtle btn-copy-link-modal" title="Копіювати посилання на роздачу" aria-label="Копіювати посилання на роздачу">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="btn-text">Копіювати</span>
          </button>

          <button type="button" class="btn btn-subtle btn-enrich-modal" data-id="${titleItem.id}" title="Збагатити через парсер Toloka" aria-label="Збагатити через парсер Toloka">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            <span class="btn-text">Збагатити</span>
          </button>
        </div>

        ${(titleItem.studio || titleItem.director || titleItem.country) ? `
          <div class="modal-title-info-card">
            <div class="title-info-card-header">
              <span>Виробництво:</span>
            </div>
            <div class="title-info-card-body">
              ${titleItem.country ? `
                <div class="title-info-row">
                  <span class="title-info-label">Країна</span>
                  <span class="title-info-value">${escapeHtml(titleItem.country)}</span>
                </div>
              ` : ''}
              ${titleItem.studio ? `
                <div class="title-info-row">
                  <span class="title-info-label">Студія</span>
                  <span class="title-info-value">${escapeHtml(titleItem.studio)}</span>
                </div>
              ` : ''}
              ${titleItem.director ? `
                <div class="title-info-row">
                  <span class="title-info-label">Режисер</span>
                  <span class="title-info-value">${escapeHtml(titleItem.director)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${extLinksHtml ? `
          <div class="modal-external-links">
            <span class="modal-section-title">Бази даних</span>
            <div class="external-links-group">
              ${extLinksHtml}
            </div>
          </div>
        ` : ''}

        ${titleItem.registered_at ? `
          <div class="modal-sidebar-registered">
            <span class="sidebar-registered-label">Зареєстровано:</span>
            <span class="sidebar-registered-value numeric">${escapeHtml(titleItem.registered_at.split(' ')[0])}</span>
          </div>
        ` : ''}
      </div>

      <div class="modal-main">
        ${titleItem.is_compilation_item && titleItem.parent_id ? `
          <div class="modal-compilation-parent-banner">
            <button type="button" class="btn-back-to-parent" data-parent-id="${titleItem.parent_id}" title="Перейти до повної збірки">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Зі збірки: <strong>${escapeHtml(titleItem.parent_title || '#' + titleItem.parent_id)}</strong></span>
            </button>
          </div>
        ` : ''}

        <div class="modal-header-info">
          <div class="modal-title-meta-line">
            <span class="modal-meta-pill pill-type${titleItem.type === 'movie?' ? ' type-guess' : ''}">${titleItem.type === 'movie?' ? 'Фільм? (можливо)' : (titleItem.type === 'movie' ? 'Фільм' : titleItem.type === 'ova' ? 'OVA' : titleItem.type === 'ona' ? 'ONA' : titleItem.type === 'special' ? 'Спешл' : 'Серіал')}</span>
            ${titleItem.is_compilation ? `<span class="modal-meta-pill pill-compilation">Збірник ${titleItem.parts ? `(${titleItem.parts.length})` : ''}</span>` : ''}
            ${titleItem.part ? `<span class="modal-part-prefix" title="Частина / Сезон">${escapeHtml(titleItem.part)}</span>` : ''}
            ${titleItem.year ? `<span class="modal-meta-pill pill-year numeric">${titleItem.year}</span>` : ''}
          </div>
          <div class="modal-header-top-row">
            <h2 class="modal-title-ua" title="${escapeHtml(titleItem.title_ua)}"><span>${escapeHtml(titleItem.title_ua)}</span></h2>
            <span class="modal-topic-id card-topic-id" title="Клікніть, щоб скопіювати ID">#${titleItem.id}</span>
          </div>
          ${titleItem.title_orig ? `<div class="modal-title-orig">${escapeHtml(titleItem.title_orig)}</div>` : ''}
          <div class="modal-raw-title" title="Оригінальна назва теми на Toloka">${escapeHtml(titleItem.raw_title)}</div>
        </div>

        <div class="modal-meta-grid">
          ${titleItem.quality ? `
            <div class="meta-field">
              <span class="meta-field-label">Якість</span>
              <span class="meta-field-value numeric">${escapeHtml(titleItem.quality)}</span>
            </div>
          ` : ''}

          <div class="meta-field">
            <span class="meta-field-label">Серії</span>
            <span class="meta-field-value numeric">${
              titleItem.total_episodes && titleItem.total_episodes != titleItem.episodes
                ? `${titleItem.episodes || 1} з ${titleItem.total_episodes}`
                : `${titleItem.episodes || 1}`
            }</span>
          </div>

          <div class="meta-field">
            <span class="meta-field-label">Субтитри</span>
            <span class="meta-field-value ${titleItem.has_sub ? 'sub-badge-text' : ''}">${titleItem.has_sub ? 'Наявні (SUB)' : 'Лише озвучення'}</span>
          </div>

          ${titleItem.duration ? `
            <div class="meta-field">
              <span class="meta-field-label">Тривалість</span>
              <span class="meta-field-value numeric">${escapeHtml(titleItem.duration)}</span>
            </div>
          ` : ''}

          ${titleItem.seeders !== undefined && titleItem.seeders !== null && titleItem.seeders > 0 ? `
            <div class="meta-field">
              <span class="meta-field-label">Роздають</span>
              <span class="meta-field-value numeric seed-badge-text">▲ ${titleItem.seeders}</span>
            </div>
          ` : ''}

          ${titleItem.torrent_size ? `
            <div class="meta-field">
              <span class="meta-field-label">Розмір</span>
              <span class="meta-field-value numeric">${escapeHtml(titleItem.torrent_size)}</span>
            </div>
          ` : ''}
        </div>

        ${genresHtml ? `
          <div class="card-genres">
            ${genresHtml}
          </div>
        ` : ''}

        ${titleItem.synopsis ? `
          <div class="modal-synopsis-section">
            <h4 class="modal-section-title">Опис / Синопсис</h4>
            <div class="modal-synopsis-text">${escapeHtml(titleItem.synopsis)}</div>
          </div>
        ` : ''}

        ${watchHtml}

        ${adaptHtml}

        ${episodesHtml}

        ${filesHtml}
      </div>
    `;

    // Attach Toggle All Tracks Handler
    const toggleTracksBtn = modalContent.querySelector('.btn-toggle-all-tracks');
    if (toggleTracksBtn) {
      const accordions = modalContent.querySelectorAll('.track-accordion');
      const toggleText = toggleTracksBtn.querySelector('.btn-toggle-text');
      const toggleIcon = toggleTracksBtn.querySelector('.toggle-icon');

      const updateBtnState = () => {
        const allOpen = accordions.length > 0 && Array.from(accordions).every(a => a.open);
        if (toggleText) toggleText.textContent = allOpen ? 'Згорнути всі' : 'Розгорнути всі';
        if (toggleIcon) toggleIcon.style.transform = allOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      };

      toggleTracksBtn.addEventListener('click', () => {
        const hasClosed = Array.from(accordions).some(a => !a.open);
        accordions.forEach(a => { a.open = hasClosed; });
        updateBtnState();
      });


      accordions.forEach(a => {
        a.addEventListener('toggle', updateBtnState);
      });
    }

    // Attach Enrich Button Handler
    const enrichBtn = modalContent.querySelector('.btn-enrich-modal');
    if (enrichBtn) {
      enrichBtn.addEventListener('click', async () => {
        enrichBtn.disabled = true;
        const origContent = enrichBtn.innerHTML;
        enrichBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
        `;
        try {
          const res = await fetch('/api/parser/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: titleItem.id, single_id: titleItem.id, count: 1 })
          });
          const resData = await res.json().catch(() => ({}));
          if (res.ok && resData.success) {
            let updatedItem = resData.title;
            if (!updatedItem) {
              const tRes = await fetch(`/api/titles/${titleItem.id}`);
              if (tRes.ok) {
                updatedItem = await tRes.json();
              }
            }
            if (updatedItem) {
              Object.assign(titleItem, updatedItem);
              if (window.TOLOKA_CATALOG && Array.isArray(window.TOLOKA_CATALOG.titles)) {
                const catalogIdx = window.TOLOKA_CATALOG.titles.findIndex(t => (t.id === titleItem.id || t.topic_id === titleItem.id));
                if (catalogIdx !== -1) {
                  window.TOLOKA_CATALOG.titles[catalogIdx] = { ...window.TOLOKA_CATALOG.titles[catalogIdx], ...updatedItem };
                }
              }
              // Immediately re-render modal with refreshed data
              openTitleModal(titleItem);
              return;
            }
            enrichBtn.innerHTML = `<span>✓</span>`;
            setTimeout(() => {
              enrichBtn.innerHTML = origContent;
              enrichBtn.disabled = false;
            }, 2000);
          } else {
            enrichBtn.innerHTML = `<span>✗</span>`;
            setTimeout(() => {
              enrichBtn.innerHTML = origContent;
              enrichBtn.disabled = false;
            }, 2000);
          }
        } catch (err) {
          enrichBtn.innerHTML = origContent;
          enrichBtn.disabled = false;
        }
      });
    }

    // Attach Copy Link Button Handler
    const copyLinkBtn = modalContent.querySelector('.btn-copy-link-modal');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const urlToCopy = titleItem.url || (titleItem.id ? `https://toloka.to/t${titleItem.id}` : window.location.href);
        navigator.clipboard.writeText(urlToCopy).then(() => {
          copyLinkBtn.classList.add('copied');
          setTimeout(() => copyLinkBtn.classList.remove('copied'), 1500);
        }).catch(() => {
          copyLinkBtn.classList.add('copied');
          setTimeout(() => copyLinkBtn.classList.remove('copied'), 1500);
        });
      });
    }

    // Attach Copy Topic ID Handler in modal header
    const modalIdEl = modalContent.querySelector('.modal-topic-id');
    if (modalIdEl) {
      modalIdEl.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(String(titleItem.id)).then(() => {
          modalIdEl.classList.add('copied');
          setTimeout(() => modalIdEl.classList.remove('copied'), 1400);
        }).catch(() => {
          modalIdEl.classList.add('copied');
          setTimeout(() => modalIdEl.classList.remove('copied'), 1400);
        });
      });
    }

    // Compilation parts: toggle all accordions
    const togglePartsBtn = modalContent.querySelector('.btn-toggle-all-parts');
    if (togglePartsBtn) {
      togglePartsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const accordions = Array.from(modalContent.querySelectorAll('.compilation-part-accordion'));
        if (accordions.length === 0) return;
        const allOpen = accordions.every(acc => acc.open);
        const shouldOpen = !allOpen;
        accordions.forEach(acc => { acc.open = shouldOpen; });
        
        const textSpan = togglePartsBtn.querySelector('.btn-toggle-text');
        if (textSpan) {
          textSpan.textContent = shouldOpen ? 'Згорнути всі' : 'Розгорнути всі';
        }
        togglePartsBtn.classList.toggle('all-expanded', shouldOpen);
      });
    }


    // Compilation parts: open separate title modal
    const partModalBtns = modalContent.querySelectorAll('.btn-open-part-modal');
    partModalBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const partId = btn.dataset.id;
        if (partId) {
          openTitleModalById(partId);
        }
      });
    });

    // Compilation item: back to parent collection modal
    const backToParentBtn = modalContent.querySelector('.btn-back-to-parent');
    if (backToParentBtn) {
      backToParentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const parentId = backToParentBtn.dataset.parentId;
        if (parentId) {
          openTitleModalById(parentId);
        }
      });
    }
  }

  if (!modalElement.open) {
    modalElement.showModal();
  }

  if (updateHistory && titleItem.id) {
    const url = new URL(window.location.href);
    const curId = url.searchParams.get('id');
    if (curId !== String(titleItem.id)) {
      url.searchParams.set('id', String(titleItem.id));
      const targetUrl = url.pathname + url.search + url.hash;
      history.pushState({ modalTitleId: titleItem.id }, '', targetUrl);
    }
  }
}

async function enrichCurrentModalItem(item, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

  try {
    const res = await fetch('/api/hikka/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id })
    });
    const data = await res.json();

    if (data.success && data.updated) {
      const enriched = data.data || {};
      if (enriched.director) item.director = enriched.director;
      if (enriched.studio) item.studio = enriched.studio;
      if (enriched.country) item.country = enriched.country;
      if (enriched.synopsis) item.synopsis = enriched.synopsis;
      if (enriched.genres && enriched.genres.length > 0) item.genres = enriched.genres;

      // Sync with global catalog in-memory object
      const catTitles = window.TOLOKA_CATALOG?.titles || [];
      const catItem = catTitles.find(t => t.id === item.id);
      if (catItem && catItem !== item) {
        Object.assign(catItem, item);
      }

      const fieldsMsg = data.fields_enriched ? data.fields_enriched.join(', ') : 'дані';
      showToast(`Оновлено через Hikka: ${fieldsMsg}`);

      // Re-render modal in place without altering URL history
      openTitleModal(item, false);
    } else {
      showToast(data.message || 'Нових даних на Hikka не знайдено');
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  } catch (err) {
    console.error('Помилка збагачення з Hikka:', err);
    showToast('Помилка запиту до сервера');
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}
