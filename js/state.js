/**
 * Central State Management
 */

class AppState {
  constructor() {
    this.searchQuery = '';
    this.selectedGenres = new Set();
    this.excludedGenres = new Set();
    this.selectedYear = '';
    this.selectedQuality = '';
    this.selectedTeam = '';
    this.selectedType = '';
    this.selectedSub = '';
    this.sortOrder = 'id_desc';
    this.currentPage = 1;
    this.pageSize = 48;

    this.allTitles = [];
    this.filteredTitles = [];
    this.facets = {};
    this.listeners = new Set();
  }

  init(catalogData) {
    this.allTitles = catalogData.titles || [];
    this.facets = catalogData.facets || {};
    this.filteredTitles = [...this.allTitles];
    this.notify();
  }

  toggleGenreInclude(genre) {
    const gNorm = (genre || '').trim().toLowerCase();
    if (!gNorm) return;

    this.excludedGenres.delete(gNorm);
    if (this.selectedGenres.has(gNorm)) {
      this.selectedGenres.delete(gNorm);
    } else {
      this.selectedGenres.add(gNorm);
    }
    this.currentPage = 1;
    this.notify('genre');
  }

  toggleGenreExclude(genre) {
    const gNorm = (genre || '').trim().toLowerCase();
    if (!gNorm) return;

    this.selectedGenres.delete(gNorm);
    if (this.excludedGenres.has(gNorm)) {
      this.excludedGenres.delete(gNorm);
    } else {
      this.excludedGenres.add(gNorm);
    }
    this.currentPage = 1;
    this.notify('genre');
  }

  setGenreState(genre, stateValue) {
    const gNorm = (genre || '').trim().toLowerCase();
    if (!gNorm) return;

    this.selectedGenres.delete(gNorm);
    this.excludedGenres.delete(gNorm);

    if (stateValue === 'include') {
      this.selectedGenres.add(gNorm);
    } else if (stateValue === 'exclude') {
      this.excludedGenres.add(gNorm);
    }
    this.currentPage = 1;
    this.notify('genre');
  }

  removeGenre(genre) {
    const gNorm = (genre || '').trim().toLowerCase();
    const removed = this.selectedGenres.delete(gNorm) || this.excludedGenres.delete(gNorm);
    if (removed) {
      this.currentPage = 1;
      this.notify('genre');
    }
  }

  clearGenres() {
    if (this.selectedGenres.size > 0 || this.excludedGenres.size > 0) {
      this.selectedGenres.clear();
      this.excludedGenres.clear();
      this.currentPage = 1;
      this.notify('genre');
    }
  }

  setFilter(key, value) {
    if (this[key] === value) return;
    this[key] = value;
    this.currentPage = 1; // Reset to first page upon filtering
    this.notify('filter');
  }

  setSearchQuery(query) {
    if (this.searchQuery === query) return;
    this.searchQuery = query;
    this.currentPage = 1;
    this.notify('search');
  }

  setSortOrder(sort) {
    if (this.sortOrder === sort) return;
    this.sortOrder = sort;
    this.currentPage = 1;
    this.notify('sort');
  }

  setPage(page) {
    const totalPages = this.getTotalPages();
    const targetPage = Math.max(1, Math.min(page, totalPages));
    if (this.currentPage === targetPage) return;
    this.currentPage = targetPage;
    this.notify('page');
  }

  resetFilters() {
    this.searchQuery = '';
    this.selectedGenres.clear();
    this.excludedGenres.clear();
    this.selectedYear = '';
    this.selectedQuality = '';
    this.selectedTeam = '';
    this.selectedType = '';
    this.selectedSub = '';
    this.sortOrder = 'id_desc';
    this.currentPage = 1;
    this.notify('reset');
  }

  applyUrlParams(params) {
    let changed = false;

    if (params.search !== undefined && this.searchQuery !== params.search) {
      this.searchQuery = params.search;
      changed = true;
    }

    if (params.genres instanceof Set) {
      const isDiff = this.selectedGenres.size !== params.genres.size ||
        [...params.genres].some(g => !this.selectedGenres.has(g));
      if (isDiff) {
        this.selectedGenres = new Set(params.genres);
        changed = true;
      }
    }

    if (params.excludedGenres instanceof Set) {
      const isDiff = this.excludedGenres.size !== params.excludedGenres.size ||
        [...params.excludedGenres].some(g => !this.excludedGenres.has(g));
      if (isDiff) {
        this.excludedGenres = new Set(params.excludedGenres);
        changed = true;
      }
    }

    if (params.year !== undefined && this.selectedYear !== params.year) {
      this.selectedYear = params.year;
      changed = true;
    }

    if (params.quality !== undefined && this.selectedQuality !== params.quality) {
      this.selectedQuality = params.quality;
      changed = true;
    }

    if (params.team !== undefined && this.selectedTeam !== params.team) {
      this.selectedTeam = params.team;
      changed = true;
    }

    if (params.type !== undefined && this.selectedType !== params.type) {
      this.selectedType = params.type;
      changed = true;
    }

    if (params.sub !== undefined && this.selectedSub !== params.sub) {
      this.selectedSub = params.sub;
      changed = true;
    }

    if (params.sort !== undefined && this.sortOrder !== params.sort) {
      this.sortOrder = params.sort;
      changed = true;
    }

    if (params.page !== undefined && this.currentPage !== params.page) {
      this.currentPage = params.page;
      changed = true;
    }

    return changed;
  }

  getActiveFilterCount() {
    let count = 0;
    count += this.selectedGenres.size;
    count += this.excludedGenres.size;
    if (this.selectedYear) count++;
    if (this.selectedQuality) count++;
    if (this.selectedTeam) count++;
    if (this.selectedType) count++;
    if (this.selectedSub) count++;
    return count;
  }

  getTotalPages() {
    return Math.ceil(this.filteredTitles.length / this.pageSize) || 1;
  }

  getCurrentPageItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredTitles.slice(start, end);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(changeType = 'all') {
    for (const listener of this.listeners) {
      listener(this, changeType);
    }
  }
}

export const state = new AppState();
