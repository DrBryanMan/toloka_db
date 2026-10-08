import { navigateTo, onRouteChanged, VIEWS } from '../router.js';
import { openTitleModal } from './modal.js';

let pollTimer = null;
let lastVocLogId = 0;

export function initVocSyncView() {
  const toolsDropdown = document.getElementById('header-tools-dropdown');
  const btnToolsTrigger = document.getElementById('btn-tools-trigger');
  const btnMenuParser = document.getElementById('btn-menu-parser');
  const btnMenuVocSync = document.getElementById('btn-menu-voc-sync');

  const btnVocBack = document.getElementById('btn-voc-back');
  const btnBrandHome = document.getElementById('btn-brand-home');
  const btnStartVocSync = document.getElementById('btn-start-voc-sync');
  const btnVocSyncCatalog = document.getElementById('btn-voc-sync-catalog');
  const btnClearConsole = document.getElementById('btn-clear-voc-console');

  const statusIndicator = document.getElementById('voc-status-indicator');
  const statusText = document.getElementById('voc-status-text');
  const statMatchedEl = document.getElementById('voc-stat-matched');
  const statHikkaEl = document.getElementById('voc-stat-hikka');
  const statStreamsEl = document.getElementById('voc-stat-streams');
  const statTypesEl = document.getElementById('voc-stat-types');
  const statMalEl = document.getElementById('voc-stat-mal');
  const consoleLogs = document.getElementById('voc-console-logs');
  const resultsGrid = document.getElementById('voc-results-grid');

  const btnFilterNew = document.getElementById('btn-voc-filter-new');
  const btnFilterAll = document.getElementById('btn-voc-filter-all');
  const badgeFilterNew = document.getElementById('badge-voc-filter-new');
  const badgeFilterAll = document.getElementById('badge-voc-filter-all');

  let currentFilter = 'new';
  let cachedItems = [];

  // Tools dropdown toggling
  if (btnToolsTrigger && toolsDropdown) {
    btnToolsTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = toolsDropdown.classList.toggle('open');
      btnToolsTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!toolsDropdown.contains(e.target)) {
        toolsDropdown.classList.remove('open');
        btnToolsTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toolsDropdown.classList.remove('open');
        btnToolsTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.VOC_SYNC) {
      checkVocStatus();
    }
  });

  // Filter Toggles
  function setFilter(filterType) {
    currentFilter = filterType;
    if (btnFilterNew) btnFilterNew.classList.toggle('active', filterType === 'new');
    if (btnFilterAll) btnFilterAll.classList.toggle('active', filterType === 'all');
    renderResults(cachedItems);
  }

  if (btnFilterNew) {
    btnFilterNew.addEventListener('click', () => setFilter('new'));
  }
  if (btnFilterAll) {
    btnFilterAll.addEventListener('click', () => setFilter('all'));
  }

  // Navigation handlers
  if (btnMenuParser) btnMenuParser.addEventListener('click', () => navigateTo(VIEWS.PARSER));
  if (btnMenuVocSync) btnMenuVocSync.addEventListener('click', () => navigateTo(VIEWS.VOC_SYNC));
  if (btnVocBack) btnVocBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));
  if (btnBrandHome) btnBrandHome.addEventListener('click', () => navigateTo(VIEWS.CATALOG));

  // Clear Console
  if (btnClearConsole && consoleLogs) {
    btnClearConsole.addEventListener('click', () => {
      consoleLogs.innerHTML = '';
    });
  }

  // Start Sync Process
  if (btnStartVocSync) {
    btnStartVocSync.addEventListener('click', () => {
      startSync();
    });
  }

  // Rebuild Catalog Data
  if (btnVocSyncCatalog) {
    btnVocSyncCatalog.addEventListener('click', async () => {
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

  async function checkVocStatus() {
    try {
      const res = await fetch('/api/voc/status');
      if (res.ok) {
        const data = await res.json();
        updateUI(data);
        if (data.is_running && !pollTimer) {
          startPolling();
        }
      }
    } catch {
      // Backend not running
    }
  }

  async function startSync() {
    lastVocLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    appendLog('Запуск синхронізації з базою VOC-ALL...', 'info');
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Зіставлення триває...';

    try {
      const res = await fetch('/api/voc/sync', { method: 'POST' });
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
      appendLog('Локальний сервер API не знайдено. Запустіть «python server.py» у терміналі.', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (statusText) statusText.textContent = 'Сервер офлайн';
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/voc/status');
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);

        if (!data.is_running) {
          clearInterval(pollTimer);
          pollTimer = null;
          if (statusIndicator) statusIndicator.classList.remove('running');
          if (statusText) statusText.textContent = data.status === 'completed' ? 'Завершено' : 'Зупинено';
          appendLog(data.message || 'Синхронізацію успішно завершено.', 'success');
        }
      } catch {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  }

  function updateUI(data) {
    const matched = data.matched_count !== undefined ? data.matched_count : data.total_matched;
    const hikka = data.hikka_count;
    const streams = data.watch_count !== undefined ? data.watch_count : data.streams_count;
    const types = data.types_count;
    const mal = data.mal_count;

    if (statMatchedEl && matched !== undefined) statMatchedEl.textContent = Number(matched).toLocaleString('uk-UA');
    if (statHikkaEl && hikka !== undefined) statHikkaEl.textContent = Number(hikka).toLocaleString('uk-UA');
    if (statStreamsEl && streams !== undefined) statStreamsEl.textContent = Number(streams).toLocaleString('uk-UA');
    if (statTypesEl && types !== undefined) statTypesEl.textContent = Number(types).toLocaleString('uk-UA');
    if (statMalEl && mal !== undefined) statMalEl.textContent = Number(mal).toLocaleString('uk-UA');

    if (data.is_running) {
      if (statusIndicator) statusIndicator.classList.add('running');
      if (statusText) statusText.textContent = data.message || 'Зіставлення триває...';
    }

    if (data.latest_logs && data.latest_logs.length > 0) {
      for (const log of data.latest_logs) {
        if (log.id !== undefined) {
          if (log.id > lastVocLogId) {
            appendLog(log.text, log.type, log.time);
            lastVocLogId = log.id;
          }
        } else {
          appendLog(log.text, log.type);
        }
      }
    }

    const recent = data.recent_matched || data.recent_matches || [];
    cachedItems = recent;

    const newCount = data.new_matches_count !== undefined ? data.new_matches_count : recent.filter(i => i.is_new).length;
    const allCount = data.matched_count !== undefined ? data.matched_count : recent.length;
    if (badgeFilterNew) badgeFilterNew.textContent = Number(newCount).toLocaleString('uk-UA');
    if (badgeFilterAll) badgeFilterAll.textContent = Number(allCount).toLocaleString('uk-UA');

    renderResults(cachedItems);
  }

  function renderResults(items) {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = '';

    if (!items || items.length === 0) {
      resultsGrid.innerHTML = '<div class="parser-empty-msg">Тут з\'являться результати після запуску зіставлення.</div>';
      return;
    }

    const displayItems = currentFilter === 'new'
      ? items.filter(i => i.is_new)
      : items;

    if (currentFilter === 'new' && displayItems.length === 0) {
      resultsGrid.innerHTML = `
        <div class="parser-empty-msg">
          <p>Нових роздач не виявлено (усі дані вже зіставлені з VOC-ALL).</p>
          <button type="button" class="btn btn-subtle" id="btn-voc-show-all-inline">Показати всі оброблені (${items.length})</button>
        </div>
      `;
      const btnShowAll = resultsGrid.querySelector('#btn-voc-show-all-inline');
      if (btnShowAll) {
        btnShowAll.addEventListener('click', () => setFilter('all'));
      }
      return;
    }

    for (const item of displayItems) {
      const el = document.createElement('div');
      el.className = 'voc-result-item';

      const statusBadge = item.is_new
        ? '<span class="parser-badge-new">НОВИЙ</span>'
        : '<span class="parser-badge-exist">В базі</span>';

      let streamsHtml = '';
      if (Array.isArray(item.where_to_watch)) {
        for (const p of item.where_to_watch) {
          if (!p.url) continue;
          if (p.id && p.id !== 'anitube' && p.id !== 'mikai') continue;
          const pIcon = p.icon || `img/icons/${p.id}.ico`;
          streamsHtml += `
            <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="voc-stream-icon-link" title="${escapeHtml(p.name || p.id)}">
              <img src="${pIcon}" alt="${escapeHtml(p.name || p.id)}" loading="lazy">
            </a>
          `;
        }
      } else if (item.where_to_watch && typeof item.where_to_watch === 'object') {
        const pNames = {
          anitube: { name: 'Анітьюб', icon: 'img/icons/anitube.ico' },
          mikai: { name: 'Мікай', icon: 'img/icons/mikai.ico' }
        };

        for (const [key, url] of Object.entries(item.where_to_watch)) {
          if (!url) continue;
          if (key !== 'anitube' && key !== 'mikai') continue;
          const p = pNames[key] || { name: key, icon: '' };
          streamsHtml += `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="voc-stream-icon-link" title="${p.name}">
              <img src="${p.icon}" alt="${p.name}" loading="lazy">
            </a>
          `;
        }
      }

      const malUrl = item.myanimelist || (item.mal_id ? `https://myanimelist.net/anime/${item.mal_id}` : null);
      const malBadge = malUrl ? `
        <a href="${escapeHtml(malUrl)}" target="_blank" rel="noopener noreferrer" class="voc-badge-mal" title="Відкрити на MyAnimeList">
          <img src="img/icons/myanimelist.ico" alt="MAL">
          <span>MAL</span>
        </a>
      ` : '';

      const hikkaBadge = item.hikka_url ? `
        <a href="${escapeHtml(item.hikka_url)}" target="_blank" rel="noopener noreferrer" class="voc-badge-hikka" title="Відкрити на Hikka">
          <img src="img/icons/hikka.ico" alt="Hikka">
          <span>Hikka</span>
        </a>
      ` : '';

      let teamBadge = '';
      if (item.team) {
        teamBadge = `<span class="voc-badge-team">${escapeHtml(item.team)}</span>`;
      } else if (Array.isArray(item.teams) && item.teams.length > 0) {
        teamBadge = `<span class="voc-badge-team">${escapeHtml(item.teams.join(', '))}</span>`;
      }

      let typeBadge = '';
      if (item.format || item.type) {
        const typeLabel = item.format || item.type;
        const sanitizedType = escapeHtml(item.type || '').replace('?', '-guess');
        const typeClass = item.type ? ` voc-type-${sanitizedType}` : '';
        typeBadge = `<span class="voc-badge-type${typeClass}">${escapeHtml(typeLabel)}</span>`;
      }

      el.innerHTML = `
        <div class="voc-result-main">
          <div class="voc-result-title">${escapeHtml(item.anime_title || item.title_ua || item.title || 'Реліз')}</div>
          <div class="voc-result-meta">
            ${statusBadge}
            <span class="voc-badge-id">#${item.topic_id}</span>
            ${typeBadge}
            ${malBadge}
            ${hikkaBadge}
            ${teamBadge}
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
          openQuickModal(item);
        });
      }

      resultsGrid.appendChild(el);
    }
  }

  function openQuickModal(item) {
    const tid = Number(item.topic_id);
    const existingTitle = (window.TOLOKA_CATALOG?.titles || []).find(t => t.id === tid);
    const malUrl = item.myanimelist || (item.mal_id ? `https://myanimelist.net/anime/${item.mal_id}` : null);

    if (existingTitle) {
      if (item.hikka_url && !existingTitle.hikka_url) existingTitle.hikka_url = item.hikka_url;
      if (malUrl && (!existingTitle.external_ids || !existingTitle.external_ids.myanimelist)) {
        if (!existingTitle.external_ids) existingTitle.external_ids = {};
        existingTitle.external_ids.myanimelist = malUrl;
      }
      if (item.teams && item.teams.length > 0 && (!existingTitle.teams || existingTitle.teams.length === 0)) existingTitle.teams = item.teams;
      if (item.where_to_watch && (!existingTitle.where_to_watch || existingTitle.where_to_watch.length === 0)) existingTitle.where_to_watch = item.where_to_watch;
      if (item.type && !existingTitle.type) existingTitle.type = item.type;
      openTitleModal(existingTitle);
    } else {
      const extIds = {};
      if (item.hikka_url) extIds.hikka = item.hikka_url;
      if (malUrl) extIds.myanimelist = malUrl;

      const tempTitle = {
        id: tid,
        title_ua: item.anime_title || item.title_ua || item.title || `Реліз #${tid}`,
        title_orig: '',
        year: new Date().getFullYear(),
        type: item.type || 'tv',
        quality: 'HD',
        episodes: null,
        duration: null,
        studio: '',
        director: '',
        country: 'Японія',
        poster: item.poster_url || '',
        genres: [],
        synopsis: 'Реліз із бази VOC-ALL. Оновіть каталог для повного перегляду інформації.',
        url: item.url || `https://toloka.to/t${tid}`,
        download_url: '',
        external_ids: extIds,
        hikka_url: item.hikka_url || null,
        where_to_watch: item.where_to_watch || [],
        teams: Array.isArray(item.teams) ? item.teams : (item.team ? [item.team] : [])
      };
      openTitleModal(tempTitle);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
