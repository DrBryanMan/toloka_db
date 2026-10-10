/**
 * Application Hash/URL Router
 * Handles navigation and URL synchronization between Catalog, Parser, and VOC Sync views.
 */

export const VIEWS = {
  CATALOG: 'catalog',
  PARSER: 'parser',
  VOC_SYNC: 'voc-sync',
  EXT_SYNC: 'ext-sync',
  POSTERS: 'posters',
  INCOMPLETE: 'incomplete'
};

const listeners = [];

/**
 * Extracts active view identifier from window.location (hash or search param)
 */
export function getActiveView() {
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  if (hash === 'parser' || hash === 'tools/parser') return VIEWS.PARSER;
  if (hash === 'voc-sync' || hash === 'tools/voc-sync') return VIEWS.VOC_SYNC;
  if (hash === 'ext-sync' || hash === 'tools/ext-sync' || hash === 'db-sync') return VIEWS.EXT_SYNC;
  if (hash === 'posters' || hash === 'tools/posters') return VIEWS.POSTERS;
  if (hash === 'incomplete' || hash === 'tools/incomplete') return VIEWS.INCOMPLETE;

  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view')?.toLowerCase();
  if (viewParam === 'parser') return VIEWS.PARSER;
  if (viewParam === 'voc-sync') return VIEWS.VOC_SYNC;
  if (viewParam === 'ext-sync' || viewParam === 'db-sync') return VIEWS.EXT_SYNC;
  if (viewParam === 'posters') return VIEWS.POSTERS;
  if (viewParam === 'incomplete') return VIEWS.INCOMPLETE;

  return VIEWS.CATALOG;
}

/**
 * Programmatically changes view and updates URL hash
 */
export function navigateTo(view) {
  if (view === VIEWS.PARSER) {
    if (window.location.hash !== '#parser') {
      window.location.hash = '#parser';
    } else {
      renderRoute(VIEWS.PARSER);
    }
  } else if (view === VIEWS.VOC_SYNC) {
    if (window.location.hash !== '#voc-sync') {
      window.location.hash = '#voc-sync';
    } else {
      renderRoute(VIEWS.VOC_SYNC);
    }
  } else if (view === VIEWS.EXT_SYNC) {
    if (window.location.hash !== '#ext-sync') {
      window.location.hash = '#ext-sync';
    } else {
      renderRoute(VIEWS.EXT_SYNC);
    }
  } else if (view === VIEWS.POSTERS) {
    if (window.location.hash !== '#posters') {
      window.location.hash = '#posters';
    } else {
      renderRoute(VIEWS.POSTERS);
    }
  } else if (view === VIEWS.INCOMPLETE) {
    if (window.location.hash !== '#incomplete') {
      window.location.hash = '#incomplete';
    } else {
      renderRoute(VIEWS.INCOMPLETE);
    }
  } else {
    if (window.location.hash) {
      const targetUrl = window.location.pathname + window.location.search;
      history.pushState(null, '', targetUrl);
    }
    renderRoute(VIEWS.CATALOG);
  }
}

/**
 * Parses catalog parameters (search, filters, pagination, sort) from URL
 */
export function parseCatalogParamsFromUrl() {
  const params = new URLSearchParams(window.location.search);

  // If hash contains a query string (e.g. #/?search=... or #?search=...), support that as well
  if (window.location.hash.includes('?')) {
    const hashQuery = window.location.hash.split('?')[1];
    const hashParams = new URLSearchParams(hashQuery);
    for (const [k, v] of hashParams.entries()) {
      if (!params.has(k)) {
        params.set(k, v);
      }
    }
  }

  const result = {
    search: (params.get('search') || params.get('q') || '').trim(),
    genres: new Set(),
    excludedGenres: new Set(),
    year: (params.get('year') || '').trim(),
    quality: (params.get('quality') || '').trim(),
    team: (params.get('team') || '').trim(),
    type: (params.get('type') || '').trim().toLowerCase(),
    sub: (params.get('sub') || '').trim(),
    sort: (params.get('sort') || params.get('sort_by') || 'id_desc').trim(),
    page: 1
  };

  const rawGenres = params.get('genres') || params.get('genre') || '';
  if (rawGenres) {
    const list = rawGenres.split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
    for (const g of list) {
      if (g.startsWith('-') || g.startsWith('!')) {
        const cleanG = g.slice(1).trim();
        if (cleanG) result.excludedGenres.add(cleanG);
      } else {
        const cleanG = g.startsWith('+') ? g.slice(1).trim() : g;
        if (cleanG) result.genres.add(cleanG);
      }
    }
  }

  const rawExclGenres = params.get('exclude_genres') || params.get('excluded_genres') || '';
  if (rawExclGenres) {
    const exclList = rawExclGenres.split(',').map(g => g.trim().toLowerCase()).filter(Boolean);
    for (const g of exclList) {
      result.excludedGenres.add(g);
    }
  }

  const pageVal = parseInt(params.get('page'), 10);
  if (!isNaN(pageVal) && pageVal > 1) {
    result.page = pageVal;
  }

  const idRaw = params.get('id') || params.get('title');
  if (idRaw) {
    const parsedId = parseInt(idRaw, 10);
    if (!isNaN(parsedId) && parsedId > 0) {
      result.id = parsedId;
    }
  }

  return result;
}

/**
 * Builds query string from appState parameters
 */
export function buildCatalogQueryString(appState, activeTitleId = null) {
  const params = new URLSearchParams();

  if (appState.searchQuery && appState.searchQuery.trim()) {
    params.set('search', appState.searchQuery.trim());
  }

  if (appState.selectedGenres && appState.selectedGenres.size > 0) {
    params.set('genres', Array.from(appState.selectedGenres).join(','));
  }

  if (appState.excludedGenres && appState.excludedGenres.size > 0) {
    params.set('exclude_genres', Array.from(appState.excludedGenres).join(','));
  }

  if (appState.selectedYear) {
    params.set('year', appState.selectedYear);
  }

  if (appState.selectedQuality) {
    params.set('quality', appState.selectedQuality);
  }

  if (appState.selectedTeam) {
    params.set('team', appState.selectedTeam);
  }

  if (appState.selectedType) {
    params.set('type', appState.selectedType);
  }

  if (appState.selectedSub) {
    params.set('sub', appState.selectedSub);
  }

  if (appState.sortOrder && appState.sortOrder !== 'id_desc') {
    params.set('sort', appState.sortOrder);
  }

  if (appState.currentPage && appState.currentPage > 1) {
    params.set('page', String(appState.currentPage));
  }

  // Preserve title id if modal is active or specified
  if (activeTitleId) {
    params.set('id', String(activeTitleId));
  } else {
    const currentParams = new URLSearchParams(window.location.search);
    const existingId = currentParams.get('id') || currentParams.get('title');
    if (existingId) {
      params.set('id', existingId);
    }
  }

  return params.toString();
}

/**
 * Synchronizes browser URL with current catalog state
 */
export function syncUrlWithCatalogState(appState, replace = false) {
  if (getActiveView() !== VIEWS.CATALOG) return;

  const queryString = buildCatalogQueryString(appState);
  const targetUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
  const currentFullUrl = window.location.pathname + window.location.search;

  if (targetUrl !== currentFullUrl) {
    if (replace) {
      history.replaceState(null, '', targetUrl);
    } else {
      history.pushState(null, '', targetUrl);
    }
  }
}

/**
 * Registers a callback for view transitions
 */
export function onRouteChanged(fn) {
  listeners.push(fn);
}

/**
 * Switches DOM view containers and notifies subscribers
 */
function renderRoute(view) {
  const catalogView = document.getElementById('catalog-view');
  const parserView = document.getElementById('parser-view');
  const vocSyncView = document.getElementById('voc-sync-view');
  const extSyncView = document.getElementById('ext-sync-view');
  const postersView = document.getElementById('posters-view');
  const incompleteView = document.getElementById('incomplete-view');
  const toolsDropdown = document.getElementById('header-tools-dropdown');

  if (catalogView) catalogView.hidden = (view !== VIEWS.CATALOG);
  if (parserView) parserView.hidden = (view !== VIEWS.PARSER);
  if (vocSyncView) vocSyncView.hidden = (view !== VIEWS.VOC_SYNC);
  if (extSyncView) extSyncView.hidden = (view !== VIEWS.EXT_SYNC);
  if (postersView) postersView.hidden = (view !== VIEWS.POSTERS);
  if (incompleteView) incompleteView.hidden = (view !== VIEWS.INCOMPLETE);

  if (toolsDropdown) {
    toolsDropdown.classList.remove('open');
    const trigger = document.getElementById('btn-tools-trigger');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  for (const fn of listeners) {
    try {
      fn(view);
    } catch (e) {
      console.error('Route listener error:', e);
    }
  }
}

/**
 * Initializes router event listeners and renders initial URL view
 */
export function initRouter() {
  window.addEventListener('hashchange', () => {
    renderRoute(getActiveView());
  });

  window.addEventListener('popstate', () => {
    renderRoute(getActiveView());
  });

  // Render current view according to URL upon initialization
  renderRoute(getActiveView());
}
