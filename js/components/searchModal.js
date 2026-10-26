/**
 * Search Modal Component
 * Displays centered search dialog with quick search dropdown list
 */
import { debounce, formatNumber, escapeHtml, getSvgPlaceholder } from '../utils.js';

export function initSearchModal({
  onSelectTitle,
  onApplyQuery,
  getCurrentQuery = () => '',
} = {}) {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-modal-input');
  const clearBtn = document.getElementById('search-modal-clear');
  const closeBtn = document.getElementById('search-modal-close');
  const resultsEl = document.getElementById('search-modal-results');
  const footerEl = document.getElementById('search-modal-footer');
  const triggerBtn = document.getElementById('btn-search-open');

  if (!modal) return null;

  function renderResults(query) {
    if (!resultsEl) return;
    const cleanQuery = (query || '').trim().toLowerCase();

    if (!cleanQuery) {
      resultsEl.innerHTML = `
        <div class="search-modal-empty">
          Почніть вводити назву, режисера або команду озвучення для швидкого пошуку...
        </div>
      `;
      if (footerEl) footerEl.innerHTML = '';
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
      resultsEl.innerHTML = `
        <div class="search-modal-empty">Нічого не знайдено за запитом &laquo;${escapeHtml(query)}&raquo;</div>
      `;
      if (footerEl) footerEl.innerHTML = '';
      return;
    }

    const limit = 30;
    const topMatches = matched.slice(0, limit);

    resultsEl.innerHTML = topMatches.map((item) => {
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

    resultsEl.querySelectorAll('.search-modal-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const id = parseInt(itemEl.dataset.id, 10);
        const item = allTitles.find(t => t.id === id);
        if (item) {
          close();
          if (onSelectTitle) onSelectTitle(item);
        }
      });
    });

    if (footerEl) {
      const total = matched.length;
      footerEl.innerHTML = `
        <span>Знайдено: <strong class="search-modal-footer-count">${formatNumber(total)}</strong> ${total === 1 ? 'тайтл' : 'тайтлів'}</span>
        <button type="button" class="btn-search-goto-catalog" id="btn-search-modal-apply">Застосувати до каталогу &rarr;</button>
      `;

      const applyBtn = footerEl.querySelector('#btn-search-modal-apply');
      if (applyBtn) {
        applyBtn.addEventListener('click', () => {
          close();
          if (onApplyQuery) onApplyQuery(query);
        });
      }
    }
  }

  const debouncedSearch = debounce((q) => {
    renderResults(q);
  }, 120);

  function open(initialQuery) {
    if (!modal) return;
    const q = initialQuery !== undefined ? initialQuery : (getCurrentQuery() || '');
    if (!modal.open) {
      modal.showModal();
    }
    if (input) {
      input.value = q;
      if (clearBtn) clearBtn.classList.toggle('visible', Boolean(q));
      setTimeout(() => input.focus(), 60);
    }
    renderResults(q);
  }

  function close() {
    if (modal && modal.open) {
      modal.close();
    }
  }

  function reset() {
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.remove('visible');
    if (triggerBtn) triggerBtn.classList.remove('has-query');
    renderResults('');
  }

  function syncQuery(q) {
    if (triggerBtn) triggerBtn.classList.toggle('has-query', Boolean(q));
    if (input && document.activeElement !== input) {
      input.value = q || '';
      if (clearBtn) clearBtn.classList.toggle('visible', Boolean(q));
    }
  }

  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => open());
  }

  if (input) {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (clearBtn) clearBtn.classList.toggle('visible', val.length > 0);
      debouncedSearch(val);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value;
        close();
        if (onApplyQuery) onApplyQuery(val);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (input) {
        input.value = '';
        clearBtn.classList.remove('visible');
        input.focus();
      }
      renderResults('');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      close();
    }
  });

  // Global hotkey '/' to open search modal
  const handleKeydown = (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      open();
    }
  };
  window.addEventListener('keydown', handleKeydown);

  return {
    open,
    close,
    reset,
    syncQuery,
    destroy() {
      window.removeEventListener('keydown', handleKeydown);
    }
  };
}
