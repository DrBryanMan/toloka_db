/**
 * Poster Downloader and Gallery View Component
 */
import { navigateTo, onRouteChanged, VIEWS } from '../router.js';
import { openTitleModal } from './modal.js';
import { escapeHtml, getSvgPlaceholder } from '../utils.js';

let pollTimer = null;
let lastLogId = 0;
let cachedRecentItems = [];
let galleryFilter = 'session'; // 'session' | 'all'

export function initPosterDownloaderView() {
  const btnMenuPosters = document.getElementById('btn-menu-posters');
  const btnPostersBack = document.getElementById('btn-posters-back');
  const btnStartBatch = document.getElementById('btn-start-posters-batch');
  const btnStartAll = document.getElementById('btn-start-posters-all');
  const btnStop = document.getElementById('btn-stop-posters');
  const btnSyncCatalog = document.getElementById('btn-posters-sync-catalog');
  const btnClearConsole = document.getElementById('btn-clear-posters-console');

  const statusIndicator = document.getElementById('posters-status-indicator');
  const statusText = document.getElementById('posters-status-text');
  const progressPctEl = document.getElementById('posters-progress-pct');
  const progressBarFill = document.getElementById('posters-progress-bar-fill');

  const statTotalEl = document.getElementById('posters-stat-total');
  const statLocalEl = document.getElementById('posters-stat-local');
  const statMissingEl = document.getElementById('posters-stat-missing');
  const statSessionEl = document.getElementById('posters-stat-session');

  const consoleLogs = document.getElementById('posters-console-logs');
  const galleryGrid = document.getElementById('posters-gallery-grid');
  const galleryCountEl = document.getElementById('posters-gallery-count');

  const btnFilterSession = document.getElementById('btn-gallery-filter-session');
  const btnFilterAll = document.getElementById('btn-gallery-filter-all');

  // Navigation handlers
  if (btnMenuPosters) btnMenuPosters.addEventListener('click', () => navigateTo(VIEWS.POSTERS));
  if (btnPostersBack) btnPostersBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));

  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.POSTERS) {
      checkStatus();
    }
  });

  // Filter Buttons
  if (btnFilterSession) {
    btnFilterSession.addEventListener('click', () => {
      galleryFilter = 'session';
      btnFilterSession.classList.add('active');
      if (btnFilterAll) btnFilterAll.classList.remove('active');
      renderGallery();
    });
  }

  if (btnFilterAll) {
    btnFilterAll.addEventListener('click', () => {
      galleryFilter = 'all';
      btnFilterAll.classList.add('active');
      if (btnFilterSession) btnFilterSession.classList.remove('active');
      renderGallery();
    });
  }

  // Clear Console
  if (btnClearConsole && consoleLogs) {
    btnClearConsole.addEventListener('click', () => {
      consoleLogs.innerHTML = '';
    });
  }

  // Start Batch (100)
  if (btnStartBatch) {
    btnStartBatch.addEventListener('click', () => {
      startDownload(100);
    });
  }

  // Start All Missing
  if (btnStartAll) {
    btnStartAll.addEventListener('click', () => {
      startDownload(0);
    });
  }

  // Stop Downloader
  if (btnStop) {
    btnStop.addEventListener('click', async () => {
      appendLog('Надсилання сигналу зупинки завантажувача...', 'warn');
      try {
        await fetch('/api/posters/stop', { method: 'POST' });
        btnStop.disabled = true;
      } catch (err) {
        appendLog('Помилка при зупинці: ' + err, 'error');
      }
    });
  }

  // Rebuild Catalog
  if (btnSyncCatalog) {
    btnSyncCatalog.addEventListener('click', async () => {
      appendLog('Перебудова каталогу data/catalog.js...', 'info');
      try {
        const resp = await fetch('/api/catalog/rebuild', { method: 'POST' });
        if (resp.ok) {
          appendLog('Каталог успішно синхронізовано з локальними постерами! Перезавантаження...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          appendLog('Помилка при оновленні каталогу.', 'error');
        }
      } catch {
        appendLog('Локальний сервер не відповідає.', 'warn');
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
      const res = await fetch('/api/posters/status');
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

  async function startDownload(limit = 100) {
    lastLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    const desc = limit === 0 ? 'всіх відсутніх постерів' : `порції з ${limit} постерів`;
    appendLog(`Запуск завантаження ${desc}...`, 'info');

    if (btnStop) btnStop.disabled = false;
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Завантаження триває...';

    try {
      const res = await fetch('/api/posters/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit })
      });

      if (res.ok) {
        appendLog('Завдання прийнято сервером.', 'success');
        startPolling();
      } else {
        const err = await res.text();
        appendLog(`Помилка: ${err}`, 'error');
        if (statusIndicator) statusIndicator.classList.remove('running');
        if (btnStop) btnStop.disabled = true;
      }
    } catch {
      appendLog('Сервер недоступний. Запустіть «python server.py».', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (btnStop) btnStop.disabled = true;
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/posters/status');
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);

        if (!data.is_running) {
          clearInterval(pollTimer);
          pollTimer = null;
          if (statusIndicator) statusIndicator.classList.remove('running');
          if (statusText) statusText.textContent = data.status === 'completed' ? 'Завершено' : 'Зупинено';
          if (btnStop) btnStop.disabled = true;
          appendLog(data.message || 'Процес завантаження завершено.', 'success');
        }
      } catch {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  }

  function updateUI(data) {
    const total = data.total_topics || 4150;
    const local = data.total_local || 0;
    const missing = data.total_missing !== undefined ? data.total_missing : (total - local);
    const session = data.session_downloaded || 0;

    if (statTotalEl) statTotalEl.textContent = total.toLocaleString('uk-UA');
    if (statLocalEl) statLocalEl.textContent = local.toLocaleString('uk-UA');
    if (statMissingEl) statMissingEl.textContent = missing.toLocaleString('uk-UA');
    if (statSessionEl) statSessionEl.textContent = session.toLocaleString('uk-UA');

    const pct = total > 0 ? Math.min(100, Math.round((local / total) * 100)) : 0;
    if (progressPctEl) progressPctEl.textContent = `${pct}%`;
    if (progressBarFill) progressBarFill.style.width = `${pct}%`;

    if (data.is_running) {
      if (statusIndicator) statusIndicator.classList.add('running');
      if (statusText) statusText.textContent = data.message || 'Завантаження триває...';
      if (btnStop) btnStop.disabled = false;
    }

    // Append logs
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

    // Update gallery items
    if (data.recent_downloaded) {
      cachedRecentItems = data.recent_downloaded;
      // Also update in-memory catalog items
      for (const item of cachedRecentItems) {
        const found = (window.TOLOKA_CATALOG?.titles || []).find(t => t.id === Number(item.topic_id));
        if (found) {
          found.local_poster = item.local_url;
        }
      }
      renderGallery();
    }
  }

  function renderGallery() {
    if (!galleryGrid) return;

    let itemsToDisplay = [];
    if (galleryFilter === 'session') {
      itemsToDisplay = cachedRecentItems;
    } else {
      // Gather all titles that currently have local_poster
      const allTitles = (window.TOLOKA_CATALOG?.titles || []).filter(t => t.local_poster);
      itemsToDisplay = allTitles.map(t => ({
        topic_id: t.id,
        title: t.title_ua || t.raw_title,
        local_url: t.local_poster,
        file_size_kb: 'Локальний файл',
        time: t.year ? String(t.year) : ''
      }));
    }

    if (galleryCountEl) {
      galleryCountEl.textContent = itemsToDisplay.length.toLocaleString('uk-UA');
    }

    if (itemsToDisplay.length === 0) {
      galleryGrid.innerHTML = `
        <div class="parser-empty-msg">
          ${galleryFilter === 'session' 
            ? 'У цій сесії ще немає завантажених постерів. Натисніть «Завантажити порцію», щоб розпочати.' 
            : 'Локальних постерів на диску ще немає.'}
        </div>
      `;
      return;
    }

    galleryGrid.innerHTML = '';
    for (const item of itemsToDisplay) {
      const card = document.createElement('div');
      card.className = 'posters-gallery-item';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.title = item.title;

      card.innerHTML = `
        <div class="gallery-poster-wrap">
          <span class="gallery-badge-top-left">#${item.topic_id}</span>
          ${item.file_size_kb ? `<span class="gallery-badge-top-right">${escapeHtml(item.file_size_kb)}</span>` : ''}
          <img 
            class="gallery-poster-img" 
            src="${escapeHtml(item.local_url)}" 
            alt="${escapeHtml(item.title)}"
            loading="lazy"
            onerror="this.src='${getSvgPlaceholder(item.title)}'"
          />
          <div class="gallery-hover-action">
            <button type="button" class="gallery-btn-view" data-topic-id="${item.topic_id}" title="Швидкий перегляд тайтлу">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Перегляд</span>
            </button>
          </div>
        </div>
        <div class="gallery-info">
          <div class="gallery-title">${escapeHtml(item.title)}</div>
          <div class="gallery-meta">
            <span>#${item.topic_id}</span>
            <span>${item.time || 'щойно'}</span>
          </div>
        </div>
      `;

      // Open Modal on Card Click
      card.addEventListener('click', () => {
        openModalForTopic(item.topic_id, item);
      });

      // Quick View button click
      const btnView = card.querySelector('.gallery-btn-view');
      if (btnView) {
        btnView.addEventListener('click', (e) => {
          e.stopPropagation();
          openModalForTopic(item.topic_id, item);
        });
      }

      galleryGrid.appendChild(card);
    }
  }

  function openModalForTopic(topicId, item) {
    const tid = Number(topicId);
    const existingTitle = (window.TOLOKA_CATALOG?.titles || []).find(t => t.id === tid);
    if (existingTitle) {
      if (item && item.local_url) {
        existingTitle.local_poster = item.local_url;
      }
      openTitleModal(existingTitle);
    } else {
      const tempTitle = {
        id: tid,
        title_ua: item.title,
        title_orig: '',
        year: new Date().getFullYear(),
        type: 'tv',
        quality: 'HD',
        episodes: null,
        duration: null,
        studio: '',
        director: '',
        country: 'Японія',
        poster: item.local_url || '',
        local_poster: item.local_url || null,
        genres: [],
        synopsis: 'Тайтл із завантаженим локальним постером.',
        url: `https://toloka.to/t${tid}`,
        download_url: '',
        external_ids: {},
        where_to_watch: [],
        teams: []
      };
      openTitleModal(tempTitle);
    }
  }
}
