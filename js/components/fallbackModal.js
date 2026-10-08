/**
 * Fallback JSON Generator Modal Component
 * Manages backup generation (Full & Lite), status monitoring, and fallback file download.
 */

let modalEl = null;
let isGenerating = false;
let selectedFormat = 'lite'; // 'lite' | 'full' | 'both'

export function initFallbackModal() {
  modalEl = document.getElementById('fallback-modal');
  const btnMenuFallback = document.getElementById('btn-menu-fallback');
  const btnClose = document.getElementById('btn-close-fallback-modal');
  const btnCloseBottom = document.getElementById('btn-close-fallback-modal-bottom');
  const btnGenerate = document.getElementById('btn-generate-fallback-json');
  const btnDownloadLite = document.getElementById('btn-download-fallback-lite');
  const btnDownloadFull = document.getElementById('btn-download-fallback-full');
  const toolsDropdown = document.getElementById('header-tools-dropdown');
  const btnToolsTrigger = document.getElementById('btn-tools-trigger');
  const formatOptionsWrap = document.getElementById('fallback-format-options');

  if (btnMenuFallback) {
    btnMenuFallback.addEventListener('click', () => {
      if (toolsDropdown) {
        toolsDropdown.classList.remove('open');
      }
      if (btnToolsTrigger) {
        btnToolsTrigger.setAttribute('aria-expanded', 'false');
      }
      openFallbackModal();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', closeFallbackModal);
  }

  if (btnCloseBottom) {
    btnCloseBottom.addEventListener('click', closeFallbackModal);
  }

  if (modalEl) {
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        closeFallbackModal();
      }
    });

    modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !isGenerating) {
        closeFallbackModal();
      }
    });
  }

  // Format Selector pills
  if (formatOptionsWrap) {
    const pills = formatOptionsWrap.querySelectorAll('.fallback-format-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        selectedFormat = pill.dataset.format || 'lite';
        updateGenerateButtonLabel();
      });
    });
  }

  if (btnGenerate) {
    btnGenerate.addEventListener('click', handleGenerateFallback);
  }

  if (btnDownloadLite) {
    btnDownloadLite.addEventListener('click', () => handleDownloadFile('catalog_fallback_lite.json'));
  }

  if (btnDownloadFull) {
    btnDownloadFull.addEventListener('click', () => handleDownloadFile('catalog_fallback.json'));
  }
}

function updateGenerateButtonLabel() {
  const labelEl = document.getElementById('btn-generate-fallback-label');
  if (!labelEl) return;
  if (selectedFormat === 'lite') {
    labelEl.textContent = 'Сформувати Lite фолбек';
  } else if (selectedFormat === 'full') {
    labelEl.textContent = 'Сформувати Full фолбек';
  } else {
    labelEl.textContent = 'Сформувати обидва фолбеки';
  }
}

export async function openFallbackModal() {
  if (!modalEl) {
    modalEl = document.getElementById('fallback-modal');
  }
  if (!modalEl) return;

  if (typeof modalEl.showModal === 'function') {
    modalEl.showModal();
  } else {
    modalEl.setAttribute('open', '');
  }

  updateGenerateButtonLabel();
  await refreshFallbackStatus({ preserveLog: false });
}

export function closeFallbackModal() {
  if (!modalEl) return;
  if (typeof modalEl.close === 'function') {
    modalEl.close();
  } else {
    modalEl.removeAttribute('open');
  }
}

async function refreshFallbackStatus({ preserveLog = false } = {}) {
  const dbCountEl = document.getElementById('fallback-stat-db-count');
  const dbSizeEl = document.getElementById('fallback-stat-db-size');

  // Lite elements
  const liteBadge = document.getElementById('fallback-stat-lite-badge');
  const liteCountEl = document.getElementById('fallback-stat-lite-count');
  const liteSizeEl = document.getElementById('fallback-stat-lite-size');
  const liteUpdatedEl = document.getElementById('fallback-stat-lite-updated');

  // Full elements
  const fullBadge = document.getElementById('fallback-stat-full-badge');
  const fullCountEl = document.getElementById('fallback-stat-full-count');
  const fullSizeEl = document.getElementById('fallback-stat-full-size');
  const fullUpdatedEl = document.getElementById('fallback-stat-full-updated');

  // Download buttons
  const btnDownloadLite = document.getElementById('btn-download-fallback-lite');
  const btnDownloadFull = document.getElementById('btn-download-fallback-full');
  const logBox = document.getElementById('fallback-log-box');

  try {
    const res = await fetch('/api/fallback/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // DB stats
    if (dbCountEl) {
      dbCountEl.textContent = data.db_count ? Number(data.db_count).toLocaleString('uk-UA') : '—';
    }
    if (dbSizeEl) {
      dbSizeEl.textContent = data.db_size_mb ? `${data.db_size_mb} МБ` : '—';
    }

    const liteInfo = data.lite || {};
    const fullInfo = data.full || {};

    // Lite stats
    if (liteBadge) {
      if (liteInfo.exists) {
        liteBadge.textContent = 'Готовий';
        liteBadge.className = 'fallback-status-badge ready';
      } else {
        liteBadge.textContent = 'Відсутній';
        liteBadge.className = 'fallback-status-badge missing';
      }
    }
    if (liteCountEl) {
      liteCountEl.textContent = liteInfo.titles_count ? Number(liteInfo.titles_count).toLocaleString('uk-UA') : (liteInfo.exists ? '0' : '—');
    }
    if (liteSizeEl) {
      liteSizeEl.textContent = liteInfo.size_mb ? `${liteInfo.size_mb} МБ` : (liteInfo.exists ? '0 МБ' : '—');
    }
    if (liteUpdatedEl) {
      liteUpdatedEl.textContent = liteInfo.updated_at || '—';
    }

    // Full stats
    if (fullBadge) {
      if (fullInfo.exists) {
        fullBadge.textContent = 'Готовий';
        fullBadge.className = 'fallback-status-badge ready';
      } else {
        fullBadge.textContent = 'Відсутній';
        fullBadge.className = 'fallback-status-badge missing';
      }
    }
    if (fullCountEl) {
      fullCountEl.textContent = fullInfo.titles_count ? Number(fullInfo.titles_count).toLocaleString('uk-UA') : (fullInfo.exists ? '0' : '—');
    }
    if (fullSizeEl) {
      fullSizeEl.textContent = fullInfo.size_mb ? `${fullInfo.size_mb} МБ` : (fullInfo.exists ? '0 МБ' : '—');
    }
    if (fullUpdatedEl) {
      fullUpdatedEl.textContent = fullInfo.updated_at || '—';
    }

    // Enable/disable download buttons
    if (btnDownloadLite) {
      btnDownloadLite.disabled = !liteInfo.exists;
    }
    if (btnDownloadFull) {
      btnDownloadFull.disabled = !fullInfo.exists;
    }

    // Update log only if NOT explicitly preserved
    if (logBox && !isGenerating && !preserveLog) {
      if (liteInfo.exists || fullInfo.exists) {
        const parts = [];
        if (liteInfo.exists) parts.push(`Lite: ${liteInfo.size_mb} МБ (${liteInfo.updated_at})`);
        if (fullInfo.exists) parts.push(`Full: ${fullInfo.size_mb} МБ (${fullInfo.updated_at})`);
        logBox.textContent = `Знайдено резервні файли:\n• ${parts.join('\n• ')}\nВиберіть потрібний формат та натисніть «Сформувати...» для оновлення.`;
        logBox.className = 'fallback-log-box idle';
      } else {
        logBox.textContent = 'Файли фолбеку ще не сформовано.\nВиберіть формат та натисніть кнопку створення.';
        logBox.className = 'fallback-log-box idle';
      }
    }
  } catch (err) {
    console.error('Failed to get fallback status:', err);
    if (logBox && !isGenerating && !preserveLog) {
      logBox.textContent = `Помилка отримання статусу: ${err.message}`;
      logBox.className = 'fallback-log-box error';
    }
  }
}

async function handleGenerateFallback() {
  if (isGenerating) return;

  const btnGenerate = document.getElementById('btn-generate-fallback-json');
  const btnDownloadLite = document.getElementById('btn-download-fallback-lite');
  const btnDownloadFull = document.getElementById('btn-download-fallback-full');
  const logBox = document.getElementById('fallback-log-box');

  isGenerating = true;
  if (btnGenerate) {
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = `
      <span class="fallback-btn-spinner"></span>
      <span>Формування (${selectedFormat.toUpperCase()})...</span>
    `;
  }
  if (btnDownloadLite) btnDownloadLite.disabled = true;
  if (btnDownloadFull) btnDownloadFull.disabled = true;

  if (logBox) {
    logBox.textContent = `Зчитування бази toloka.db та генерація фолбеку [режим: ${selectedFormat}]...\nБудь ласка, зачекайте.`;
    logBox.className = 'fallback-log-box idle';
  }

  let wasSuccess = false;
  try {
    const res = await fetch('/api/fallback/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: selectedFormat })
    });

    const result = await res.json();

    if (result.success) {
      wasSuccess = true;
      if (logBox) {
        const outLines = [];
        outLines.push(`[✓] Успішно сформовано JSON фолбек (${selectedFormat.toUpperCase()})!`);
        if (result.lite && result.lite.size_mb) {
          outLines.push(`• Lite файл: data/catalog_fallback_lite.json (${result.lite.size_mb} МБ)`);
        }
        if (result.full && result.full.size_mb) {
          outLines.push(`• Full файл: data/catalog_fallback.json (${result.full.size_mb} МБ)`);
        }
        outLines.push(`• Кількість тайтлів: ${Number(result.titles_count || 4152).toLocaleString('uk-UA')}`);
        outLines.push(`• Час: ${result.updated_at || new Date().toLocaleTimeString('uk-UA')}`);
        logBox.textContent = outLines.join('\n');
        logBox.className = 'fallback-log-box success';
      }
    } else {
      throw new Error(result.error || 'Не вдалося створити файл фолбеку');
    }
  } catch (err) {
    console.error('Error generating fallback:', err);
    if (logBox) {
      logBox.textContent = `[✗] Помилка формування: ${err.message}`;
      logBox.className = 'fallback-log-box error';
    }
  } finally {
    isGenerating = false;
    if (btnGenerate) {
      btnGenerate.disabled = false;
      btnGenerate.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span id="btn-generate-fallback-label"></span>
      `;
      updateGenerateButtonLabel();
    }
    // Refresh status cards but PRESERVE the log message so it does not disappear!
    await refreshFallbackStatus({ preserveLog: wasSuccess });
  }
}

function handleDownloadFile(fileName) {
  const link = document.createElement('a');
  link.href = `/data/${fileName}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
