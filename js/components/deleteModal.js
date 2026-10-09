/**
 * Delete Title by ID Modal Component
 */
import { state } from '../state.js';
import { escapeHtml, getSvgPlaceholder, debounce } from '../utils.js';

let modalEl = null;
let currentFoundTitle = null;

export function initDeleteModal() {
  modalEl = document.getElementById('delete-title-modal');
  if (!modalEl) return;

  const btnMenuDelete = document.getElementById('btn-menu-delete-id');
  const btnClose = document.getElementById('btn-close-delete-id-modal');
  const btnCancel = document.getElementById('btn-cancel-delete-id');
  const form = document.getElementById('delete-id-form');
  const inputId = document.getElementById('delete-input-id');
  const btnCheck = document.getElementById('btn-check-delete-id');
  const previewBox = document.getElementById('delete-id-preview');
  const btnConfirm = document.getElementById('btn-confirm-delete-id');

  const toolsDropdown = document.getElementById('header-tools-dropdown');
  const btnToolsTrigger = document.getElementById('btn-tools-trigger');

  if (btnMenuDelete) {
    btnMenuDelete.addEventListener('click', () => {
      if (toolsDropdown) toolsDropdown.classList.remove('open');
      if (btnToolsTrigger) btnToolsTrigger.setAttribute('aria-expanded', 'false');
      openDeleteModal();
    });
  }

  const closeModal = () => {
    modalEl.close();
    resetModal();
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  // Close on backdrop click
  modalEl.addEventListener('click', (e) => {
    const rect = modalEl.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) closeModal();
  });

  const checkId = async () => {
    const rawVal = inputId?.value?.trim();
    if (!rawVal) {
      if (previewBox) {
        previewBox.hidden = true;
        previewBox.innerHTML = '';
      }
      if (btnConfirm) btnConfirm.disabled = true;
      currentFoundTitle = null;
      return;
    }

    const numId = parseInt(rawVal, 10);
    if (isNaN(numId) || numId <= 0) {
      showNotFound('Введіть коректний числовий ID');
      return;
    }

    // 1. Check in-memory catalog
    const catalog = window.TOLOKA_CATALOG?.titles || [];
    let found = catalog.find(t => t.id === numId || String(t.id) === String(numId));

    // 2. If not found in catalog, check backend API
    if (!found) {
      try {
        const res = await fetch(`/api/titles/${numId}`);
        if (res.ok) {
          const apiItem = await res.json();
          if (apiItem && (apiItem.id || apiItem.topic_id)) {
            found = apiItem;
          }
        }
      } catch (err) {
        console.warn('Помилка пошуку тайтлу на сервері:', err);
      }
    }

    if (found) {
      currentFoundTitle = found;
      showPreview(found);
    } else {
      currentFoundTitle = null;
      showNotFound(`Тайтл із ID #${numId} не знайдено в базі даних.`);
    }
  };

  if (btnCheck) btnCheck.addEventListener('click', checkId);
  if (inputId) inputId.addEventListener('input', debounce(checkId, 300));

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawVal = inputId?.value?.trim();
      const numId = rawVal ? parseInt(rawVal, 10) : null;
      if (!numId) return;

      const titleName = currentFoundTitle 
        ? (currentFoundTitle.title_ua || currentFoundTitle.title || currentFoundTitle.title_orig || `#${numId}`)
        : `#${numId}`;

      const ok = window.confirm(`Ви дійсно бажаєте безповоротно видалити тайтл "${titleName}" (ID #${numId}) з бази даних?`);
      if (!ok) return;

      if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.textContent = 'Видалення...';
      }

      try {
        const res = await fetch('/api/titles/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: numId })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          // Remove from in-memory catalog
          if (window.TOLOKA_CATALOG?.titles) {
            const idx = window.TOLOKA_CATALOG.titles.findIndex(t => t.id === numId || String(t.id) === String(numId));
            if (idx !== -1) {
              window.TOLOKA_CATALOG.titles.splice(idx, 1);
            }
          }
          state.notify();
          closeModal();
          showToast(`Тайтл #${numId} успішно видалено з бази даних!`);
        } else {
          alert(`Помилка видалення: ${data.error || 'Невідома помилка'}`);
        }
      } catch (err) {
        alert(`Помилка мережі: ${err.message}`);
      } finally {
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Видалити з бази</span>
          `;
        }
      }
    });
  }

  function showPreview(item) {
    if (!previewBox) return;
    previewBox.hidden = false;
    const poster = item.local_poster || item.poster || getSvgPlaceholder(item.title_ua || 'A');
    const titleUa = escapeHtml(item.title_ua || item.title || `#${item.id}`);
    const titleOrig = item.title_orig ? escapeHtml(item.title_orig) : '';
    const year = item.year ? `<span class="delete-id-preview-badge">${escapeHtml(String(item.year))}</span>` : '';
    const type = item.type ? `<span class="delete-id-preview-badge">${escapeHtml(String(item.type).toUpperCase())}</span>` : '';
    const quality = item.quality ? `<span class="delete-id-preview-badge">${escapeHtml(String(item.quality))}</span>` : '';

    previewBox.innerHTML = `
      <img src="${escapeHtml(poster)}" class="delete-id-preview-poster" alt="Постер" onerror="this.src='${getSvgPlaceholder('A')}'">
      <div class="delete-id-preview-info">
        <div class="delete-id-preview-title">${titleUa}</div>
        ${titleOrig ? `<div class="delete-id-preview-orig">${titleOrig}</div>` : ''}
        <div class="delete-id-preview-meta">
          ${year}
          ${type}
          ${quality}
        </div>
      </div>
    `;
    if (btnConfirm) btnConfirm.disabled = false;
  }

  function showNotFound(msg) {
    if (!previewBox) return;
    previewBox.hidden = false;
    previewBox.innerHTML = `
      <div class="delete-id-preview-notfound">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${escapeHtml(msg)}</span>
      </div>
    `;
    if (btnConfirm) btnConfirm.disabled = true;
  }

  function resetModal() {
    if (form) form.reset();
    if (previewBox) {
      previewBox.hidden = true;
      previewBox.innerHTML = '';
    }
    if (btnConfirm) btnConfirm.disabled = true;
    currentFoundTitle = null;
  }
}

export function openDeleteModal(prefillId = null) {
  if (!modalEl) return;
  modalEl.showModal();
  const inputId = document.getElementById('delete-input-id');
  if (inputId) {
    if (prefillId) {
      inputId.value = prefillId;
      inputId.dispatchEvent(new Event('input'));
    } else {
      inputId.focus();
    }
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
