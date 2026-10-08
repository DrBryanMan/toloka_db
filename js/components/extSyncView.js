import { navigateTo, onRouteChanged, VIEWS } from '../router.js';
import { openTitleModal } from './modal.js';

let pollTimer = null;
let lastLogId = 0;
let cachedItems = [];
let currentFilter = 'new'; // 'new' | 'all'

export function initExtSyncView() {
  const btnMenuExtSync = document.getElementById('btn-menu-ext-sync');
  const btnExtBack = document.getElementById('btn-ext-back');
  const btnBrandHome = document.getElementById('btn-brand-home');

  const btnStartExtSync = document.getElementById('btn-start-ext-sync');
  const extMikaiMode = document.getElementById('ext-mikai-mode');
  const btnRefreshMikai = document.getElementById('btn-refresh-mikai');
  const btnExtSyncCatalog = document.getElementById('btn-ext-sync-catalog');
  const btnClearConsole = document.getElementById('btn-clear-ext-console');

  const statusIndicator = document.getElementById('ext-status-indicator');
  const statusText = document.getElementById('ext-status-text');

  const statTotalEl = document.getElementById('ext-stat-total');
  const statMalEl = document.getElementById('ext-stat-mal');
  const statImdbEl = document.getElementById('ext-stat-imdb');
  const statAlEl = document.getElementById('ext-stat-al');
  const statHikkaEl = document.getElementById('ext-stat-hikka');
  const statUpdatedEl = document.getElementById('ext-stat-updated');

  const consoleLogs = document.getElementById('ext-console-logs');
  const resultsGrid = document.getElementById('ext-results-grid');

  const btnFilterNew = document.getElementById('btn-ext-filter-new');
  const btnFilterAll = document.getElementById('btn-ext-filter-all');
  const badgeFilterNew = document.getElementById('badge-ext-filter-new');
  const badgeFilterAll = document.getElementById('badge-ext-filter-all');

  // Navigation handlers
  if (btnMenuExtSync) btnMenuExtSync.addEventListener('click', () => navigateTo(VIEWS.EXT_SYNC));
  if (btnExtBack) btnExtBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));
  if (btnBrandHome) btnBrandHome.addEventListener('click', () => navigateTo(VIEWS.CATALOG));

  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.EXT_SYNC) {
      checkStatus();
    }
  });

  // Filter toggling
  function setFilter(type) {
    currentFilter = type;
    if (btnFilterNew) btnFilterNew.classList.toggle('active', type === 'new');
    if (btnFilterAll) btnFilterAll.classList.toggle('active', type === 'all');
    renderResults(cachedItems);
  }

  if (btnFilterNew) btnFilterNew.addEventListener('click', () => setFilter('new'));
  if (btnFilterAll) btnFilterAll.addEventListener('click', () => setFilter('all'));

  // Clear Console
  if (btnClearConsole && consoleLogs) {
    btnClearConsole.addEventListener('click', () => {
      consoleLogs.innerHTML = '';
    });
  }

  // Start Sync Process
  if (btnStartExtSync) {
    btnStartExtSync.addEventListener('click', () => {
      startSync();
    });
  }

  // Refresh Mikai Cache
  if (btnRefreshMikai) {
    btnRefreshMikai.addEventListener('click', () => {
      const mode = extMikaiMode?.value || 'ongoing';
      refreshMikai(mode);
    });
  }

  // Rebuild Catalog Data
  if (btnExtSyncCatalog) {
    btnExtSyncCatalog.addEventListener('click', async () => {
      appendLog('Перебудова каталогу data/catalog.js...', 'info');
      try {
        const resp = await fetch('/api/catalog/rebuild', { method: 'POST' });
        if (resp.ok) {
          appendLog('Каталог успішно перебудовано! Перезавантаження сторінки...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          appendLog('Сервер повернув помилку при оновленні каталогу.', 'error');
        }
      } catch {
        appendLog('Локальний сервер не відповідає. Запустіть «python server.py».', 'warn');
      }
    });
  }

  function appendLog(msg, type = 'info', logTime = null) {
    if (!consoleLogs) return;
    const time = logTime || new Date().toLocaleTimeString('uk-UA');
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `[${time}] ${msg}`;
    consoleLogs.appendChild(line);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  async function checkStatus() {
    try {
      const res = await fetch('/api/ext-ids/status');
      if (res.ok) {
        const data = await res.json();
        updateUI(data);
        if (data.is_running && !pollTimer) {
          startPolling();
        }
      }
    } catch {
      // Backend offline
    }
  }

  async function startSync() {
    lastLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    appendLog('Запуск зіставлення з базами даних (MAL, IMDb, AniList, Mikai)...', 'info');
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Зіставлення триває...';

    try {
      const res = await fetch('/api/ext-ids/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 })
      });
      if (res.ok) {
        appendLog('Запит на зіставлення прийнято сервером.', 'success');
        startPolling();
      } else {
        const err = await res.text();
        appendLog(`Помилка: ${err}`, 'error');
        if (statusIndicator) statusIndicator.classList.remove('running');
        if (statusText) statusText.textContent = 'Помилка';
      }
    } catch {
      appendLog('Локальний сервер API не знайдено. Запустіть «python server.py».', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (statusText) statusText.textContent = 'Сервер офлайн';
    }
  }

  async function refreshMikai(mode) {
    lastLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    appendLog(`Запит оновлення кешу Mikai (${mode === 'full' ? 'повний' : 'онгоїнґи'})...`, 'info');
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Оновлення кешу...';

    try {
      const res = await fetch('/api/ext-ids/mikai-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        appendLog('Процес оновлення кешу Mikai запущено.', 'success');
        startPolling();
      } else {
        const err = await res.text();
        appendLog(`Помилка: ${err}`, 'error');
        if (statusIndicator) statusIndicator.classList.remove('running');
        if (statusText) statusText.textContent = 'Помилка';
      }
    } catch {
      appendLog('Локальний сервер не відповідає.', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (statusText) statusText.textContent = 'Сервер офлайн';
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/ext-ids/status');
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);

        if (!data.is_running) {
          clearInterval(pollTimer);
          pollTimer = null;
          if (statusIndicator) statusIndicator.classList.remove('running');
          if (statusText) statusText.textContent = data.status === 'completed' ? 'Завершено' : 'Зупинено';
          appendLog(data.message || 'Процес завершено.', 'success');
        }
      } catch {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  }

  function updateUI(data) {
    if (statTotalEl && data.total_topics !== undefined) statTotalEl.textContent = Number(data.total_topics).toLocaleString('uk-UA');
    if (statMalEl && data.count_mal !== undefined) statMalEl.textContent = Number(data.count_mal).toLocaleString('uk-UA');
    if (statImdbEl && data.count_imdb !== undefined) statImdbEl.textContent = Number(data.count_imdb).toLocaleString('uk-UA');
    if (statAlEl && data.count_al !== undefined) statAlEl.textContent = Number(data.count_al).toLocaleString('uk-UA');
    if (statHikkaEl && data.count_hikka !== undefined) statHikkaEl.textContent = Number(data.count_hikka).toLocaleString('uk-UA');
    if (statUpdatedEl && data.new_enriched_count !== undefined) statUpdatedEl.textContent = Number(data.new_enriched_count).toLocaleString('uk-UA');

    if (data.is_running) {
      if (statusIndicator) statusIndicator.classList.add('running');
      if (statusText) statusText.textContent = data.message || 'Обробка триває...';
    }

    if (data.latest_logs && data.latest_logs.length > 0) {
      for (const log of data.latest_logs) {
        if (log.id !== undefined) {
          if (log.id > lastLogId) {
            appendLog(log.text, log.type, log.time);
            lastLogId = log.id;
          }
        } else {
          appendLog(log.text, log.type);
        }
      }
    }

    if (data.recent_items) {
      cachedItems = data.recent_items;
      const newCount = data.new_enriched_count !== undefined ? data.new_enriched_count : cachedItems.filter(i => i.is_new).length;
      const allCount = cachedItems.length;

      if (badgeFilterNew) badgeFilterNew.textContent = Number(newCount).toLocaleString('uk-UA');
      if (badgeFilterAll) badgeFilterAll.textContent = Number(allCount).toLocaleString('uk-UA');

      renderResults(cachedItems);
    }
  }

  function renderResults(items) {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = '';

    if (!items || items.length === 0) {
      resultsGrid.innerHTML = '<div class="parser-empty-msg">Тут з\'являться результати зіставлення після запуску.</div>';
      return;
    }

    const displayItems = currentFilter === 'new'
      ? items.filter(i => i.is_new)
      : items;

    if (currentFilter === 'new' && displayItems.length === 0) {
      resultsGrid.innerHTML = `
        <div class="parser-empty-msg">
          <p>Нових ідентифікаторів не виявлено (усі доступні ID вже є в базі даних).</p>
          <button type="button" class="btn btn-subtle" id="btn-ext-show-all-inline">Показати всі оброблені (${items.length})</button>
        </div>
      `;
      const btnShowAll = resultsGrid.querySelector('#btn-ext-show-all-inline');
      if (btnShowAll) {
        btnShowAll.addEventListener('click', () => setFilter('all'));
      }
      return;
    }

    for (const item of displayItems) {
      const el = document.createElement('div');
      el.className = 'voc-result-item';

      const statusBadge = item.is_new
        ? '<span class="parser-badge-new">ОНОВЛЕНО</span>'
        : '<span class="parser-badge-exist">В базі</span>';

      const ext = item.external_ids || {};

      const malBadge = ext.myanimelist ? `
        <a href="${escapeHtml(ext.myanimelist)}" target="_blank" rel="noopener noreferrer" class="voc-badge-mal" title="Відкрити на MyAnimeList">
          <img src="img/icons/myanimelist.ico" alt="MAL">
          <span>MAL</span>
        </a>
      ` : '';

      const imdbBadge = ext.imdb ? `
        <a href="${escapeHtml(ext.imdb)}" target="_blank" rel="noopener noreferrer" class="voc-badge-hikka" style="background:rgba(245,197,24,0.18);border-color:rgba(245,197,24,0.4);color:#f5c518;" title="Відкрити на IMDb">
          <img src="img/icons/imdb.ico" alt="IMDb">
          <span>IMDb</span>
        </a>
      ` : '';

      const alBadge = ext.anilist ? `
        <a href="${escapeHtml(ext.anilist)}" target="_blank" rel="noopener noreferrer" class="voc-badge-al" title="Відкрити на AniList">
          <img src="img/icons/anilist.ico" alt="AniList">
          <span>AniList</span>
        </a>
      ` : '';

      const hikkaBadge = ext.hikka ? `
        <a href="${escapeHtml(ext.hikka)}" target="_blank" rel="noopener noreferrer" class="voc-badge-hikka" title="Відкрити на Hikka">
          <img src="img/icons/hikka.ico" alt="Hikka">
          <span>Hikka</span>
        </a>
      ` : '';

      let streamsHtml = '';
      if (Array.isArray(item.where_to_watch)) {
        for (const p of item.where_to_watch) {
          if (!p.url) continue;
          const pIcon = p.icon || `img/icons/${p.id}.ico`;
          streamsHtml += `
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="voc-stream-icon-link" title="${escapeHtml(p.name || p.id)}">
              <img src="${pIcon}" alt="${escapeHtml(p.name || p.id)}" loading="lazy">
            </a>
          `;
        }
      }

      el.innerHTML = `
        <div class="voc-result-main">
          <div class="voc-result-title">${escapeHtml(item.title || `Реліз #${item.topic_id}`)}</div>
          <div class="voc-result-meta">
            ${statusBadge}
            <span class="voc-badge-id">#${item.topic_id}</span>
            ${malBadge}
            ${imdbBadge}
            ${alBadge}
            ${hikkaBadge}
          </div>
        </div>
        <div class="voc-result-actions">
          ${streamsHtml ? `<div class="voc-stream-tags">${streamsHtml}</div>` : ''}
          <button type="button" class="voc-btn-view" data-topic-id="${item.topic_id}" title="Швидкий перегляд тайтлу у модальному вікні">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Перегляд</span>
          </button>
        </div>
      `;

      const btnView = el.querySelector('.voc-btn-view');
      if (btnView) {
        btnView.addEventListener('click', (e) => {
          e.stopPropagation();
          const tid = Number(item.topic_id);
          const found = (window.TOLOKA_CATALOG?.titles || []).find(t => t.id === tid);
          if (found) {
            openTitleModal(found);
          } else {
            openTitleModal({
              id: tid,
              title_ua: item.title,
              title_orig: '',
              year: new Date().getFullYear(),
              type: 'tv',
              quality: 'HD',
              genres: [],
              poster: item.poster_url || '',
              url: `https://toloka.to/t${tid}`,
              external_ids: item.external_ids || {},
              where_to_watch: item.where_to_watch || []
            });
          }
        });
      }

      resultsGrid.appendChild(el);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
