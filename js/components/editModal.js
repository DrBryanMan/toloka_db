/**
 * Title Edit Modal Component
 */
import { state } from '../state.js';

let editModalEl = null;
let currentItem = null;

export function initEditModal() {
  editModalEl = document.getElementById('edit-title-modal');
  if (!editModalEl) return;

  const closeBtn = document.getElementById('btn-close-edit-modal');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const form = document.getElementById('edit-title-form');

  const closeModal = () => editModalEl.close();

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // Close when clicking on backdrop
  editModalEl.addEventListener('click', (e) => {
    const rect = editModalEl.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) closeModal();
  });

  // Handle Form Submit
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentItem) return;

      const formData = new FormData(form);
      const updatedFields = {
        title_ua: (formData.get('title_ua') || '').trim(),
        title_orig: (formData.get('title_orig') || '').trim(),
        year: formData.get('year') ? parseInt(formData.get('year'), 10) : null,
        type: formData.get('type') || 'tv',
        quality: (formData.get('quality') || '').trim(),
        episodes: formData.get('episodes') ? parseInt(formData.get('episodes'), 10) : 1,
        duration: (formData.get('duration') || '').trim(),
        studio: (formData.get('studio') || '').trim(),
        director: (formData.get('director') || '').trim(),
        country: (formData.get('country') || '').trim(),
        poster: (formData.get('poster') || '').trim(),
        genres: (formData.get('genres') || '').split(',').map(g => g.trim().toLowerCase()).filter(Boolean),
        synopsis: (formData.get('synopsis') || '').trim(),
      };

      // 1. Update in-memory item
      Object.assign(currentItem, updatedFields);

      // 2. Persist to server / DB if backend is available
      try {
        await fetch('/api/titles/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentItem.id, ...updatedFields })
        });
      } catch (err) {
        console.warn('Сервер для збереження в БД недоступний, оновлено в сесії:', err);
      }

      // 3. Refresh Catalog Grid
      state.notify();
      closeModal();
      showToast('Тайтл успішно оновлено!');
    });
  }
}

export function openEditModal(titleItem) {
  if (!editModalEl || !titleItem) return;
  currentItem = titleItem;

  const form = document.getElementById('edit-title-form');
  if (!form) return;

  form.elements['id'].value = titleItem.id || '';
  form.elements['title_ua'].value = titleItem.title_ua || '';
  form.elements['title_orig'].value = titleItem.title_orig || '';
  form.elements['year'].value = titleItem.year || '';
  form.elements['type'].value = titleItem.type || 'tv';
  form.elements['quality'].value = titleItem.quality || '';
  form.elements['episodes'].value = titleItem.episodes || 1;
  form.elements['duration'].value = titleItem.duration || '';
  form.elements['studio'].value = titleItem.studio || '';
  form.elements['director'].value = titleItem.director || '';
  form.elements['country'].value = titleItem.country || '';
  form.elements['poster'].value = titleItem.poster || '';
  form.elements['genres'].value = (titleItem.genres || []).join(', ');
  form.elements['synopsis'].value = titleItem.synopsis || '';

  editModalEl.showModal();
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
