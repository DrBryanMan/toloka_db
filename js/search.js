/**
 * Search and Filtering Engine
 */

export function filterAndSortTitles(titles, state) {
  const query = state.searchQuery.trim().toLowerCase();
  const selectedGenres = state.selectedGenres;
  const yearFilter = state.selectedYear;
  const quality = state.selectedQuality.toLowerCase();
  const team = state.selectedTeam.toLowerCase();
  const typeFilter = (state.selectedType || '').toLowerCase();

  const queryTerms = query ? query.split(/\s+/).filter(Boolean) : [];

  const results = titles.filter(item => {
    // 1. Content Type Filter (tv, movie, movie?, ova, ona, special)
    if (typeFilter) {
      const itemType = (item.type || 'tv').toLowerCase();
      if (typeFilter === 'movie') {
        if (itemType !== 'movie' && itemType !== 'movie?') {
          return false;
        }
      } else if (itemType !== typeFilter) {
        return false;
      }
    }

    // 2. Multi-Genre Filter
    if (selectedGenres && selectedGenres.size > 0) {
      const itemGenres = (item.genres || []).map(g => g.toLowerCase());
      for (const reqGenre of selectedGenres) {
        if (!itemGenres.includes(reqGenre)) {
          return false;
        }
      }
    }

    // 3. Year Filter
    if (yearFilter) {
      const y = item.year;
      if (!y) return false;

      if (yearFilter === '2020s') {
        if (y < 2020) return false;
      } else if (yearFilter === '2010s') {
        if (y < 2010 || y > 2019) return false;
      } else if (yearFilter === '2000s') {
        if (y < 2000 || y > 2009) return false;
      } else if (yearFilter === '1990s') {
        if (y < 1990 || y > 1999) return false;
      } else if (yearFilter === 'older') {
        if (y >= 1990) return false;
      } else {
        if (y !== parseInt(yearFilter, 10)) return false;
      }
    }

    // 4. Quality Filter
    if (quality) {
      const q = (item.quality || '').toLowerCase();
      if (!q.includes(quality)) return false;
    }

    // 5. Dubbing / Adaptation Team Filter
    if (team) {
      const teamList = item.teams || [];
      const hasTeam = teamList.some(t => t.toLowerCase().includes(team));
      if (!hasTeam) {
        const adaptStr = JSON.stringify(item.adaptation_team || {}).toLowerCase();
        if (!adaptStr.includes(team)) return false;
      }
    }

    // 6. Subtitles Filter ('with_sub', 'no_sub')
    if (state.selectedSub) {
      if (state.selectedSub === 'with_sub' && !item.has_sub) {
        return false;
      }
      if (state.selectedSub === 'no_sub' && item.has_sub) {
        return false;
      }
    }

    // 7. Search Query (Multi-term matching)
    if (queryTerms.length > 0) {
      const searchCorpus = [
        item.title_ua || '',
        item.title_orig || '',
        item.raw_title || '',
        item.studio || '',
        item.director || '',
        item.country || '',
        item.uploader || '',
        (item.teams || []).join(' ')
      ].join(' ').toLowerCase();

      for (const term of queryTerms) {
        if (!searchCorpus.includes(term)) {
          return false;
        }
      }
    }

    return true;
  });

  return sortTitles(results, state.sortOrder);
}

function sortTitles(titles, sortOrder) {
  const sorted = [...titles];

  switch (sortOrder) {
    case 'year_desc':
      return sorted.sort((a, b) => (b.year || 0) - (a.year || 0) || b.id - a.id);

    case 'year_asc':
      return sorted.sort((a, b) => (a.year || 9999) - (b.year || 9999) || b.id - a.id);

    case 'title_asc':
      return sorted.sort((a, b) => (a.title_ua || '').localeCompare(b.title_ua || '', 'uk'));

    case 'episodes_desc':
      return sorted.sort((a, b) => (b.episodes || 0) - (a.episodes || 0) || b.id - a.id);

    case 'id_desc':
    default:
      return sorted.sort((a, b) => b.id - a.id);
  }
}
