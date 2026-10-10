/**
 * Main Application Orchestrator
 */
import { state } from './state.js';
import { debounce, formatNumber, escapeHtml, getSvgPlaceholder } from './utils.js';
import { filterAndSortTitles } from './search.js';
import { renderTitleCard } from './components/card.js';
import { renderTableView } from './components/tableView.js';
import { initModal, openTitleModal, closeTitleModal } from './components/modal.js';
import { renderPagination } from './components/pagination.js';
import { initEditModal } from './components/editModal.js';
import { initParserView } from './components/parserView.js';
import { initVocSyncView } from './components/vocSyncView.js';
import { initExtSyncView } from './components/extSyncView.js';
import { initPosterDownloaderView } from './components/posterDownloaderView.js';
import { initIncompleteView } from './components/incompleteView.js';
import { initFallbackModal, openFallbackModal } from './components/fallbackModal.js';
import { initDeleteModal } from './components/deleteModal.js';
import { initTheme } from './components/theme.js';
import { 
  initRouter, 
  getActiveView, 
  navigateTo, 
  VIEWS, 
  onRouteChanged,
  parseCatalogParamsFromUrl,
  syncUrlWithCatalogState 
} from './router.js';

// Registry of custom select components
const customSelects = {};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  let catalogData = window.TOLOKA_CATALOG;
  let isFallbackLoaded = false;

  if (!catalogData) {
    console.warn('Основний файл data/catalog.js не знайдено. Спроба завантаження JSON фолбеку...');
    // Try lite fallback first for fastest loading
    try {
      const respLite = await fetch('data/catalog_fallback_lite.json');
      if (respLite.ok) {
        catalogData = await respLite.json();
        isFallbackLoaded = true;
        console.info('Каталог успішно завантажено з легкого JSON фолбеку (catalog_fallback_lite.json)!');
      }
    } catch (err) {
      console.warn('Не вдалося завантажити catalog_fallback_lite.json:', err);
    }

    // If lite wasn't found, try full fallback
    if (!catalogData) {
      try {
        const respFull = await fetch('data/catalog_fallback.json');
        if (respFull.ok) {
          catalogData = await respFull.json();
          isFallbackLoaded = true;
          console.info('Каталог успішно завантажено з повного JSON фолбеку (catalog_fallback.json)!');
        }
      } catch (err) {
        console.warn('Помилка читання data/catalog_fallback.json:', err);
      }
    }
  }

  if (!catalogData) {
    console.error('Каталог даних Toloka не знайдено!');
    const gridEl = document.getElementById('catalog-grid');
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="empty-state">
          <h3>Помилка завантаження даних</h3>
          <p>Не вдалося знайти файл data/catalog.js, а також резервний data/catalog_fallback.json.</p>
          <button type="button" class="btn btn-primary" id="btn-empty-fallback-action">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Сформувати JSON фолбек</span>
          </button>
        </div>
      `;
    }
    initFallbackModal();
    const btnEmpty = document.getElementById('btn-empty-fallback-action');
    if (btnEmpty) {
      btnEmpty.addEventListener('click', () => openFallbackModal());
    }
    return;
  }

  // Initialize Modals and Dedicated Views
  initModal();
  initEditModal();
  initParserView();
  initVocSyncView();
  initExtSyncView();
  initPosterDownloaderView();
  initIncompleteView();
  initFallbackModal();
  initDeleteModal();
  initRouter();

  // Initialize State
  state.init(catalogData);

  if (isFallbackLoaded) {
    const statsSection = document.querySelector('.stats-pill-section');
    if (statsSection && !statsSection.querySelector('.fallback-notice-pill')) {
      const pill = document.createElement('div');
      pill.className = 'fallback-notice-pill';
      pill.title = 'Каталог працює в автономному режимі з резервного файлу data/catalog_fallback.json';
      pill.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>Фолбек JSON</span>
      `;
      statsSection.appendChild(pill);
    }
  }

  // Setup DOM Elements
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const btnSearchMobileTrigger = document.getElementById('btn-search-mobile-trigger');
  const searchModal = document.getElementById('search-modal');
  const searchModalInput = document.getElementById('search-modal-input');
  const searchModalClear = document.getElementById('search-modal-clear');
  const searchModalClose = document.getElementById('search-modal-close');
  const searchModalResults = document.getElementById('search-modal-results');
  const searchModalFooter = document.getElementById('search-modal-footer');
  const totalCountEl = document.getElementById('header-total-count');
  const catalogGrid = document.getElementById('catalog-grid');
  const catalogTableWrap = document.getElementById('catalog-table-wrap');
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewTable = document.getElementById('btn-view-table');
  const paginationWrapper = document.getElementById('pagination-wrapper');
  const activeFiltersRow = document.getElementById('active-filters-row');
  const filtersBar = document.getElementById('filters-bar');
  const btnToggleFilters = document.getElementById('btn-toggle-filters');

  // Mobile Filters Accordion Toggle with sessionStorage persistence
  if (btnToggleFilters && filtersBar) {
    const savedFiltersOpen = sessionStorage.getItem('toloka_mobile_filters_open') === 'true';
    if (savedFiltersOpen) {
      filtersBar.classList.add('filters-open');
      btnToggleFilters.setAttribute('aria-expanded', 'true');
    }

    btnToggleFilters.addEventListener('click', () => {
      const isOpen = filtersBar.classList.toggle('filters-open');
      btnToggleFilters.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      sessionStorage.setItem('toloka_mobile_filters_open', isOpen ? 'true' : 'false');
    });
  }

  // Mobile Centered Search Dialog Modal
  function renderSearchModalResults(query) {
    if (!searchModalResults) return;
    const cleanQuery = (query || '').trim().toLowerCase();

    if (!cleanQuery) {
      searchModalResults.innerHTML = `
        <div class="search-modal-empty">
          Почніть вводити назву, режисера або команду озвучення для швидкого пошуку...
        </div>
      `;
      if (searchModalFooter) {
        searchModalFooter.innerHTML = '';
      }
      return;
    }

    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    const allTitles = window.TOLOKA_CATALOG?.titles || [];
    const matched = [];

    for (const item of allTitles) {
      const corpus = `${item.title_ua || ''} ${item.title_orig || ''} ${item.raw_title || ''} ${item.director || ''} ${item.studio || ''} ${item.uploader || ''} ${(item.teams || []).join(' ')} ${item.id}`.toLowerCase();
      let match = true;
      for (const t of terms) {
        if (!corpus.includes(t)) {
          match = false;
          break;
        }
      }
      if (match) {
        matched.push(item);
      }
    }

    if (matched.length === 0) {
      searchModalResults.innerHTML = `
        <div class="search-modal-empty">Нічого не знайдено за запитом &laquo;${escapeHtml(query)}&raquo;</div>
      `;
      if (searchModalFooter) {
        searchModalFooter.innerHTML = '';
      }
      return;
    }

    const limit = 30;
    const topMatches = matched.slice(0, limit);

    searchModalResults.innerHTML = topMatches.map((item) => {
      const posterSrc = item.local_poster || item.poster || getSvgPlaceholder(item.title_ua);
      const yearStr = item.year ? `${item.year}` : '';
      const epsStr = item.episodes ? `${item.episodes} сер.` : '';
      const typeStr = item.type === 'movie' ? 'Фільм' : (item.type === 'movie?' ? 'Фільм?' : (item.type === 'ova' ? 'OVA' : (item.type === 'ona' ? 'ONA' : 'Серіал')));

      return `
        <div class="search-modal-item" data-id="${item.id}" role="button" tabindex="0">
          <img class="search-modal-thumb" src="${escapeHtml(posterSrc)}" alt="${escapeHtml(item.title_ua)}" loading="lazy">
          <div class="search-modal-info">
            <div class="search-modal-title-ua">${escapeHtml(item.title_ua)}</div>
            ${item.title_orig ? `<div class="search-quick-title-orig">${escapeHtml(item.title_orig)}</div>` : ''}
            <div class="search-modal-meta">
              ${yearStr ? `<span class="search-modal-year">${yearStr}</span>` : ''}
              <div class="search-modal-badges">
                <span class="search-modal-badge">${typeStr}</span>
                ${item.quality ? `<span class="search-modal-badge">${escapeHtml(item.quality)}</span>` : ''}
                ${epsStr ? `<span class="search-modal-badge">${epsStr}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to rendered items
    searchModalResults.querySelectorAll('.search-modal-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const id = parseInt(itemEl.dataset.id, 10);
        const item = allTitles.find(t => t.id === id);
        if (item) {
          if (searchModal && searchModal.open) searchModal.close();
          openTitleModal(item);
        }
      });
    });

    if (searchModalFooter) {
      const total = matched.length;
      searchModalFooter.innerHTML = `
        <span>Знайдено: <strong class="search-modal-footer-count">${formatNumber(total)}</strong> ${total === 1 ? 'тайтл' : 'тайтлів'}</span>
        <button type="button" class="btn-search-goto-catalog" id="btn-search-modal-apply">Застосувати до каталогу &rarr;</button>
      `;

      const applyBtn = searchModalFooter.querySelector('#btn-search-modal-apply');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          if (searchModal && searchModal.open) searchModal.close();
          navigateTo(VIEWS.CATALOG);
          state.setSearchQuery(query);
          if (searchInput) searchInput.value = query;
          if (searchClearBtn) searchClearBtn.classList.toggle('visible', Boolean(query));
        });
      }
    }
  }

  const debouncedSearchModal = debounce((q) => {
    renderSearchModalResults(q);
    if (getActiveView() === VIEWS.CATALOG) {
      state.setSearchQuery(q);
      if (searchInput) {
        searchInput.value = q;
        if (searchClearBtn) searchClearBtn.classList.toggle('visible', Boolean(q));
      }
    }
  }, 120);

  if (btnSearchMobileTrigger && searchModal) {
    btnSearchMobileTrigger.addEventListener('click', () => {
      searchModal.showModal();
      const currentQuery = state.searchQuery || (searchInput ? searchInput.value : '') || '';
      if (searchModalInput) {
        searchModalInput.value = currentQuery;
        if (searchModalClear) searchModalClear.classList.toggle('visible', Boolean(currentQuery));
        setTimeout(() => searchModalInput.focus(), 60);
      }
      renderSearchModalResults(currentQuery);
    });
  }

  if (searchModalInput) {
    searchModalInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (searchModalClear) searchModalClear.classList.toggle('visible', val.length > 0);
      debouncedSearchModal(val);
    });
  }

  if (searchModalClear) {
    searchModalClear.addEventListener('click', () => {
      if (searchModalInput) {
        searchModalInput.value = '';
        searchModalClear.classList.remove('visible');
        searchModalInput.focus();
      }
      renderSearchModalResults('');
      if (getActiveView() === VIEWS.CATALOG) {
        state.setSearchQuery('');
        if (searchInput) {
          searchInput.value = '';
          if (searchClearBtn) searchClearBtn.classList.remove('visible');
        }
      }
    });
  }

  if (searchModalClose && searchModal) {
    searchModalClose.addEventListener('click', () => {
      searchModal.close();
    });
  }

  if (searchModal) {
    searchModal.addEventListener('click', (e) => {
      if (e.target === searchModal) {
        searchModal.close();
      }
    });
  }

  // Prevent background page scrolling when any modal dialog is open
  function setupModalScrollLock() {
    const checkDialogs = () => {
      const anyOpen = Array.from(document.querySelectorAll('dialog')).some(d => d.open);
      document.documentElement.classList.toggle('modal-open', anyOpen);
      document.body.classList.toggle('modal-open', anyOpen);
    };

    document.querySelectorAll('dialog').forEach(dlg => {
      dlg.addEventListener('close', checkDialogs);
      dlg.addEventListener('cancel', checkDialogs);
    });

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'open') {
          checkDialogs();
        }
      }
    });

    document.querySelectorAll('dialog').forEach(dlg => {
      observer.observe(dlg, { attributes: true, attributeFilter: ['open'] });
    });
  }
  setupModalScrollLock();

  // View Mode: grid vs table
  let currentViewMode = localStorage.getItem('toloka_catalog_view_mode') || 'grid';

  function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('toloka_catalog_view_mode', mode);
    if (btnViewGrid) {
      btnViewGrid.classList.toggle('active', mode === 'grid');
      btnViewGrid.setAttribute('aria-pressed', mode === 'grid' ? 'true' : 'false');
    }
    if (btnViewTable) {
      btnViewTable.classList.toggle('active', mode === 'table');
      btnViewTable.setAttribute('aria-pressed', mode === 'table' ? 'true' : 'false');
    }
    renderCatalogContent(state);
  }

  function renderCatalogContent(appState) {
    if (currentViewMode === 'table') {
      if (catalogGrid) catalogGrid.hidden = true;
      if (catalogTableWrap) {
        catalogTableWrap.hidden = false;
        renderTableView(catalogTableWrap, appState, (item) => openTitleModal(item));
      }
    } else {
      if (catalogTableWrap) catalogTableWrap.hidden = true;
      if (catalogGrid) {
        catalogGrid.hidden = false;
        renderGrid(catalogGrid, appState);
      }
    }
  }

  if (btnViewGrid) btnViewGrid.addEventListener('click', () => setViewMode('grid'));
  if (btnViewTable) btnViewTable.addEventListener('click', () => setViewMode('table'));

  if (btnViewGrid && btnViewTable) {
    btnViewGrid.classList.toggle('active', currentViewMode === 'grid');
    btnViewGrid.setAttribute('aria-pressed', currentViewMode === 'grid' ? 'true' : 'false');
    btnViewTable.classList.toggle('active', currentViewMode === 'table');
    btnViewTable.setAttribute('aria-pressed', currentViewMode === 'table' ? 'true' : 'false');
  }

  // Populate Custom Selectors & Genre Dropdown Filter
  setupCustomSelects(window.TOLOKA_CATALOG.facets);
  setupGenreSelect(window.TOLOKA_CATALOG.facets);

  function syncControlsFromState(appState) {
    if (searchInput) {
      searchInput.value = appState.searchQuery || '';
      searchClearBtn.classList.toggle('visible', Boolean(appState.searchQuery));
    }
    if (btnSearchMobileTrigger) {
      btnSearchMobileTrigger.classList.toggle('has-query', Boolean(appState.searchQuery));
    }
    if (searchModalInput && document.activeElement !== searchModalInput) {
      searchModalInput.value = appState.searchQuery || '';
      if (searchModalClear) {
        searchModalClear.classList.toggle('visible', Boolean(appState.searchQuery));
      }
    }
    if (customSelects['custom-select-year']) {
      customSelects['custom-select-year'].setValue(appState.selectedYear || '');
    }
    if (customSelects['custom-select-quality']) {
      customSelects['custom-select-quality'].setValue(appState.selectedQuality || '');
    }
    if (customSelects['custom-select-team']) {
      customSelects['custom-select-team'].setValue(appState.selectedTeam || '');
    }
    if (customSelects['custom-select-type']) {
      customSelects['custom-select-type'].setValue(appState.selectedType || '');
    }
    if (customSelects['custom-select-sub']) {
      customSelects['custom-select-sub'].setValue(appState.selectedSub || '');
    }
    if (customSelects['custom-select-sort']) {
      customSelects['custom-select-sort'].setValue(appState.sortOrder || 'id_desc');
    }
    syncGenreSelect();
  }

  // Restore initial parameters from URL
  const initialUrlParams = parseCatalogParamsFromUrl();
  state.applyUrlParams(initialUrlParams);
  syncControlsFromState(state);

  // Close custom selects when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select')) {
      closeAllCustomSelects();
    }
  });

  // Escape key closes open dropdown or mobile search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllCustomSelects();
      if (searchContainer) searchContainer.classList.remove('mobile-active');
    }
  });

  // Arrow key navigation for catalog pagination
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const activeDialog = document.querySelector('dialog[open]');
    if (activeDialog) return;

    if (e.key === 'ArrowLeft') {
      if (state.currentPage > 1) {
        e.preventDefault();
        state.setPage(state.currentPage - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowRight') {
      if (state.currentPage < state.getTotalPages()) {
        e.preventDefault();
        state.setPage(state.currentPage + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });

  let isHandlingPopstate = false;

  // Subscribe to State Changes
  state.subscribe((appState, changeType) => {
    if (changeType !== 'page') {
      appState.filteredTitles = filterAndSortTitles(appState.allTitles, appState);
    }

    renderCatalogContent(appState);
    renderPagination(paginationWrapper, appState);
    updateActiveFilters(activeFiltersRow, appState);
    updateHeaderStats(totalCountEl, appState);

    if (!isHandlingPopstate) {
      const useReplace = (changeType === 'search');
      syncUrlWithCatalogState(appState, useReplace);
    }
  });

  // Quick Search Dropdown Elements (for non-catalog views)
  const quickDropdown = document.getElementById('search-quick-dropdown');
  const quickResults = document.getElementById('search-quick-results');
  const quickFooter = document.getElementById('search-quick-footer');
  let selectedQuickIndex = -1;

  function updateQuickActiveItem(items, index) {
    items.forEach((item, idx) => {
      const isSelected = idx === index;
      item.classList.toggle('active', isSelected);
      item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isSelected) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function renderQuickSearch(query) {
    if (!quickDropdown || !quickResults) return;
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      quickDropdown.hidden = true;
      selectedQuickIndex = -1;
      return;
    }

    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    const allTitles = window.TOLOKA_CATALOG?.titles || [];

    const matched = [];
    for (const item of allTitles) {
      const corpus = `${item.title_ua || ''} ${item.title_orig || ''} ${item.raw_title || ''} ${item.director || ''} ${item.studio || ''} ${item.uploader || ''} ${(item.teams || []).join(' ')} ${item.id}`.toLowerCase();
      let match = true;
      for (const t of terms) {
        if (!corpus.includes(t)) {
          match = false;
          break;
        }
      }
      if (match) {
        matched.push(item);
      }
    }

    selectedQuickIndex = -1;

    if (matched.length === 0) {
      quickResults.innerHTML = `<div class="search-quick-empty">Нічого не знайдено за запитом &laquo;${escapeHtml(query)}&raquo;</div>`;
      if (quickFooter) quickFooter.innerHTML = '';
      quickDropdown.hidden = false;
      return;
    }

    const limit = 8;
    const topMatches = matched.slice(0, limit);

    quickResults.innerHTML = topMatches.map((item, idx) => {
      const posterSrc = item.local_poster || item.poster || getSvgPlaceholder(item.title_ua);
      const yearStr = item.year ? `${item.year}` : '';
      const epsStr = item.episodes ? `${item.episodes} сер.` : '';
      const uploaderStr = item.uploader ? escapeHtml(item.uploader) : '';
      const typeStr = item.type === 'movie' ? 'Фільм' : (item.type === 'movie?' ? 'Фільм?' : (item.type === 'ova' ? 'OVA' : (item.type === 'ona' ? 'ONA' : 'Серіал')));

      const metaParts = [typeStr, yearStr, epsStr, uploaderStr].filter(Boolean).map(p => `<span>${p}</span>`).join(' • ');

      return `
        <div class="search-quick-item" data-id="${item.id}" role="option" tabindex="0">
          <img class="search-quick-thumb" src="${escapeHtml(posterSrc)}" alt="${escapeHtml(item.title_ua)}" loading="lazy">
          <div class="search-quick-info">
            <div class="search-quick-title-ua" title="${escapeHtml(item.title_ua)}">${escapeHtml(item.title_ua)}</div>
            ${item.title_orig ? `<div class="search-quick-title-orig">${escapeHtml(item.title_orig)}</div>` : ''}
            <div class="search-quick-meta">${metaParts}</div>
          </div>
          <div class="search-quick-id">#${item.id}</div>
        </div>
      `;
    }).join('');

    // Attach click and hover listeners to items
    const renderedItems = quickResults.querySelectorAll('.search-quick-item');
    renderedItems.forEach((itemEl, idx) => {
      itemEl.addEventListener('mouseenter', () => {
        selectedQuickIndex = idx;
        updateQuickActiveItem(renderedItems, selectedQuickIndex);
      });
      itemEl.addEventListener('click', () => {
        const id = parseInt(itemEl.dataset.id, 10);
        const item = allTitles.find(t => t.id === id);
        if (item) {
          quickDropdown.hidden = true;
          selectedQuickIndex = -1;
          openTitleModal(item);
        }
      });
    });

    if (quickFooter) {
      const total = matched.length;
      quickFooter.innerHTML = `
        <span>Знайдено: ${formatNumber(total)} ${total === 1 ? 'тайтл' : 'тайтлів'}</span>
        <button type="button" class="btn-search-goto-catalog" id="btn-search-goto-catalog">Перейти до каталогу &rarr;</button>
      `;

      const gotoBtn = quickFooter.querySelector('#btn-search-goto-catalog');
      if (gotoBtn) {
        gotoBtn.addEventListener('click', () => {
          quickDropdown.hidden = true;
          selectedQuickIndex = -1;
          navigateTo(VIEWS.CATALOG);
          state.setSearchQuery(query);
        });
      }
    }

    quickDropdown.hidden = false;
  }

  const debouncedQuickSearch = debounce((q) => {
    renderQuickSearch(q);
  }, 120);

  // Search Input Handler (Debounced)
  const handleSearch = debounce((val) => {
    state.setSearchQuery(val);
  }, 120);

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    searchClearBtn.classList.toggle('visible', val.length > 0);

    const activeView = getActiveView();
    if (activeView === VIEWS.CATALOG) {
      if (quickDropdown) quickDropdown.hidden = true;
      selectedQuickIndex = -1;
      handleSearch(val);
    } else {
      debouncedQuickSearch(val);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    const isDropdownVisible = quickDropdown && !quickDropdown.hidden;

    // Arrow keys navigate within quick dropdown results
    if (isDropdownVisible) {
      const items = quickResults.querySelectorAll('.search-quick-item');
      if (items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedQuickIndex = (selectedQuickIndex + 1) % items.length;
          updateQuickActiveItem(items, selectedQuickIndex);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedQuickIndex = (selectedQuickIndex - 1 + items.length) % items.length;
          updateQuickActiveItem(items, selectedQuickIndex);
          return;
        }
      }
    }

    if (e.key === 'Enter') {
      const activeView = getActiveView();
      if (activeView !== VIEWS.CATALOG) {
        e.preventDefault();
        // If an item is highlighted via keyboard, open its modal
        if (isDropdownVisible && selectedQuickIndex >= 0) {
          const items = quickResults.querySelectorAll('.search-quick-item');
          const activeItem = items[selectedQuickIndex];
          if (activeItem) {
            const id = parseInt(activeItem.dataset.id, 10);
            const allTitles = window.TOLOKA_CATALOG?.titles || [];
            const item = allTitles.find(t => t.id === id);
            if (item) {
              quickDropdown.hidden = true;
              selectedQuickIndex = -1;
              openTitleModal(item);
              return;
            }
          }
        }
        // Otherwise switch to catalog view with current search term
        const val = searchInput.value;
        if (quickDropdown) quickDropdown.hidden = true;
        selectedQuickIndex = -1;
        navigateTo(VIEWS.CATALOG);
        state.setSearchQuery(val);
      }
    }
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.classList.remove('visible');
    if (quickDropdown) quickDropdown.hidden = true;
    selectedQuickIndex = -1;
    state.setSearchQuery('');
    searchInput.focus();
  });

  // Close quick dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      if (quickDropdown) {
        quickDropdown.hidden = true;
        selectedQuickIndex = -1;
      }
    }
  });

  // Close quick dropdown on route change
  onRouteChanged(() => {
    if (quickDropdown) {
      quickDropdown.hidden = true;
      selectedQuickIndex = -1;
    }
  });

  // Keyboard shortcut: '/' to focus search, Escape to dismiss
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (quickDropdown && !quickDropdown.hidden) {
        quickDropdown.hidden = true;
        selectedQuickIndex = -1;
      }
    }
  });

  // Handle browser Back / Forward buttons for Catalog view and Title Modal
  window.addEventListener('popstate', () => {
    const urlParams = parseCatalogParamsFromUrl();

    // Synchronize modal state on back/forward
    const titleModalEl = document.getElementById('title-modal');
    if (urlParams.id) {
      const targetItem = window.TOLOKA_CATALOG?.titles?.find(t => t.id === urlParams.id);
      if (targetItem) {
        openTitleModal(targetItem, false);
      }
    } else if (titleModalEl && titleModalEl.open) {
      closeTitleModal();
    }

    if (getActiveView() === VIEWS.CATALOG) {
      const changed = state.applyUrlParams(urlParams);
      if (changed) {
        isHandlingPopstate = true;
        try {
          syncControlsFromState(state);
          state.filteredTitles = filterAndSortTitles(state.allTitles, state);
          const maxPages = state.getTotalPages();
          state.currentPage = Math.max(1, Math.min(state.currentPage, maxPages));
          state.notify();
        } finally {
          isHandlingPopstate = false;
        }
      }
    }
  });

  // Brand Home click handler: resets catalog filters or navigates to catalog
  const btnBrandHome = document.getElementById('btn-brand-home');
  if (btnBrandHome) {
    btnBrandHome.addEventListener('click', () => {
      if (getActiveView() === VIEWS.CATALOG) {
        if (state.getActiveFilterCount() > 0 || state.searchQuery || state.currentPage > 1 || state.sortOrder !== 'id_desc') {
          resetAllFilters();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigateTo(VIEWS.CATALOG);
      }
    });
  }

  // Initial calculation and URL sync
  state.filteredTitles = filterAndSortTitles(state.allTitles, state);
  const initialTotalPages = state.getTotalPages();
  if (state.currentPage > initialTotalPages) {
    state.currentPage = Math.max(1, initialTotalPages);
  }
  syncUrlWithCatalogState(state, true);

  // Initial trigger
  state.notify();

  // If initial URL contains title id, open its modal
  if (initialUrlParams.id) {
    const initialTitle = window.TOLOKA_CATALOG.titles.find(t => t.id === initialUrlParams.id);
    if (initialTitle) {
      openTitleModal(initialTitle, false);
    }
  }
});

/**
 * Creates and initializes custom dropdown components
 */
function setupCustomSelects(facets) {
  // 1. Year Select
  const yearOptions = [
    { value: '', label: 'Усі роки' },
    { value: '2020s', label: '2020-ті роки' },
    { value: '2010s', label: '2010-ті роки' },
    { value: '2000s', label: '2000-ні роки' },
    { value: '1990s', label: '1990-ті роки' },
    { value: 'older', label: 'До 1990 року' },
  ];
  for (const y of facets.years || []) {
    yearOptions.push({ value: String(y), label: `${y} рік` });
  }
  createCustomSelect('custom-select-year', yearOptions, 'selectedYear', (val) => {
    state.setFilter('selectedYear', val);
  });

  // 2. Quality Select
  const qualityOptions = [{ value: '', label: 'Будь-яка якість' }];
  for (const q of facets.qualities || []) {
    qualityOptions.push({ value: q.name, label: q.name, count: q.count });
  }
  createCustomSelect('custom-select-quality', qualityOptions, 'selectedQuality', (val) => {
    state.setFilter('selectedQuality', val);
  });

  // 3. Dubbing Team Select
  const teamOptions = [{ value: '', label: 'Всі команди' }];
  for (const t of facets.top_teams || []) {
    teamOptions.push({ value: t.name, label: t.name, count: t.count });
  }
  createCustomSelect('custom-select-team', teamOptions, 'selectedTeam', (val) => {
    state.setFilter('selectedTeam', val);
  });

  // 4. Content Type Select
  const typeOptions = [
    { value: '', label: 'Усі типи' },
    { value: 'tv', label: 'Серіал (TV)', count: (facets.types?.find(t => t.key === 'tv') || {}).count },
    { value: 'movie', label: 'Фільм (Movie)', count: (facets.types?.find(t => t.key === 'movie') || {}).count },
    { value: 'movie?', label: 'Можливо фільм (movie?)', count: (facets.types?.find(t => t.key === 'movie?') || {}).count },
    { value: 'ova', label: 'OVA / OAV', count: (facets.types?.find(t => t.key === 'ova') || {}).count },
    { value: 'ona', label: 'ONA', count: (facets.types?.find(t => t.key === 'ona') || {}).count },
    { value: 'special', label: 'Спешл (Special)', count: (facets.types?.find(t => t.key === 'special') || {}).count },
  ];
  createCustomSelect('custom-select-type', typeOptions, 'selectedType', (val) => {
    state.setFilter('selectedType', val);
  });

  // 5. Subtitles Select
  const subOptions = [
    { value: '', label: 'Всі релізи' },
    { value: 'with_sub', label: 'З субтитрами (SUB)' },
    { value: 'no_sub', label: 'Без субтитрів' },
  ];
  createCustomSelect('custom-select-sub', subOptions, 'selectedSub', (val) => {
    state.setFilter('selectedSub', val);
  });

  // 6. Sort Select
  const sortOptions = [
    { value: 'id_desc', label: 'Найновіші спочатку' },
    { value: 'year_desc', label: 'Рік: новіші спочатку' },
    { value: 'year_asc', label: 'Рік: старіші спочатку' },
    { value: 'title_asc', label: 'Назва: А–Я' },
    { value: 'episodes_desc', label: 'Кількість серій' },
  ];
  createCustomSelect('custom-select-sort', sortOptions, 'sortOrder', (val) => {
    state.setSortOrder(val);
  });
}

function createCustomSelect(selectId, options, stateKey, onSelect) {
  const container = document.getElementById(selectId);
  if (!container) return;

  const trigger = container.querySelector('.custom-select-trigger');
  const valueSpan = container.querySelector('.custom-select-value');
  const optionsContainer = container.querySelector('.custom-select-options');

  let activeValue = options[0].value;

  // Build options DOM
  let optionsHtml = '';
  for (const opt of options) {
    const isInitial = opt.value === activeValue;
    const countBadge = opt.count !== undefined ? `<span class="option-count">${opt.count}</span>` : '';
    optionsHtml += `
      <div 
        class="custom-select-option ${isInitial ? 'active' : ''}" 
        data-value="${escapeHtml(opt.value)}"
        role="option"
        aria-selected="${isInitial}"
      >
        <span>${escapeHtml(opt.label)}</span>
        ${countBadge}
      </div>
    `;
  }
  optionsContainer.innerHTML = optionsHtml;

  // Toggle trigger
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      container.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Option selection
  optionsContainer.addEventListener('click', (e) => {
    const optEl = e.target.closest('.custom-select-option');
    if (!optEl) return;

    const val = optEl.dataset.value;
    activeValue = val;

    optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
      const isCur = el.dataset.value === val;
      el.classList.toggle('active', isCur);
      el.setAttribute('aria-selected', isCur);
    });

    const matched = options.find(o => o.value === val);
    valueSpan.textContent = matched ? matched.label : val;

    container.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');

    onSelect(val);
  });

  customSelects[selectId] = {
    reset: () => {
      activeValue = options[0].value;
      valueSpan.textContent = options[0].label;
      optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
        const isDefault = el.dataset.value === activeValue;
        el.classList.toggle('active', isDefault);
        el.setAttribute('aria-selected', isDefault);
      });
    },
    setValue: (val) => {
      activeValue = val;
      const matched = options.find(o => o.value === val);
      valueSpan.textContent = matched ? matched.label : (val || options[0].label);
      optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
        const isCur = el.dataset.value === val;
        el.classList.toggle('active', isCur);
        el.setAttribute('aria-selected', isCur);
      });
    }
  };
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select.open').forEach(sel => {
    sel.classList.remove('open');
    const trigger = sel.querySelector('.custom-select-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  });
}

/**
 * Multi-Select Genre Dropdown Component with Include & Exclude capabilities
 */
let genreOptionsCache = [];

function setupGenreSelect(facets) {
  const container = document.getElementById('custom-select-genres');
  if (!container) return;

  const trigger = container.querySelector('.custom-select-trigger');
  const valueSpan = container.querySelector('.custom-select-value');
  const optionsContainer = document.getElementById('options-genres');
  const searchInput = document.getElementById('genre-search-filter');
  const resetBtn = document.getElementById('btn-genre-reset-all');

  genreOptionsCache = facets.genres || [];

  function renderGenreItems() {
    if (!optionsContainer) return;
    let html = '';
    for (const g of genreOptionsCache) {
      const gLower = g.name.trim().toLowerCase();
      const isInc = state.selectedGenres.has(gLower);
      const isExcl = state.excludedGenres.has(gLower);
      const statusClass = isInc ? 'is-included' : (isExcl ? 'is-excluded' : '');

      html += `
        <div class="genre-select-row ${statusClass}" data-genre="${escapeHtml(g.name)}" role="option">
          <div class="genre-row-main">
            <span class="genre-row-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>
            <span class="genre-row-count">${g.count}</span>
          </div>
          <div class="genre-row-actions">
            <button type="button" class="btn-genre-action btn-genre-include" data-action="include" title="Включити (+) ${escapeHtml(g.name)}" aria-label="Включити ${escapeHtml(g.name)}">
              +
            </button>
            <button type="button" class="btn-genre-action btn-genre-exclude" data-action="exclude" title="Виключити (−) ${escapeHtml(g.name)}" aria-label="Виключити ${escapeHtml(g.name)}">
              −
            </button>
          </div>
        </div>
      `;
    }
    optionsContainer.innerHTML = html;
  }

  renderGenreItems();
  updateGenreTriggerText();

  // Toggle trigger open/close
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      container.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      if (searchInput) {
        searchInput.value = '';
        filterGenreRows('');
        setTimeout(() => searchInput.focus(), 60);
      }
    }
  });

  // Filter input typing
  function filterGenreRows(query) {
    if (!optionsContainer) return;
    const clean = (query || '').trim().toLowerCase();
    optionsContainer.querySelectorAll('.genre-select-row').forEach(row => {
      const name = (row.dataset.genre || '').toLowerCase();
      row.style.display = (!clean || name.includes(clean)) ? '' : 'none';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterGenreRows(e.target.value);
    });
    searchInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Row & action buttons clicking
  optionsContainer.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.btn-genre-action');
    const row = e.target.closest('.genre-select-row');
    if (!row) return;

    const genre = row.dataset.genre;
    if (!genre) return;

    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      if (action === 'include') {
        state.toggleGenreInclude(genre);
      } else if (action === 'exclude') {
        state.toggleGenreExclude(genre);
      }
    } else {
      state.toggleGenreInclude(genre);
    }

    syncGenreSelect();
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.clearGenres();
      syncGenreSelect();
    });
  }

  customSelects['custom-select-genres'] = {
    reset: () => {
      state.clearGenres();
      syncGenreSelect();
    },
    setValue: () => {
      syncGenreSelect();
    }
  };
}

function updateGenreTriggerText() {
  const container = document.getElementById('custom-select-genres');
  if (!container) return;
  const valueSpan = container.querySelector('.custom-select-value');
  if (!valueSpan) return;

  const incCount = state.selectedGenres.size;
  const exclCount = state.excludedGenres.size;

  if (incCount === 0 && exclCount === 0) {
    valueSpan.textContent = 'Всі жанри';
  } else {
    let badges = '<span class="genre-trigger-badges">';
    if (incCount > 0) {
      badges += `<span class="genre-badge-inc">+${incCount}</span>`;
    }
    if (exclCount > 0) {
      badges += `<span class="genre-badge-excl">−${exclCount}</span>`;
    }
    badges += '</span>';
    valueSpan.innerHTML = badges + '<span class="genre-trigger-text">Жанри</span>';
  }
}

function syncGenreSelect() {
  const optionsContainer = document.getElementById('options-genres');
  if (optionsContainer) {
    optionsContainer.querySelectorAll('.genre-select-row').forEach(row => {
      const gLower = (row.dataset.genre || '').trim().toLowerCase();
      const isInc = state.selectedGenres.has(gLower);
      const isExcl = state.excludedGenres.has(gLower);
      row.classList.toggle('is-included', isInc);
      row.classList.toggle('is-excluded', isExcl);
    });
  }
  updateGenreTriggerText();
}

/**
 * Render Cards Grid
 */
function renderGrid(container, appState) {
  container.innerHTML = '';
  const items = appState.getCurrentPageItems();

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3>Нічого не знайдено</h3>
        <p>За вибраними фільтрами немає результатів. Спробуйте змінити або скинути параметри.</p>
        <button class="btn btn-primary" id="btn-empty-reset">Скинути всі фільтри</button>
      </div>
    `;

    const resetBtn = container.querySelector('#btn-empty-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => resetAllFilters());
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const cardNode = renderTitleCard(item);
    cardNode.addEventListener('click', () => {
      openTitleModal(item);
    });
    fragment.appendChild(cardNode);
  }

  container.appendChild(fragment);
}

/**
 * Update Active Filters Row
 * - NO search query chip
 * - Genres shown as a SINGLE count chip: "Жанри (N)"
 */
function updateActiveFilters(container, appState) {
  const activeChips = [];

  // 1. Included Genres chips
  if (appState.selectedGenres.size > 0) {
    for (const g of appState.selectedGenres) {
      activeChips.push({
        type: 'positive',
        label: `+ ${g}`,
        clear: () => {
          appState.removeGenre(g);
          syncGenreSelect();
        }
      });
    }
  }

  // 1b. Excluded Genres chips
  if (appState.excludedGenres.size > 0) {
    for (const g of appState.excludedGenres) {
      activeChips.push({
        type: 'negative',
        label: `− ${g}`,
        clear: () => {
          appState.removeGenre(g);
          syncGenreSelect();
        }
      });
    }
  }

  // 2. Year chip
  if (appState.selectedYear) {
    activeChips.push({
      label: `Рік: ${appState.selectedYear}`,
      clear: () => {
        appState.setFilter('selectedYear', '');
        if (customSelects['custom-select-year']) customSelects['custom-select-year'].setValue('');
      }
    });
  }

  // 3. Quality chip
  if (appState.selectedQuality) {
    activeChips.push({
      label: `Якість: ${appState.selectedQuality}`,
      clear: () => {
        appState.setFilter('selectedQuality', '');
        if (customSelects['custom-select-quality']) customSelects['custom-select-quality'].setValue('');
      }
    });
  }

  // 4. Team chip
  if (appState.selectedTeam) {
    activeChips.push({
      label: `Озвучка: ${appState.selectedTeam}`,
      clear: () => {
        appState.setFilter('selectedTeam', '');
        if (customSelects['custom-select-team']) customSelects['custom-select-team'].setValue('');
      }
    });
  }

  // 5. Type chip
  if (appState.selectedType) {
    const typeNames = {
      tv: 'Серіал (TV)',
      movie: 'Фільм (Movie)',
      'movie?': 'Можливо фільм (movie?)',
      ova: 'OVA / OAV',
      ona: 'ONA',
      special: 'Спешл'
    };
    activeChips.push({
      label: `Тип: ${typeNames[appState.selectedType] || appState.selectedType}`,
      clear: () => {
        appState.setFilter('selectedType', '');
        if (customSelects['custom-select-type']) customSelects['custom-select-type'].setValue('');
      }
    });
  }

  // 6. Subtitles chip
  if (appState.selectedSub) {
    activeChips.push({
      label: appState.selectedSub === 'with_sub' ? 'З субтитрами (SUB)' : 'Без субтитрів',
      clear: () => {
        appState.setFilter('selectedSub', '');
        if (customSelects['custom-select-sub']) customSelects['custom-select-sub'].setValue('');
      }
    });
  }

  // Update mobile filter active counter badge
  const filterActiveBadge = document.getElementById('filter-active-count');
  if (filterActiveBadge) {
    let totalFilterCount = 0;
    if (appState.selectedGenres.size > 0) totalFilterCount += appState.selectedGenres.size;
    if (appState.excludedGenres.size > 0) totalFilterCount += appState.excludedGenres.size;
    if (appState.selectedYear) totalFilterCount++;
    if (appState.selectedQuality) totalFilterCount++;
    if (appState.selectedTeam) totalFilterCount++;
    if (appState.selectedType) totalFilterCount++;
    if (appState.selectedSub) totalFilterCount++;

    if (totalFilterCount > 0) {
      filterActiveBadge.textContent = totalFilterCount;
      filterActiveBadge.hidden = false;
    } else {
      filterActiveBadge.hidden = true;
    }
  }

  if (activeChips.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = `<span class="active-filters-label">Активні фільтри:</span>`;
  activeChips.forEach((chip, idx) => {
    const chipClass = chip.type === 'negative' ? 'active-filter-chip chip-negative' : 'active-filter-chip';
    html += `
      <span class="${chipClass}">
        ${escapeHtml(chip.label)}
        <button data-chip-idx="${idx}" aria-label="Видалити фільтр">✕</button>
      </span>
    `;
  });
  html += `<button class="btn-reset-filters" id="btn-reset-all">Скинути всі</button>`;

  container.innerHTML = html;

  // Add click listeners to remove individual chips
  activeChips.forEach((chip, idx) => {
    const btn = container.querySelector(`button[data-chip-idx="${idx}"]`);
    if (btn) {
      btn.addEventListener('click', chip.clear);
    }
  });

  const resetAllBtn = container.querySelector('#btn-reset-all');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', resetAllFilters);
  }
}

function resetAllFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear-btn').classList.remove('visible');
  const btnSearchMobileTrigger = document.getElementById('btn-search-mobile-trigger');
  if (btnSearchMobileTrigger) btnSearchMobileTrigger.classList.remove('has-query');
  const searchModalInput = document.getElementById('search-modal-input');
  if (searchModalInput) searchModalInput.value = '';
  const searchModalClear = document.getElementById('search-modal-clear');
  if (searchModalClear) searchModalClear.classList.remove('visible');
  
  for (const selId in customSelects) {
    customSelects[selId].reset();
  }

  syncGenreSelect();
  state.resetFilters();
}
window.resetAllCatalogFilters = resetAllFilters;

function updateHeaderStats(countEl, appState) {
  if (countEl) {
    countEl.textContent = formatNumber(appState.filteredTitles.length);
  }
}
