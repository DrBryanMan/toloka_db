import { navigateTo, onRouteChanged, VIEWS } from '../router.js';
import { openTitleModal } from './modal.js';

let pollTimer = null;
let lastLogId = 0;
let cachedItems = [];
let currentFilter = 'new'; // 'new' | 'all'

export function initParserView() {
  const btnNavParser = document.getElementById('btn-nav-parser');
  const btnParserBack = document.getElementById('btn-parser-back');
  const btnBrandHome = document.getElementById('btn-brand-home');

  const btnStartParse = document.getElementById('btn-start-parse');
  const btnSyncCatalog = document.getElementById('btn-sync-catalog');
  const btnClearConsole = document.getElementById('btn-clear-console');
  const pagesSelect = document.getElementById('parser-pages-select');

  const statusIndicator = document.getElementById('parser-status-indicator');
  const statusText = document.getElementById('parser-status-text');
  const scrapedCountEl = document.getElementById('parser-scraped-count');
  const newCountEl = document.getElementById('parser-new-count');
  const consoleLogs = document.getElementById('parser-console-logs');
  const resultsGrid = document.getElementById('parser-results-grid');

  // Enrichment controls
  const btnEnrichReleases = document.getElementById('btn-enrich-releases');
  const enrichCountSelect = document.getElementById('parser-enrich-count');
  const incompleteCountEl = document.getElementById('parser-incomplete-count');

  // Filter Pills
  const btnFilterNew = document.getElementById('btn-filter-new');
  const btnFilterAll = document.getElementById('btn-filter-all');
  const badgeFilterNew = document.getElementById('badge-filter-new');
  const badgeFilterAll = document.getElementById('badge-filter-all');

  // Login Modal elements
  const loginModal = document.getElementById('toloka-login-modal');
  const loginForm = document.getElementById('toloka-login-form');
  const btnCloseLogin = document.getElementById('btn-close-login-modal');
  const btnCancelLogin = document.getElementById('btn-cancel-login');

  // Router listener
  onRouteChanged((view) => {
    if (view === VIEWS.PARSER) {
      checkServerStatus();
    }
  });

  // Navigation handlers
  if (btnNavParser) btnNavParser.addEventListener('click', () => navigateTo(VIEWS.PARSER));
  if (btnParserBack) btnParserBack.addEventListener('click', () => navigateTo(VIEWS.CATALOG));
  if (btnBrandHome) btnBrandHome.addEventListener('click', () => navigateTo(VIEWS.CATALOG));

  // Results Filter Toggles
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

  // Clear Console
  if (btnClearConsole && consoleLogs) {
    btnClearConsole.addEventListener('click', () => {
      consoleLogs.innerHTML = '';
    });
  }

  // Login Modal handlers
  if (btnCloseLogin) btnCloseLogin.addEventListener('click', () => loginModal.close());
  if (btnCancelLogin) {
    btnCancelLogin.addEventListener('click', () => {
      loginModal.close();
      startParsingProcess(pagesSelect.value, '', '');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = loginForm.elements['username'].value.trim();
      const password = loginForm.elements['password'].value;
      const remember = loginForm.elements['remember'].checked;

      if (remember) {
        sessionStorage.setItem('toloka_username', username);
        sessionStorage.setItem('toloka_password', password);
      }

      loginModal.close();
      startParsingProcess(pagesSelect.value, username, password);
    });
  }

  // Start Parse Button
  if (btnStartParse) {
    btnStartParse.addEventListener('click', () => {
      const savedUser = sessionStorage.getItem('toloka_username');
      const savedPass = sessionStorage.getItem('toloka_password');

      if (!savedUser && loginModal) {
        loginModal.showModal();
      } else {
        startParsingProcess(pagesSelect.value, savedUser || '', savedPass || '');
      }
    });
  }

  // Enrich Releases Button
  if (btnEnrichReleases) {
    btnEnrichReleases.addEventListener('click', () => {
      const savedUser = sessionStorage.getItem('toloka_username') || '';
      const savedPass = sessionStorage.getItem('toloka_password') || '';
      const count = parseInt(enrichCountSelect?.value || '20', 10);
      startEnrichProcess(count, savedUser, savedPass);
    });
  }

  // Sync Catalog Button
  if (btnSyncCatalog) {
    btnSyncCatalog.addEventListener('click', async () => {
      appendLog('Оновлення індексу каталогу...', 'info');
      try {
        const resp = await fetch('/api/catalog/rebuild', { method: 'POST' });
        if (resp.ok) {
          appendLog('Дані каталогу успішно оновлено! Перезавантаження...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        } else {
          appendLog('Запустіть server.py для автоматичної перебудови data/catalog.js', 'warn');
        }
      } catch (e) {
        appendLog('Для збереження запустіть локальний сервер: python server.py', 'warn');
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

  async function checkServerStatus() {
    try {
      loadIncompleteStats();
      const res = await fetch('/api/parser/status');
      if (res.ok) {
        const data = await res.json();
        updateUI(data);
        if (data.is_running && !pollTimer) {
          startPolling();
        }
      }
    } catch {
      // Server offline
    }
  }

  async function loadIncompleteStats() {
    try {
      const res = await fetch('/api/parser/incomplete-stats');
      if (res.ok) {
        const data = await res.json();
        if (incompleteCountEl) incompleteCountEl.textContent = data.incomplete_count;
      }
    } catch {}
  }

  async function startEnrichProcess(count, username, password) {
    lastLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    cachedItems = [];
    renderResults([]);

    const countLabel = count === 99999 ? 'всі неповні' : `${count} роздач`;
    appendLog(`Запуск збагачення роздач даними (${countLabel})...`, 'info');
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Збагачення триває...';

    try {
      const res = await fetch('/api/parser/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: count,
          username: username,
          password: password,
          incomplete_only: true
        })
      });

      if (res.ok) {
        appendLog('Запит на збагачення прийнято сервером.', 'success');
        startPolling();
      } else {
        const err = await res.text();
        appendLog(`Помилка: ${err}`, 'error');
        if (statusIndicator) statusIndicator.classList.remove('running');
        if (statusText) statusText.textContent = 'Помилка';
      }
    } catch (e) {
      appendLog('Локальний сервер недоступний. Запустіть «python server.py» у терміналі.', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (statusText) statusText.textContent = 'Сервер офлайн';
    }
  }

  async function startParsingProcess(pages, username, password) {
    lastLogId = 0;
    if (consoleLogs) consoleLogs.innerHTML = '';
    cachedItems = [];
    renderResults([]);

    appendLog(`Запуск парсингу Toloka Dub (${pages} стор.)...`, 'info');
    if (statusIndicator) statusIndicator.classList.add('running');
    if (statusText) statusText.textContent = 'Парсинг триває...';

    try {
      const res = await fetch('/api/parser/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pages: pages === 'all' ? 'all' : parseInt(pages, 10),
          username: username,
          password: password
        })
      });

      if (res.ok) {
        appendLog('Запит на парсинг прийнято сервером.', 'success');
        startPolling();
      } else {
        const err = await res.text();
        appendLog(`Помилка: ${err}`, 'error');
        if (statusIndicator) statusIndicator.classList.remove('running');
        if (statusText) statusText.textContent = 'Помилка';
      }
    } catch (e) {
      appendLog('Локальний сервер API не знайдено. Запустіть «python server.py» у терміналі для живого парсингу.', 'error');
      if (statusIndicator) statusIndicator.classList.remove('running');
      if (statusText) statusText.textContent = 'Сервер офлайн';
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/parser/status');
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);

        if (!data.is_running) {
          clearInterval(pollTimer);
          pollTimer = null;
          if (statusIndicator) statusIndicator.classList.remove('running');
          if (statusText) statusText.textContent = data.status === 'completed' ? 'Завершено' : 'Зупинено';
          appendLog(data.message || 'Парсинг завершено.', 'success');
        }
      } catch {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 1000);
  }

  function updateUI(data) {
    if (scrapedCountEl) scrapedCountEl.textContent = (data.total_scraped || 0).toLocaleString('uk-UA');
    if (newCountEl) newCountEl.textContent = (data.new_items || 0).toLocaleString('uk-UA');

    if (data.is_running) {
      if (statusIndicator) statusIndicator.classList.add('running');
      if (statusText) statusText.textContent = data.message || 'Парсинг триває...';
    }

    // Only append genuinely new logs
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
      updateFilterBadges(cachedItems);
      renderResults(cachedItems);
    }
  }

  function updateFilterBadges(items) {
    const newCount = items.filter(i => i.is_new).length;
    const allCount = items.length;
    if (badgeFilterNew) badgeFilterNew.textContent = newCount;
    if (badgeFilterAll) badgeFilterAll.textContent = allCount;
  }

  function renderResults(items) {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = '';

    if (!items || items.length === 0) {
      resultsGrid.innerHTML = '<div class="parser-empty-msg">Тут з\'являться результати після запуску парсингу.</div>';
      return;
    }

    const displayItems = currentFilter === 'new'
      ? items.filter(i => i.is_new)
      : items;

    if (currentFilter === 'new' && displayItems.length === 0) {
      resultsGrid.innerHTML = `
        <div class="parser-empty-msg">
          <p>Нових роздач не виявлено (усі ${items.length} роздач уже є в базі даних).</p>
          <button type="button" class="btn btn-subtle" id="btn-show-all-inline">Показати всі оброблені (${items.length})</button>
        </div>
      `;
      const btnShowAll = resultsGrid.querySelector('#btn-show-all-inline');
      if (btnShowAll) {
        btnShowAll.addEventListener('click', () => setFilter('all'));
      }
      return;
    }

    for (const item of displayItems) {
      const el = document.createElement('div');
      el.className = 'parser-result-item';

      const badge = item.is_new 
        ? `<span class="parser-badge-new">НОВИЙ</span>` 
        : `<span class="parser-badge-exist">В базі</span>`;

      el.innerHTML = `
        <div class="parser-result-id">#${item.topic_id}</div>
        <div class="parser-result-title">${escapeHtml(item.title)}</div>
        ${badge}
        <div class="parser-result-actions">
          <button type="button" class="parser-btn-view" data-topic-id="${item.topic_id}" title="Швидкий перегляд тайтлу у модальному вікні">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>Перегляд</span>
          </button>
          ${item.url ? `
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-subtle btn-icon" title="Відкрити тему на Toloka">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          ` : ''}
        </div>
      `;

      // Quick View Click Handler
      const btnView = el.querySelector('.parser-btn-view');
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

    if (existingTitle) {
      openTitleModal(existingTitle);
    } else {
      // Synthesize clean title object for newly scraped item
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
        poster: item.poster_url || '',
        genres: [],
        synopsis: 'Нова роздача, знайдена парсером Toloka Dub. Повні дані та опис з\'являться після оновлення індексу каталогу.',
        url: item.url,
        download_url: '',
        external_ids: {},
        where_to_watch: [],
        teams: []
      };
      openTitleModal(tempTitle);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
