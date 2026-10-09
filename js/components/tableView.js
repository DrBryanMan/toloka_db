/**
 * Table View Component for Catalog Releases
 */
import { escapeHtml, getSvgPlaceholder } from '../utils.js';
import { openEditModal } from './editModal.js';

export function renderTableView(container, appState, onRowClick) {
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
        <button class="btn btn-primary" id="btn-table-empty-reset">Скинути всі фільтри</button>
      </div>
    `;

    const resetBtn = container.querySelector('#btn-table-empty-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (typeof window.resetAllCatalogFilters === 'function') {
          window.resetAllCatalogFilters();
        }
      });
    }
    return;
  }

  const typeLabels = {
    tv: 'Серіал',
    movie: 'Фільм',
    'movie?': 'Фільм?',
    ova: 'OVA',
    ona: 'ONA',
    special: 'Спешл'
  };

  const table = document.createElement('div');
  table.className = 'catalog-table-container';

  table.innerHTML = `
    <table class="catalog-data-table">
      <thead>
        <tr>
          <th class="th-poster"></th>
          <th class="th-title">Назва тайтлу</th>
          <th class="th-year">Рік</th>
          <th class="th-type">Тип / Серії</th>
          <th class="th-quality">Якість</th>
          <th class="th-dub">Озвучення / Автор</th>
          <th class="th-torrent">Торрент</th>
          <th class="th-actions">Дії</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const primaryPoster = item.local_poster || item.poster || getSvgPlaceholder(item.title_ua);
          const typeName = typeLabels[item.type] || item.type?.toUpperCase() || 'TV';
          const isGuess = item.type === 'movie?';
          const vocTeams = item.voc_teams || item.teams || [];
          const uploader = (item.uploader || '').trim();
          const seeders = item.seeders || 0;
          const size = (item.torrent_size || '').trim();

          return `
            <tr class="table-row-item" data-id="${item.id}" tabindex="0" role="button">
              <td class="td-poster">
                <div class="table-poster-thumb">
                  <img 
                    src="${escapeHtml(primaryPoster)}" 
                    alt="${escapeHtml(item.title_ua)}"
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    onerror="this.src='${getSvgPlaceholder(item.title_ua)}'"
                  />
                  ${item.has_sub ? `<span class="table-sub-badge" title="Наявні субтитри">SUB</span>` : ''}
                </div>
              </td>
              <td class="td-title">
                <div class="table-title-group">
                  <div class="table-title-ua" title="${escapeHtml(item.title_ua)}">${escapeHtml(item.title_ua)}</div>
                  ${item.title_orig ? `<div class="table-title-orig" title="${escapeHtml(item.title_orig)}">${escapeHtml(item.title_orig)}</div>` : ''}
                  <div class="table-title-subinfo">
                    <span class="table-topic-id card-topic-id" title="Клікніть, щоб скопіювати ID">#${item.id}</span>
                    ${item.is_compilation ? `<span class="table-part-badge compilation">Збірник ${item.parts_count ? `(${item.parts_count})` : ''}</span>` : ''}
                    ${item.is_compilation_item ? `<span class="table-part-badge compilation-item">Зі збірки #${item.parent_id}</span>` : ''}
                    ${item.part ? `<span class="table-part-badge">${escapeHtml(item.part)}</span>` : ''}
                  </div>
                </div>
              </td>
              <td class="td-year">
                <span class="table-year-val numeric">${item.year || '—'}</span>
              </td>
              <td class="td-type">
                <div class="table-type-group">
                  <span class="table-type-badge${isGuess ? ' type-guess' : ''}" title="${isGuess ? 'Тривалість > 50 хв — можливо фільм' : ''}">${escapeHtml(typeName)}</span>
                  <span class="table-episodes-val numeric">${item.episodes ? `${item.episodes} сер.` : '—'}</span>
                </div>
              </td>
              <td class="td-quality">
                ${item.quality ? `<span class="table-quality-badge numeric">${escapeHtml(item.quality.split(' ')[0])}</span>` : '<span class="table-empty-dash">—</span>'}
              </td>
              <td class="td-dub">
                <div class="table-dub-group">
                  ${uploader ? `<span class="table-uploader-tag" title="Автор роздачі: ${escapeHtml(uploader)}">${escapeHtml(uploader)}</span>` : ''}
                  ${vocTeams.length > 0 ? `
                    <div class="table-voc-teams" title="${escapeHtml(vocTeams.join(', '))}">
                      ${vocTeams.slice(0, 2).map(t => `<span class="table-voc-pill">${escapeHtml(t)}</span>`).join('')}
                      ${vocTeams.length > 2 ? `<span class="table-voc-pill more">+${vocTeams.length - 2}</span>` : ''}
                    </div>
                  ` : ''}
                </div>
              </td>
              <td class="td-torrent">
                <div class="table-torrent-group">
                  ${seeders > 0 ? `
                    <span class="table-seeders-badge numeric" title="Роздають: ${seeders}">
                      ▲ ${seeders}
                    </span>
                  ` : '<span class="table-seeders-none numeric" title="Немає роздавачів">0</span>'}
                  ${size ? `<span class="table-size-val numeric">${escapeHtml(size)}</span>` : ''}
                </div>
              </td>
              <td class="td-actions">
                <div class="table-actions-group">
                  <button type="button" class="table-action-btn btn-open-modal" title="Деталі тайтлу" aria-label="Деталі">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="16" x2="12" y2="12"></line>
                      <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                  </button>
                  <button type="button" class="table-action-btn btn-edit-title" title="Редагувати тайтл" aria-label="Редагувати">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                  <button type="button" class="table-action-btn btn-copy-link" title="Копіювати посилання" aria-label="Копіювати посилання">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  ${item.download_url ? `
                    <a href="${escapeHtml(item.download_url)}" target="_blank" rel="noopener noreferrer" class="table-action-btn btn-download-torrent" title="Завантажити торрент" aria-label="Завантажити">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </a>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  // Attach event handlers
  const rows = table.querySelectorAll('.table-row-item');
  rows.forEach(row => {
    const tid = parseInt(row.dataset.id, 10);
    const item = items.find(i => i.id === tid);
    if (!item) return;

    // Row click -> onRowClick (open details modal)
    row.addEventListener('click', (e) => {
      if (e.target.closest('.table-actions-group') || e.target.closest('.table-topic-id')) {
        return;
      }
      if (typeof onRowClick === 'function') {
        onRowClick(item);
      }
    });

    // Enter key triggers row
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('.table-actions-group')) {
        e.preventDefault();
        if (typeof onRowClick === 'function') {
          onRowClick(item);
        }
      }
    });

    // Modal detail button
    const modalBtn = row.querySelector('.btn-open-modal');
    if (modalBtn) {
      modalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onRowClick === 'function') {
          onRowClick(item);
        }
      });
    }

    // Edit button
    const editBtn = row.querySelector('.btn-edit-title');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(item);
      });
    }

    // Copy link button
    const copyBtn = row.querySelector('.btn-copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const urlToCopy = item.url || (item.id ? `https://toloka.to/t${item.id}` : window.location.href);
        navigator.clipboard.writeText(urlToCopy).then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        }).catch(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        });
      });
    }

    // Copy topic ID
    const topicIdEl = row.querySelector('.table-topic-id');
    if (topicIdEl) {
      topicIdEl.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(String(item.id)).then(() => {
          topicIdEl.classList.add('copied');
          setTimeout(() => topicIdEl.classList.remove('copied'), 1400);
        }).catch(() => {
          topicIdEl.classList.add('copied');
          setTimeout(() => topicIdEl.classList.remove('copied'), 1400);
        });
      });
    }
  });

  container.appendChild(table);
}
