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
const dirtyRows = new Map();

export function initIncompleteView() {
  const btnMenuIncomplete = document.getElementById('btn-menu-incomplete');
  const btnIncompleteBack = document.getElementById('btn-incomplete-back');
  const filterPills = document.querySelectorAll('.incomplete-filter-pill');
  const searchInput = document.getElementById('incomplete-search-input');
  const btnSaveAll = document.getElementById('btn-save-all-incomplete');

  // Navigation handlers
  if (btnMenuIncomplete) {
    btnMenuIncomplete.addEventListener('click', () => navigateTo(VIEWS.INCOMPLETE));
  }
  if (btnIncompleteBack) {
    btnIncompleteBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));
  }

  // Filter Pills handlers
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.getAttribute('data-filter') || 'all';
      renderIncompleteTable();
    });
  });

  // Search Input handler
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


  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.INCOMPLETE) {
      renderIncompleteTable();
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
      }

      updateFilterCounts(allTitles);

      btnEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.disabled = false;
      }, 1500);
    } else {
      btnEl.innerHTML = `<span title="${data.message || 'Дані не знайдено'}">✕</span>`;
      setTimeout(() => {
        btnEl.innerHTML = originalHtml;
        btnEl.disabled = false;
      }, 1500);
    }
  } catch (err) {
    console.error('Помилка збагачення через Hikka:', err);
    btnEl.innerHTML = `<span>✕</span>`;
    setTimeout(() => {
      btnEl.innerHTML = originalHtml;
      btnEl.disabled = false;
    }, 1500);
  }
}

async function startBatchHikkaEnrich() {
  const btn = document.getElementById('btn-hikka-all-incomplete');
  const btnText = document.getElementById('btn-hikka-all-text');
  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'Збагачення...';

  try {
    const res = await fetch('/api/hikka/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 150, filter: currentFilter })
    });
    if (!res.ok) {
      if (btnText) btnText.textContent = 'Помилка';
      setTimeout(() => {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Збагатити через Hikka API';
      }, 2000);
      return;
    }

    // Polling status
    const pollInterval = setInterval(async () => {
      try {
        const sRes = await fetch('/api/hikka/status');
        const sData = await sRes.json();
        if (sData.is_running) {
          if (btnText) btnText.textContent = `Збагачення (${sData.enriched_count || 0})...`;
        } else {
          clearInterval(pollInterval);
          if (btnText) btnText.textContent = `Оновлено ${sData.enriched_count || 0}!`;
          setTimeout(() => {
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Збагатити через Hikka API';
            window.location.reload();
          }, 1500);
        }
      } catch {
        clearInterval(pollInterval);
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Збагатити через Hikka API';
      }
    }, 1200);

  } catch (err) {
    console.error('Помилка пакетного збагачення:', err);
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
}
