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
import { initHomeView, renderHomeStats } from './components/homeView.js';
import { initSearchModal } from './components/searchModal.js';
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
let searchModalComponent = null;

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

  // Initialize Home View
  initHomeView({ onGoCatalog: () => navigateTo(VIEWS.CATALOG) });

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
  const catalogSearchInput = document.getElementById('catalog-search-input');
  const catalogSearchClear = document.getElementById('catalog-search-clear');
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

  // Search Modal Dialog Component
  searchModalComponent = initSearchModal({
    onSelectTitle: (item) => openTitleModal(item),
    onApplyQuery: (query) => {
      navigateTo(VIEWS.CATALOG);
      state.setSearchQuery(query);
      if (catalogSearchInput) catalogSearchInput.value = query;
      if (catalogSearchClear) catalogSearchClear.classList.toggle('visible', Boolean(query));
    },
    getCurrentQuery: () => state.searchQuery || (catalogSearchInput ? catalogSearchInput.value : '') || '',
  });

  // Header Center Navigation
  const btnNavHome = document.getElementById('btn-nav-home');
  const btnNavCatalog = document.getElementById('btn-nav-catalog');

  if (btnNavHome) btnNavHome.addEventListener('click', () => navigateTo(VIEWS.HOME));
  if (btnNavCatalog) btnNavCatalog.addEventListener('click', () => navigateTo(VIEWS.CATALOG));

  // Catalog Inline Search (filters catalog grid directly)
  const handleCatalogSearch = debounce((val) => {
    state.setSearchQuery(val);
  }, 120);

  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (catalogSearchClear) catalogSearchClear.classList.toggle('visible', val.length > 0);
      handleCatalogSearch(val);
    });
  }

  if (catalogSearchClear) {
    catalogSearchClear.addEventListener('click', () => {
      if (catalogSearchInput) {
        catalogSearchInput.value = '';
        catalogSearchClear.classList.remove('visible');
        catalogSearchInput.focus();
      }
      state.setSearchQuery('');
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

  // Populate Custom Selectors, Year Select, Genre Select & Sort Control
  setupCustomSelects(window.TOLOKA_CATALOG.facets);
  setupYearSelect(window.TOLOKA_CATALOG.facets);
  setupGenreSelect(window.TOLOKA_CATALOG.facets);
  setupSortControl();

  function syncControlsFromState(appState) {
    if (catalogSearchInput) {
      catalogSearchInput.value = appState.searchQuery || '';
      if (catalogSearchClear) {
        catalogSearchClear.classList.toggle('visible', Boolean(appState.searchQuery));
      }
    }
    searchModalComponent?.syncQuery(appState.searchQuery);
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

  // Route change listener to update header nav & load home statistics
  onRouteChanged((view) => {
    if (btnNavHome) btnNavHome.classList.toggle('active', view === VIEWS.HOME);
    if (btnNavCatalog) btnNavCatalog.classList.toggle('active', view === VIEWS.CATALOG);
    if (view === VIEWS.HOME) {
      renderHomeStats();
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

  // Brand Home click handler: navigates to home view
  const btnBrandHome = document.getElementById('btn-brand-home');
  if (btnBrandHome) {
    btnBrandHome.addEventListener('click', () => {
      navigateTo(VIEWS.HOME);
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

  // Initial nav state & stats
  const initialView = getActiveView();
  if (btnNavHome) btnNavHome.classList.toggle('active', initialView === VIEWS.HOME);
  if (btnNavCatalog) btnNavCatalog.classList.toggle('active', initialView === VIEWS.CATALOG);
  if (initialView === VIEWS.HOME) {
    renderHomeStats();
  }

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
  // 1. Quality Select
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
  const sortWrapper = document.getElementById('sort-control-wrapper');
  if (sortWrapper) sortWrapper.classList.remove('open');
}

/**
 * Dedicated Year Selector with Manual Year Input and Decades
 */
function setupYearSelect(facets) {
  const container = document.getElementById('custom-select-year');
  if (!container) return;

  const trigger = container.querySelector('.custom-select-trigger');
  const valueSpan = container.querySelector('.custom-select-value');
  const optionsContainer = document.getElementById('options-year');
  const manualInput = document.getElementById('year-manual-input');
  const manualClear = document.getElementById('year-manual-clear');
  const applyBtn = document.getElementById('btn-year-apply');

  const decadeOptions = [
    { value: '', label: 'Усі роки' },
    { value: '2020s', label: '2020-ті роки' },
    { value: '2010s', label: '2010-ті роки' },
    { value: '2000s', label: '2000-ні роки' },
    { value: '1990s', label: '1990-ті роки' },
    { value: 'older', label: 'До 1990 року' },
  ];

  // Render decade options
  if (optionsContainer) {
    optionsContainer.innerHTML = decadeOptions.map(opt => `
      <div 
        class="custom-select-option ${opt.value === '' ? 'active' : ''}" 
        data-value="${escapeHtml(opt.value)}"
        role="option"
        aria-selected="${opt.value === ''}"
      >
        <span>${escapeHtml(opt.label)}</span>
      </div>
    `).join('');
  }

  function updateYearUI(val) {
    const currentVal = (val || '').trim();
    const matchedDecade = decadeOptions.find(o => o.value === currentVal);

    if (matchedDecade) {
      if (manualInput) manualInput.value = '';
      if (manualClear) manualClear.hidden = true;
      if (valueSpan) valueSpan.textContent = matchedDecade.label;
      if (optionsContainer) {
        optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
          const isCur = el.dataset.value === currentVal;
          el.classList.toggle('active', isCur);
          el.setAttribute('aria-selected', isCur ? 'true' : 'false');
        });
      }
    } else if (currentVal) {
      if (manualInput) manualInput.value = currentVal;
      if (manualClear) manualClear.hidden = false;
      if (valueSpan) valueSpan.textContent = `${currentVal} рік`;
      if (optionsContainer) {
        optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
          el.classList.remove('active');
          el.setAttribute('aria-selected', 'false');
        });
      }
    } else {
      if (manualInput) manualInput.value = '';
      if (manualClear) manualClear.hidden = true;
      if (valueSpan) valueSpan.textContent = 'Усі роки';
      if (optionsContainer) {
        optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
          const isDefault = el.dataset.value === '';
          el.classList.toggle('active', isDefault);
          el.setAttribute('aria-selected', isDefault ? 'true' : 'false');
        });
      }
    }
  }

  function applyYearValue(val, closeDropdown = false) {
    const clean = (val || '').trim();
    if (!clean) {
      state.setFilter('selectedYear', '');
      updateYearUI('');
    } else {
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num >= 1950 && num <= 2035) {
        state.setFilter('selectedYear', String(num));
        updateYearUI(String(num));
      }
    }
    if (closeDropdown) {
      container.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  }

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      container.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      if (manualInput) {
        setTimeout(() => manualInput.focus(), 60);
      }
    }
  });

  // Decade selection click
  if (optionsContainer) {
    optionsContainer.addEventListener('click', (e) => {
      const optEl = e.target.closest('.custom-select-option');
      if (!optEl) return;
      const val = optEl.dataset.value;
      updateYearUI(val);
      container.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      state.setFilter('selectedYear', val);
    });
  }

  // Manual input events
  if (manualInput) {
    manualInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (manualClear) manualClear.hidden = !val;
      const num = parseInt(val, 10);
      if (val.length === 4 && !isNaN(num) && num >= 1950 && num <= 2035) {
        applyYearValue(val, false);
      }
    });

    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyYearValue(manualInput.value, true);
      }
    });
  }

  if (manualClear) {
    manualClear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (manualInput) manualInput.value = '';
      manualClear.hidden = true;
      applyYearValue('', false);
      if (manualInput) manualInput.focus();
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyYearValue(manualInput ? manualInput.value : '', true);
    });
  }

  customSelects['custom-select-year'] = {
    reset: () => {
      updateYearUI('');
    },
    setValue: (val) => {
      updateYearUI(val || '');
    }
  };
}

/**
 * Dedicated Sort Control with Field Selection & Direction Toggle Button
 */
function setupSortControl() {
  const container = document.getElementById('custom-select-sort');
  const btnDirection = document.getElementById('btn-sort-direction');
  const wrapper = document.getElementById('sort-control-wrapper');
  if (!container) return;

  const trigger = container.querySelector('.custom-select-trigger');
  const valueSpan = container.querySelector('.custom-select-value');
  const optionsContainer = document.getElementById('options-sort');

  const sortFields = [
    { value: 'id', label: 'За датою додавання' },
    { value: 'year', label: 'Рік виходу' },
    { value: 'title', label: 'Назва' },
    { value: 'episodes', label: 'Кількість серій' },
  ];

  let currentField = 'id';
  let currentDirection = 'desc';

  function parseSortString(str) {
    const parts = (str || 'id_desc').split('_');
    const field = ['id', 'year', 'title', 'episodes'].includes(parts[0]) ? parts[0] : 'id';
    const dir = parts[1] === 'asc' ? 'asc' : 'desc';
    return { field, dir };
  }

  function renderOptions() {
    if (!optionsContainer) return;
    optionsContainer.innerHTML = sortFields.map(opt => `
      <div 
        class="custom-select-option ${opt.value === currentField ? 'active' : ''}" 
        data-value="${escapeHtml(opt.value)}"
        role="option"
        aria-selected="${opt.value === currentField}"
      >
        <span>${escapeHtml(opt.label)}</span>
      </div>
    `).join('');
  }

  function getDirectionTooltip(field, dir) {
    if (field === 'title') {
      return dir === 'asc' 
        ? 'А → Я (натисніть для Я → А)' 
        : 'Я → А (натисніть для А → Я)';
    }
    return dir === 'desc' 
      ? 'За спаданням (натисніть для зростання)' 
      : 'За зростанням (натисніть для спадання)';
  }

  function updateSortUI(field, dir) {
    currentField = field;
    currentDirection = dir;

    const matched = sortFields.find(f => f.value === field) || sortFields[0];
    if (valueSpan) valueSpan.textContent = matched.label;

    if (optionsContainer) {
      optionsContainer.querySelectorAll('.custom-select-option').forEach(el => {
        const isCur = el.dataset.value === field;
        el.classList.toggle('active', isCur);
        el.setAttribute('aria-selected', isCur ? 'true' : 'false');
      });
    }

    if (btnDirection) {
      const isAsc = (dir === 'asc');
      btnDirection.classList.toggle('is-asc', isAsc);
      const tip = getDirectionTooltip(field, dir);
      btnDirection.setAttribute('title', tip);
      btnDirection.setAttribute('aria-label', tip);
      btnDirection.setAttribute('aria-pressed', isAsc ? 'true' : 'false');
    }
  }

  // Populate options
  renderOptions();

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.contains('open');
    closeAllCustomSelects();
    if (!isOpen) {
      container.classList.add('open');
      if (wrapper) wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Select option click
  if (optionsContainer) {
    optionsContainer.addEventListener('click', (e) => {
      const optEl = e.target.closest('.custom-select-option');
      if (!optEl) return;
      const newField = optEl.dataset.value;
      container.classList.remove('open');
      if (wrapper) wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');

      // If switching to title, default to 'asc' unless already specified
      let newDir = currentDirection;
      if (newField === 'title' && currentField !== 'title') {
        newDir = 'asc';
      } else if (newField !== 'title' && currentField === 'title' && newDir === 'asc') {
        newDir = 'desc';
      }

      updateSortUI(newField, newDir);
      state.setSortOrder(`${newField}_${newDir}`);
    });
  }

  // Toggle Direction button click
  if (btnDirection) {
    btnDirection.addEventListener('click', (e) => {
      e.stopPropagation();
      const newDir = (currentDirection === 'desc') ? 'asc' : 'desc';
      updateSortUI(currentField, newDir);
      state.setSortOrder(`${currentField}_${newDir}`);
    });
  }

  customSelects['custom-select-sort'] = {
    reset: () => {
      updateSortUI('id', 'desc');
    },
    setValue: (val) => {
      const parsed = parseSortString(val);
      updateSortUI(parsed.field, parsed.dir);
    }
  };
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
    const yearLabels = {
      '2020s': '2020-ті роки',
      '2010s': '2010-ті роки',
      '2000s': '2000-ні роки',
      '1990s': '1990-ті роки',
      'older': 'До 1990 року'
    };
    const displayYear = yearLabels[appState.selectedYear] || `${appState.selectedYear} р.`;
    activeChips.push({
      label: `Рік: ${displayYear}`,
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
  const catalogSearchInput = document.getElementById('catalog-search-input');
  if (catalogSearchInput) catalogSearchInput.value = '';
  const catalogSearchClear = document.getElementById('catalog-search-clear');
  if (catalogSearchClear) catalogSearchClear.classList.remove('visible');

  searchModalComponent?.reset();
  
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
