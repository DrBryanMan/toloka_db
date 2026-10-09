/**
 * Incomplete Data Management Component
 * Displays titles with missing fields, allows quick inline editing and title modal editing.
 */
import { navigateTo, onRouteChanged, VIEWS } from '../router.js';
import { openEditModal } from './editModal.js';
import { openTitleModal } from './modal.js';
import { escapeHtml, getSvgPlaceholder } from '../utils.js';

let currentFilter = 'all';
let searchQuery = '';
let activeIncompleteTab = 'meta';
let currentTrackFilter = 'all';
let trackSearchQuery = '';
const dirtyRows = new Map();
let lastLogId = 0;
let pollTimer = null;

function appendHikkaLog(text, type = 'info', timeStr = '') {
  const consoleLogs = document.getElementById('incomplete-console-logs');
  if (!consoleLogs) return;
  const time = timeStr || new Date().toLocaleTimeString('uk-UA', { hour12: false });
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${escapeHtml(text)}</span>`;
  consoleLogs.appendChild(line);

  // FIFO limit: keep last 150 lines to keep DOM lightweight
  while (consoleLogs.children.length > 150) {
    consoleLogs.removeChild(consoleLogs.firstElementChild);
  }

  consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

export function initIncompleteView() {
  const btnMenuIncomplete = document.getElementById('btn-menu-incomplete');
  const btnIncompleteBack = document.getElementById('btn-incomplete-back');
  const filterPills = document.querySelectorAll('.incomplete-filter-pill:not([data-track-filter])');
  const searchInput = document.getElementById('incomplete-search-input');
  const btnSaveAll = document.getElementById('btn-save-all-incomplete');

  // Tab switching: Metadata vs Tracks
  const tabBtnMeta = document.getElementById('tab-btn-incomplete-meta');
  const tabBtnTracks = document.getElementById('tab-btn-incomplete-tracks');
  const tabPaneMeta = document.getElementById('incomplete-tab-meta-content');
  const tabPaneTracks = document.getElementById('incomplete-tab-tracks-content');

  const switchTab = (tab) => {
    activeIncompleteTab = tab;
    if (tab === 'meta') {
      if (tabBtnMeta) tabBtnMeta.classList.add('active');
      if (tabBtnTracks) tabBtnTracks.classList.remove('active');
      if (tabPaneMeta) tabPaneMeta.classList.remove('hidden');
      if (tabPaneTracks) tabPaneTracks.classList.add('hidden');
      renderIncompleteTable();
    } else {
      if (tabBtnTracks) tabBtnTracks.classList.add('active');
      if (tabBtnMeta) tabBtnMeta.classList.remove('active');
      if (tabPaneTracks) tabPaneTracks.classList.remove('hidden');
      if (tabPaneMeta) tabPaneMeta.classList.add('hidden');
      renderTracksTable();
    }
  };

  if (tabBtnMeta) tabBtnMeta.addEventListener('click', () => switchTab('meta'));
  if (tabBtnTracks) tabBtnTracks.addEventListener('click', () => switchTab('tracks'));

  // Tracks filter pills
  const trackFilterPills = document.querySelectorAll('[data-track-filter]');
  trackFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      trackFilterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentTrackFilter = pill.getAttribute('data-track-filter') || 'all';
      renderTracksTable();
    });
  });

  // Tracks search input
  const trackSearchInput = document.getElementById('incomplete-tracks-search-input');
  if (trackSearchInput) {
    trackSearchInput.addEventListener('input', (e) => {
      trackSearchQuery = e.target.value.trim().toLowerCase();
      renderTracksTable();
    });
  }

  // Navigation handlers
  if (btnMenuIncomplete) {
    btnMenuIncomplete.addEventListener('click', () => navigateTo(VIEWS.INCOMPLETE));
  }
  if (btnIncompleteBack) {
    btnIncompleteBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));
  }

  // Filter Pills handlers (Metadata)
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter') || 'all';
      renderIncompleteTable();
    });
  });

  // Search Input handler (Metadata)
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderIncompleteTable();
    });
  }

  // Save All button handler
  if (btnSaveAll) {
    btnSaveAll.addEventListener('click', () => saveAllDirtyRows());
  }

  // Batch Hikka Enrich button handler
  const btnHikkaAll = document.getElementById('btn-hikka-all-incomplete');
  if (btnHikkaAll) {
    btnHikkaAll.addEventListener('click', () => startBatchHikkaEnrich());
  }

  // Clear Console button handler
  const btnClearConsole = document.getElementById('btn-clear-incomplete-console');
  if (btnClearConsole) {
    btnClearConsole.addEventListener('click', () => {
      const consoleLogs = document.getElementById('incomplete-console-logs');
      if (consoleLogs) consoleLogs.innerHTML = '';
      lastLogId = 0;
    });
  }

  // Toggle Console button handler
  const btnToggleConsole = document.getElementById('btn-toggle-incomplete-console');
  const consoleSection = document.getElementById('incomplete-console-section');
  const toggleText = document.getElementById('btn-toggle-console-text');
  if (btnToggleConsole && consoleSection) {
    btnToggleConsole.addEventListener('click', () => {
      const isCollapsed = consoleSection.classList.toggle('collapsed');
      btnToggleConsole.classList.toggle('collapsed', isCollapsed);
      if (toggleText) {
        toggleText.textContent = isCollapsed ? 'Розгорнути консоль' : 'Згорнути консоль';
      }
    });
  }

  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.INCOMPLETE) {
      if (activeIncompleteTab === 'meta') {
        renderIncompleteTable();
      } else {
        renderTracksTable();
      }
      checkHikkaStatus();
    }
  });
}


export function renderIncompleteTable() {
  const tableBody = document.getElementById('incomplete-table-body');
  const statsFooter = document.getElementById('incomplete-shown-stats');
  if (!tableBody) return;

  const allTitles = window.TOLOKA_CATALOG?.titles || [];

  // Filter titles with missing fields or provisional data (movie?)
  const incompleteTitles = allTitles.filter(t => {
    const missing = getMissingFields(t);
    const hasPossible = hasProvisionalData(t);
    return missing.length > 0 || hasPossible;
  });

  // Update counts in filter pills
  updateFilterCounts(allTitles);

  // Apply active category filter
  let displayList = incompleteTitles.filter(t => {
    const missing = getMissingFields(t);
    if (currentFilter === 'all') return true;
    if (currentFilter === 'movie_guess') return t.type === 'movie?';
    return missing.includes(currentFilter);
  });

  // Apply search query filter
  if (searchQuery) {
    displayList = displayList.filter(t => {
      const idMatch = String(t.id).includes(searchQuery);
      const uaMatch = (t.title_ua || '').toLowerCase().includes(searchQuery);
      const origMatch = (t.title_orig || '').toLowerCase().includes(searchQuery);
      return idMatch || uaMatch || origMatch;
    });
  }

  // Update footer count
  if (statsFooter) {
    statsFooter.textContent = `Показано ${displayList.length} із ${incompleteTitles.length} неповних тайтлів`;
  }

  tableBody.innerHTML = '';

  if (displayList.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          Не знайдено тайтлів за обраними критеріями.
        </td>
      </tr>
    `;
    return;
  }

  // Limit rendering to first 150 rows for smooth DOM performance
  const pageItems = displayList.slice(0, 150);

  for (const item of pageItems) {
    const missing = getMissingFields(item);
    const isMovieGuess = item.type === 'movie?';
    const missingBadgesHtml = missing.map(f => `<span class="badge-missing">${formatMissingField(f)}</span>`).join('');
    const possibleBadgeHtml = isMovieGuess 
      ? `<span class="badge-possible" title="Тривалість > 50 хв — можливо фільм">movie?</span>` 
      : '';
    const posterSrc = item.poster || getSvgPlaceholder(item.title_ua);

    const tr = document.createElement('tr');
    tr.id = `incomplete-row-${item.id}`;

    tr.innerHTML = `
      <td class="incomplete-col-id">#${item.id}</td>
      <td>
        <img 
          src="${escapeHtml(posterSrc)}" 
          alt="${escapeHtml(item.title_ua)}" 
          class="incomplete-mini-poster" 
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.src='${getSvgPlaceholder(item.title_ua)}'"
        />
      </td>
      <td>
        <div class="incomplete-title-cell">
          <a href="#" class="incomplete-title-ua" data-id="${item.id}" title="${escapeHtml(item.title_ua)}">${escapeHtml(item.title_ua)}</a>
          ${item.title_orig ? `<span class="incomplete-title-orig">${escapeHtml(item.title_orig)}</span>` : ''}
        </div>
      </td>
      <td>
        <div class="missing-badges-wrap">
          ${possibleBadgeHtml}
          ${missingBadgesHtml}
        </div>
      </td>
      <td>
        <input 
          type="number" 
          class="inline-edit-input numeric inline-year" 
          value="${item.year || ''}" 
          data-id="${item.id}"
          placeholder="Рік"
        />
      </td>
      <td>
        <input 
          type="text" 
          class="inline-edit-input inline-country" 
          value="${escapeHtml(item.country || '')}" 
          data-id="${item.id}"
          placeholder="Країна"
        />
      </td>
      <td>
        <input 
          type="text" 
          class="inline-edit-input inline-director" 
          value="${escapeHtml(item.director || '')}" 
          data-id="${item.id}"
          placeholder="Режисер"
        />
      </td>
      <td>
        <input 
          type="text" 
          class="inline-edit-input inline-studio" 
          value="${escapeHtml(item.studio || '')}" 
          data-id="${item.id}"
          placeholder="Студія"
        />
      </td>
      <td>
        <div class="incomplete-actions-cell">
          <button type="button" class="btn-inline-save" data-id="${item.id}" title="Зберегти внесені зміни">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Зберегти</span>
          </button>
          <button type="button" class="btn-inline-edit-modal" data-id="${item.id}" title="Відкрити повне вікно редагування">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-inline-hikka" data-id="${item.id}" title="Збагатити через Hikka API (студія, режисер, жанри, сюжет, країна)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
          <button type="button" class="btn-inline-enrich" data-id="${item.id}" title="Збагатити через парсер Toloka">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>
      </td>
    `;

    // Row Event Listeners
    // 1. Quick Title Modal Click
    const titleLink = tr.querySelector('.incomplete-title-ua');
    if (titleLink) {
      titleLink.addEventListener('click', (e) => {
        e.preventDefault();
        openTitleModal(item);
      });
    }

    // 2. Track Inline Changes
    const inputs = tr.querySelectorAll('.inline-edit-input');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        input.classList.add('is-changed');
        markRowDirty(item.id, tr);
      });
      // Save on Enter
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          saveInlineRow(item.id, tr);
        }
      });
    });

    // 3. Save Button
    const saveBtn = tr.querySelector('.btn-inline-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => saveInlineRow(item.id, tr));
    }

    // 4. Edit Modal Button
    const editBtn = tr.querySelector('.btn-inline-edit-modal');
    if (editBtn) {
      editBtn.addEventListener('click', () => openEditModal(item));
    }

    // 5. Hikka Enrich Button
    const hikkaBtn = tr.querySelector('.btn-inline-hikka');
    if (hikkaBtn) {
      hikkaBtn.addEventListener('click', () => enrichSingleHikka(item.id, hikkaBtn, tr));
    }

    // 6. Toloka Enrich Button
    const enrichBtn = tr.querySelector('.btn-inline-enrich');
    if (enrichBtn) {
      enrichBtn.addEventListener('click', () => enrichSingleTitle(item.id, enrichBtn));
    }


    tableBody.appendChild(tr);
  }
}

function markRowDirty(titleId, rowEl) {
  const yearInput = rowEl.querySelector('.inline-year');
  const countryInput = rowEl.querySelector('.inline-country');
  const directorInput = rowEl.querySelector('.inline-director');
  const studioInput = rowEl.querySelector('.inline-studio');

  const payload = {
    id: titleId,
    year: yearInput.value ? parseInt(yearInput.value, 10) : null,
    country: countryInput.value.trim(),
    director: directorInput.value.trim(),
    studio: studioInput.value.trim()
  };

  dirtyRows.set(titleId, { payload, tr: rowEl });
  updateSaveAllButtonState();
}

function updateSaveAllButtonState() {
  const saveAllBtn = document.getElementById('btn-save-all-incomplete');
  const countSpan = document.getElementById('incomplete-changed-count');
  const count = dirtyRows.size;
  if (countSpan) countSpan.textContent = count;
  if (saveAllBtn) saveAllBtn.disabled = (count === 0);
}

async function saveAllDirtyRows() {
  if (dirtyRows.size === 0) return;
  const saveAllBtn = document.getElementById('btn-save-all-incomplete');
  const originalHtml = saveAllBtn ? saveAllBtn.innerHTML : '';
  if (saveAllBtn) {
    saveAllBtn.disabled = true;
    saveAllBtn.innerHTML = `<span>Збереження...</span>`;
  }

  const titlesToUpdate = Array.from(dirtyRows.values()).map(d => d.payload);
  try {
    const res = await fetch('/api/titles/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: titlesToUpdate })
    });
    const data = await res.json();
    if (data.success) {
      for (const [tid, { payload, tr }] of dirtyRows.entries()) {
        const item = (window.TOLOKA_CATALOG?.titles || []).find(t => t.id === tid);
        if (item) {
          if (payload.year !== undefined) item.year = payload.year;
          if (payload.country !== undefined) item.country = payload.country;
          if (payload.director !== undefined) item.director = payload.director;
          if (payload.studio !== undefined) item.studio = payload.studio;
        }
        if (tr) {
          tr.querySelectorAll('.inline-edit-input').forEach(inp => inp.classList.remove('is-changed'));
          const saveBtn = tr.querySelector('.btn-inline-save');
          if (saveBtn) {
            saveBtn.innerHTML = `<span>✓</span>`;
            setTimeout(() => {
              saveBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Зберегти</span>
              `;
            }, 1800);
          }
        }
      }
      dirtyRows.clear();
      updateSaveAllButtonState();
    }
  } catch (err) {
    console.error('Помилка пакетного збереження:', err);
  } finally {
    if (saveAllBtn) {
      saveAllBtn.innerHTML = originalHtml;
      updateSaveAllButtonState();
    }
  }
}

async function saveInlineRow(titleId, rowEl) {
  const allTitles = window.TOLOKA_CATALOG?.titles || [];
  const item = allTitles.find(t => t.id === titleId);
  if (!item || !rowEl) return;

  const yearInput = rowEl.querySelector('.inline-year');
  const countryInput = rowEl.querySelector('.inline-country');
  const directorInput = rowEl.querySelector('.inline-director');
  const studioInput = rowEl.querySelector('.inline-studio');
  const saveBtn = rowEl.querySelector('.btn-inline-save');

  const newYear = yearInput.value ? parseInt(yearInput.value, 10) : null;
  const newCountry = countryInput.value.trim();
  const newDirector = directorInput.value.trim();
  const newStudio = studioInput.value.trim();

  const payload = {
    id: titleId,
    year: newYear,
    country: newCountry,
    director: newDirector,
    studio: newStudio
  };

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span>...</span>`;
  }

  try {
    const res = await fetch('/api/titles/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      item.year = newYear;
      item.country = newCountry;
      item.director = newDirector;
      item.studio = newStudio;

      dirtyRows.delete(titleId);
      updateSaveAllButtonState();

      [yearInput, countryInput, directorInput, studioInput].forEach(inp => {
        if (inp) inp.classList.remove('is-changed');
      });

      // Update badges
      const missing = getMissingFields(item);
      const isMovieGuess = item.type === 'movie?';
      const missingBadgesHtml = missing.map(f => `<span class="badge-missing">${formatMissingField(f)}</span>`).join('');
      const possibleBadgeHtml = isMovieGuess 
        ? `<span class="badge-possible" title="Тривалість > 50 хв — можливо фільм">movie?</span>` 
        : '';
      const badgesWrap = rowEl.querySelector('.missing-badges-wrap');
      if (badgesWrap) {
        badgesWrap.innerHTML = possibleBadgeHtml + missingBadgesHtml;
      }

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Збережено</span>
        `;
        setTimeout(() => {
          saveBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Зберегти</span>
          `;
        }, 1500);
      }
    }
  } catch (err) {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<span>Помилка</span>`;
    }
  }
}

async function enrichSingleTitle(titleId, btnEl) {
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await fetch('/api/parser/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: titleId, count: 1 })
    });
    if (res.ok) {
      navigateTo(VIEWS.PARSER);
    }
  } catch (err) {
    console.error('Помилка запуску збагачення:', err);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function enrichSingleHikka(titleId, btnEl, rowEl) {
  if (btnEl) btnEl.disabled = true;
  const originalHtml = btnEl.innerHTML;
  btnEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  appendHikkaLog(`[Запит] Збагачення #${titleId} через Hikka API...`, 'info');

  try {
    const res = await fetch('/api/hikka/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: titleId })
    });
    const data = await res.json();

    if (data.success && data.updated) {
      const enrichedData = data.data || {};
      const allTitles = window.TOLOKA_CATALOG?.titles || [];
      const item = allTitles.find(t => t.id === titleId);

      // Update inputs in row
      const directorInput = rowEl.querySelector('.inline-director');
      const studioInput = rowEl.querySelector('.inline-studio');
      const countryInput = rowEl.querySelector('.inline-country');

      if (directorInput && enrichedData.director) {
        directorInput.value = enrichedData.director;
        directorInput.classList.remove('is-changed');
      }
      if (studioInput && enrichedData.studio) {
        studioInput.value = enrichedData.studio;
        studioInput.classList.remove('is-changed');
      }
      if (countryInput && enrichedData.country) {
        countryInput.value = enrichedData.country;
        countryInput.classList.remove('is-changed');
      }

      // Update in-memory item
      if (item) {
        if (enrichedData.director) item.director = enrichedData.director;
        if (enrichedData.studio) item.studio = enrichedData.studio;
        if (enrichedData.country) item.country = enrichedData.country;
        if (enrichedData.genres && enrichedData.genres.length > 0) item.genres = enrichedData.genres;
        if (enrichedData.synopsis) item.synopsis = enrichedData.synopsis;

        // Update badges
        const missing = getMissingFields(item);
        const missingBadgesHtml = missing.map(f => `<span class="badge-missing">${formatMissingField(f)}</span>`).join('');
        const isMovieGuess = item.type === 'movie?';
        const possibleBadgeHtml = isMovieGuess 
          ? `<span class="badge-possible" title="Тривалість > 50 хв — можливо фільм">movie?</span>` 
          : '';
        const badgesWrap = rowEl.querySelector('.missing-badges-wrap');
        if (badgesWrap) {
          badgesWrap.innerHTML = possibleBadgeHtml + missingBadgesHtml;
        }

        // Animate row removal if it no longer matches the current filter
        const stillBelongs = currentFilter === 'all'
          ? (missing.length > 0 || isMovieGuess)
          : (currentFilter === 'movie_guess' ? isMovieGuess : missing.includes(currentFilter));

        if (!stillBelongs) {
          setTimeout(() => {
            rowEl.classList.add('row-enriched-fade-out');
            setTimeout(() => {
              rowEl.remove();
              const statsFooter = document.getElementById('incomplete-shown-stats');
              const remainingRows = document.querySelectorAll('#incomplete-table-body tr:not(.row-enriched-fade-out)').length;
              if (statsFooter) {
                statsFooter.textContent = `Показано ${remainingRows} неповних тайтлів`;
              }
            }, 450);
          }, 1200);
        }
      }

      updateFilterCounts(allTitles);
      const fieldsStr = data.fields_enriched ? data.fields_enriched.join(', ') : 'дані';
      appendHikkaLog(`✓ #${titleId} успішно оновлено: ${fieldsStr}`, 'success');

      btnEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.disabled = false;
      }, 1500);
    } else {
      const msg = data.message || 'Дані не знайдено на Hikka';
      appendHikkaLog(`– #${titleId}: ${msg}`, 'info');
      btnEl.innerHTML = `<span title="${msg}">✕</span>`;
      setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.disabled = false;
      }, 1500);
    }
  } catch (err) {
    console.error('Помилка збагачення через Hikka:', err);
    appendHikkaLog(`⚠ Помилка при збагаченні #${titleId}: ${err}`, 'error');
    btnEl.innerHTML = `<span>✕</span>`;
    setTimeout(() => {
      btnEl.innerHTML = originalHtml;
      btnEl.disabled = false;
    }, 1500);
  }
}

function checkHikkaStatus() {
  fetch('/api/hikka/status')
    .then(r => r.json())
    .then(data => {
      updateHikkaUI(data);
      if (data.is_running && !pollTimer) {
        startHikkaPolling();
      }
    })
    .catch(() => {});
}

function updateHikkaUI(data) {
  if (!data) return;
  const statusIndicator = document.getElementById('incomplete-status-indicator');
  const statusText = document.getElementById('incomplete-status-text');
  const processedEl = document.getElementById('incomplete-processed-count');
  const enrichedEl = document.getElementById('incomplete-enriched-count');
  const btnHikkaAll = document.getElementById('btn-hikka-all-incomplete');
  const btnHikkaText = document.getElementById('btn-hikka-all-text');

  if (processedEl && data.total_candidates !== undefined) {
    processedEl.textContent = `${data.processed_count || 0} із ${data.total_candidates || 0}`;
  }
  if (enrichedEl && data.enriched_count !== undefined) {
    enrichedEl.textContent = Number(data.enriched_count).toLocaleString('uk-UA');
  }

  if (data.is_running) {
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = data.message || 'Збагачення триває...';
    if (btnHikkaAll) btnHikkaAll.disabled = true;
    if (btnHikkaText) btnHikkaText.textContent = `Збагачення (${data.enriched_count || 0})...`;
  }

  // Stream logs
  if (data.latest_logs && data.latest_logs.length > 0) {
    for (const log of data.latest_logs) {
      if (log.id !== undefined) {
        if (log.id > lastLogId) {
          appendHikkaLog(log.text, log.type, log.time);
          lastLogId = log.id;
        }
      } else {
        appendHikkaLog(log.text, log.type);
      }
    }
  }

  // Live update DOM table rows for enriched items
  if (data.recent_items && data.recent_items.length > 0) {
    const allTitles = window.TOLOKA_CATALOG?.titles || [];
    let stateChanged = false;

    for (const item of data.recent_items) {
      if (!item || !item.topic_id) continue;
      const tid = Number(item.topic_id);
      const enrichedData = item.data;
      if (!enrichedData) continue;

      const memItem = allTitles.find(t => t.id === tid);
      if (memItem) {
        if (enrichedData.director && memItem.director !== enrichedData.director) {
          memItem.director = enrichedData.director;
          stateChanged = true;
        }
        if (enrichedData.studio && memItem.studio !== enrichedData.studio) {
          memItem.studio = enrichedData.studio;
          stateChanged = true;
        }
        if (enrichedData.country && memItem.country !== enrichedData.country) {
          memItem.country = enrichedData.country;
          stateChanged = true;
        }
        if (enrichedData.genres && enrichedData.genres.length > 0) {
          memItem.genres = enrichedData.genres;
          stateChanged = true;
        }
        if (enrichedData.synopsis) {
          memItem.synopsis = enrichedData.synopsis;
        }
      }

      const rowEl = document.getElementById(`incomplete-row-${tid}`);
      if (rowEl) {
        const directorInput = rowEl.querySelector('.inline-director');
        const studioInput = rowEl.querySelector('.inline-studio');
        const countryInput = rowEl.querySelector('.inline-country');

        if (directorInput && enrichedData.director) {
          directorInput.value = enrichedData.director;
          directorInput.classList.remove('is-changed');
          directorInput.classList.add('is-enriched-flash');
        }
        if (studioInput && enrichedData.studio) {
          studioInput.value = enrichedData.studio;
          studioInput.classList.remove('is-changed');
          studioInput.classList.add('is-enriched-flash');
        }
        if (countryInput && enrichedData.country) {
          countryInput.value = enrichedData.country;
          countryInput.classList.remove('is-changed');
          countryInput.classList.add('is-enriched-flash');
        }

        const missing = memItem ? getMissingFields(memItem) : [];
        const isMovieGuess = memItem ? (memItem.type === 'movie?') : false;
        const missingBadgesHtml = missing.map(f => `<span class="badge-missing">${formatMissingField(f)}</span>`).join('');
        const possibleBadgeHtml = isMovieGuess 
          ? `<span class="badge-possible" title="Тривалість > 50 хв — можливо фільм">movie?</span>` 
          : '';
        const badgesWrap = rowEl.querySelector('.missing-badges-wrap');
        if (badgesWrap) {
          badgesWrap.innerHTML = possibleBadgeHtml + missingBadgesHtml;
        }

        // Animate row removal if it no longer matches the current filter
        const stillBelongs = currentFilter === 'all'
          ? (missing.length > 0 || isMovieGuess)
          : (currentFilter === 'movie_guess' ? isMovieGuess : missing.includes(currentFilter));

        if (!stillBelongs && !rowEl.classList.contains('row-enriched-fade-out')) {
          rowEl.classList.add('row-enriched-fade-out');
          setTimeout(() => {
            rowEl.remove();
            const statsFooter = document.getElementById('incomplete-shown-stats');
            const remainingRows = document.querySelectorAll('#incomplete-table-body tr:not(.row-enriched-fade-out)').length;
            if (statsFooter) {
              statsFooter.textContent = `Показано ${remainingRows} неповних тайтлів`;
            }
          }, 450);
        }
      }
    }

    if (stateChanged) {
      updateFilterCounts(allTitles);
    }
  }
}

function startHikkaPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/hikka/status');
      if (!res.ok) return;
      const data = await res.json();
      updateHikkaUI(data);

      if (!data.is_running) {
        clearInterval(pollTimer);
        pollTimer = null;
        const statusIndicator = document.getElementById('incomplete-status-indicator');
        const statusText = document.getElementById('incomplete-status-text');
        const btnHikkaAll = document.getElementById('btn-hikka-all-incomplete');
        const btnHikkaText = document.getElementById('btn-hikka-all-text');

        if (statusIndicator) statusIndicator.classList.remove('running');
        if (statusText) statusText.textContent = data.message || 'Збагачення завершено';
        if (btnHikkaAll) btnHikkaAll.disabled = false;
        if (btnHikkaText) btnHikkaText.textContent = 'Збагатити через Hikka API';

        // Re-render table cleanly to sync pagination and views with newly built catalog
        renderIncompleteTable();
      }
    } catch {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 800);
}

async function startBatchHikkaEnrich() {
  const btn = document.getElementById('btn-hikka-all-incomplete');
  const btnText = document.getElementById('btn-hikka-all-text');
  const consoleSection = document.getElementById('incomplete-console-section');
  const btnToggleConsole = document.getElementById('btn-toggle-incomplete-console');
  const toggleText = document.getElementById('btn-toggle-console-text');

  // Auto-expand console
  if (consoleSection && consoleSection.classList.contains('collapsed')) {
    consoleSection.classList.remove('collapsed');
    if (btnToggleConsole) btnToggleConsole.classList.remove('collapsed');
    if (toggleText) toggleText.textContent = 'Згорнути консоль';
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Запуск...';
  appendHikkaLog(`Запуск пакетного збагачення через Hikka API (фільтр: ${currentFilter})...`, 'info');

  try {
    const res = await fetch('/api/hikka/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 150, filter: currentFilter })
    });
    if (!res.ok) {
      const err = await res.text();
      appendHikkaLog(`Помилка запуску: ${err}`, 'error');
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Збагатити через Hikka API';
      return;
    }

    startHikkaPolling();
  } catch (err) {
    console.error('Помилка пакетного збагачення:', err);
    appendHikkaLog(`Помилка зв'язку з сервером: ${err}`, 'error');
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'Збагатити через Hikka API';
  }
}



function hasProvisionalData(item) {
  return item && item.type === 'movie?';
}

function getMissingFields(item) {
  const missing = [];
  if (!item.year) missing.push('year');
  if (!item.director || !item.director.trim()) missing.push('director');
  if (!item.studio || !item.studio.trim()) missing.push('studio');
  if (!item.country || !item.country.trim()) missing.push('country');
  if (!item.genres || item.genres.length === 0) missing.push('genres');
  if (!item.poster || !item.poster.trim()) missing.push('poster');
  return missing;
}

function formatMissingField(field) {
  const map = {
    year: 'Рік',
    director: 'Режисер',
    studio: 'Студія',
    country: 'Країна',
    genres: 'Жанри',
    poster: 'Постер'
  };
  return map[field] || field;
}

function updateFilterCounts(titles) {
  const counts = { all: 0, movie_guess: 0, year: 0, director: 0, studio: 0, country: 0, genres: 0, poster: 0 };
  for (const t of titles) {
    const m = getMissingFields(t);
    const isGuess = hasProvisionalData(t);
    if (m.length > 0 || isGuess) {
      counts.all++;
      if (isGuess) counts.movie_guess++;
      for (const field of m) {
        if (counts[field] !== undefined) counts[field]++;
      }
    }
  }

  for (const [key, val] of Object.entries(counts)) {
    const el = document.getElementById(`incomplete-count-${key}`);
    if (el) el.textContent = val;
  }

  const tabBadgeMeta = document.getElementById('tab-badge-meta');
  if (tabBadgeMeta) tabBadgeMeta.textContent = counts.all;

  // Keep tracks counters in sync
  updateTracksFilterCounts(titles);
}

export function getTrackDetails(item) {
  const adapt = item.adaptation_team || {};
  const adaptKeys = Object.keys(adapt);

  // Video
  const videoKeys = adaptKeys.filter(k => k.toLowerCase().startsWith('відео') || k.toLowerCase().startsWith('video'));
  const hasVideo = videoKeys.length > 0;
  let videoSummary = '';
  if (hasVideo) {
    const val = adapt[videoKeys[0]] || '';
    const lines = typeof val === 'string' ? val.split('\n') : [];
    const resLine = lines.find(l => /роздільн|розмір|1080|720|2160|576|480/i.test(l)) || '';
    const codecLine = lines.find(l => /кодек|формат|x264|x265|hevc|avc|h\.264|h\.265/i.test(l)) || '';
    videoSummary = [codecLine, resLine].filter(Boolean).map(l => l.split(':')[1]?.trim() || l.trim()).join(' / ');
    if (!videoSummary && typeof val === 'string') {
      videoSummary = val.split('\n')[0]?.trim() || 'Наявне';
    }
  }

  // Audio
  const audioKeys = adaptKeys.filter(k => k.toLowerCase().startsWith('аудіо') || k.toLowerCase().startsWith('audio') || k.toLowerCase().startsWith('звук'));
  const hasAudio = audioKeys.length > 0;
  const audioLangs = [];
  if (hasAudio) {
    for (const ak of audioKeys) {
      const val = adapt[ak];
      if (typeof val === 'string') {
        const lines = val.split('\n');
        const langLine = lines.find(l => l.toLowerCase().startsWith('мова:')) || '';
        if (langLine) {
          const l = langLine.split(':')[1]?.trim() || '';
          if (/укр/i.test(l)) audioLangs.push('UKR');
          else if (/япон/i.test(l)) audioLangs.push('JAP');
          else if (/англ/i.test(l)) audioLangs.push('ENG');
          else {
            const first = l.split(/[\s,(|]/)[0];
            if (first && first.length <= 5) audioLangs.push(first.toUpperCase());
          }
        }
      }
    }
  }

  // Subtitles
  const subKeys = adaptKeys.filter(k => k.toLowerCase().startsWith('субтитри') || k.toLowerCase().startsWith('sub'));
  const hasSubTracks = subKeys.length > 0;
  const hasSubFlag = Boolean(item.has_sub);

  const missingVideo = !hasVideo;
  const missingAudio = !hasAudio;
  const missingSubs = hasSubFlag && !hasSubTracks;

  return {
    hasVideo,
    videoSummary,
    missingVideo,
    hasAudio,
    audioCount: audioKeys.length,
    audioLangs: [...new Set(audioLangs)],
    missingAudio,
    hasSubTracks,
    subCount: subKeys.length,
    hasSubFlag,
    missingSubs
  };
}

export function updateTracksFilterCounts(titles) {
  let countAll = 0;
  let countVideo = 0;
  let countAudio = 0;
  let countSubs = 0;

  for (const t of titles) {
    const td = getTrackDetails(t);
    if (td.missingVideo || td.missingAudio) {
      countAll++;
    }
    if (td.missingVideo) countVideo++;
    if (td.missingAudio) countAudio++;
    if (td.missingSubs) countSubs++;
  }

  const elAll = document.getElementById('incomplete-tracks-count-all');
  const elVideo = document.getElementById('incomplete-tracks-count-video');
  const elAudio = document.getElementById('incomplete-tracks-count-audio');
  const elSubs = document.getElementById('incomplete-tracks-count-subs');
  const tabBadgeTracks = document.getElementById('tab-badge-tracks');

  if (elAll) elAll.textContent = countAll;
  if (elVideo) elVideo.textContent = countVideo;
  if (elAudio) elAudio.textContent = countAudio;
  if (elSubs) elSubs.textContent = countSubs;
  if (tabBadgeTracks) tabBadgeTracks.textContent = countAll;
}

export function renderTracksTable() {
  const tableBody = document.getElementById('incomplete-tracks-table-body');
  const statsFooter = document.getElementById('incomplete-tracks-shown-stats');
  if (!tableBody) return;

  const allTitles = window.TOLOKA_CATALOG?.titles || [];
  updateTracksFilterCounts(allTitles);

  let filtered = allTitles.filter(t => {
    const td = getTrackDetails(t);
    if (currentTrackFilter === 'all') return td.missingVideo || td.missingAudio;
    if (currentTrackFilter === 'video') return td.missingVideo;
    if (currentTrackFilter === 'audio') return td.missingAudio;
    if (currentTrackFilter === 'subs') return td.missingSubs;
    return true;
  });

  if (trackSearchQuery) {
    filtered = filtered.filter(t => {
      const idMatch = String(t.id).includes(trackSearchQuery);
      const uaMatch = (t.title_ua || '').toLowerCase().includes(trackSearchQuery);
      const origMatch = (t.title_orig || '').toLowerCase().includes(trackSearchQuery);
      return idMatch || uaMatch || origMatch;
    });
  }

  if (statsFooter) {
    statsFooter.textContent = `Показано ${filtered.length} із ${allTitles.length} тайтлів`;
  }

  tableBody.innerHTML = '';
  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--color-text-muted);">
          Не знайдено тайтлів за обраними критеріями доріжок.
        </td>
      </tr>
    `;
    return;
  }

  const pageItems = filtered.slice(0, 150);

  for (const item of pageItems) {
    const td = getTrackDetails(item);
    const posterSrc = item.poster || getSvgPlaceholder(item.title_ua);

    // Video badge
    let videoHtml = '';
    if (td.hasVideo) {
      videoHtml = `<span class="badge-track-ok" title="${escapeHtml(td.videoSummary || 'Відео наявне')}">✓ ${escapeHtml(td.videoSummary || 'Відео є')}</span>`;
    } else {
      videoHtml = `<span class="badge-track-missing">✕ Відсутнє відео</span>`;
    }

    // Audio badge
    let audioHtml = '';
    if (td.hasAudio) {
      const langs = td.audioLangs.length > 0 ? td.audioLangs.join(', ') : `${td.audioCount} дор.`;
      audioHtml = `<span class="badge-track-ok">✓ ${escapeHtml(langs)} (${td.audioCount})</span>`;
    } else {
      audioHtml = `<span class="badge-track-missing">✕ Відсутнє аудіо</span>`;
    }

    // Subs badge
    let subsHtml = '';
    if (td.hasSubTracks) {
      subsHtml = `<span class="badge-track-ok">✓ Наявні (${td.subCount})</span>`;
    } else if (td.hasSubFlag) {
      subsHtml = `<span class="badge-track-warning" title="У роздачі є прапорець SUB, але детальний опис доріжки субтитрів не запарсено">⚠ В роздачі SUB (не запарсено)</span>`;
    } else {
      subsHtml = `<span class="badge-track-none">— Без субтитрів</span>`;
    }

    const tr = document.createElement('tr');
    tr.id = `incomplete-track-row-${item.id}`;

    tr.innerHTML = `
      <td class="incomplete-col-id">#${item.id}</td>
      <td>
        <img 
          src="${escapeHtml(posterSrc)}" 
          alt="${escapeHtml(item.title_ua)}" 
          class="incomplete-mini-poster" 
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.src='${getSvgPlaceholder(item.title_ua)}'"
        />
      </td>
      <td>
        <div class="incomplete-title-cell">
          <a href="#" class="incomplete-title-ua" data-id="${item.id}" title="${escapeHtml(item.title_ua)}">${escapeHtml(item.title_ua)}</a>
          ${item.title_orig ? `<span class="incomplete-title-orig">${escapeHtml(item.title_orig)}</span>` : ''}
        </div>
      </td>
      <td>
        <span class="track-quality-cell">${escapeHtml(item.quality || '—')}</span>
      </td>
      <td>${videoHtml}</td>
      <td>${audioHtml}</td>
      <td>${subsHtml}</td>
      <td>
        <div class="incomplete-actions-cell">
          <button type="button" class="btn-inline-edit-modal" data-id="${item.id}" title="Відкрити деталі тайтлу">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-inline-enrich btn-track-reparse" data-id="${item.id}" title="Перепарсити топік з Toloka (оновлює блоки аудіо/відео)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
          ${item.url ? `
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn-track-toloka" title="Відкрити тему на Толоці">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          ` : ''}
        </div>
      </td>
    `;

    // Row Event Listeners
    const titleLink = tr.querySelector('.incomplete-title-ua');
    if (titleLink) {
      titleLink.addEventListener('click', (e) => {
        e.preventDefault();
        openTitleModal(item);
      });
    }

    const viewBtn = tr.querySelector('.btn-inline-edit-modal');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => openTitleModal(item));
    }

    const reparseBtn = tr.querySelector('.btn-track-reparse');
    if (reparseBtn) {
      reparseBtn.addEventListener('click', () => enrichSingleTitle(item.id, reparseBtn));
    }

    tableBody.appendChild(tr);
  }
}
