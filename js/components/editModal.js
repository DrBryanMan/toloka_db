/**
 * Title Edit Modal Component
 */
import { state } from '../state.js';
import { showToast } from '../utils.js';

let editModalEl = null;
let currentItem = null;
let currentOnSave = null;

export function initEditModal() {
  editModalEl = document.getElementById('edit-title-modal');
  if (!editModalEl) return;

  const closeBtn = document.getElementById('btn-close-edit-modal');
  const cancelBtn = document.getElementById('btn-cancel-edit');
  const form = document.getElementById('edit-title-form');

  const closeModal = () => {
    currentOnSave = null;
    editModalEl.close();
  };

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  editModalEl.addEventListener('cancel', () => {
    currentOnSave = null;
  });

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
      const onSaveCallback = currentOnSave;
      closeModal();
      showToast('Тайтл успішно оновлено!');
      if (typeof onSaveCallback === 'function') {
        onSaveCallback(currentItem);
      }
    });
  }

  // Handle Fetch Hikka Data
  const fetchHikkaBtn = document.getElementById('btn-edit-fetch-hikka');
  if (fetchHikkaBtn) {
    fetchHikkaBtn.addEventListener('click', async () => {
      if (!currentItem || !currentItem.id) return;
      fetchHikkaBtn.disabled = true;
      const originalHtml = fetchHikkaBtn.innerHTML;
      fetchHikkaBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span>Підтягування...</span>
      `;

      try {
        const res = await fetch('/api/hikka/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentItem.id })
        });
        const data = await res.json();

        if (data.success && data.updated) {
          const enriched = data.data || {};
          let updatedCount = 0;

          const applyVal = (elName, val) => {
            if (!val) return;
            const el = form.elements[elName];
            if (el) {
              const currentVal = el.value.trim();
              const newVal = String(val).trim();
              if (!currentVal || currentVal !== newVal) {
                el.value = val;
                el.classList.add('is-changed');
                updatedCount++;
              }
            }
          };

          if (enriched.director) applyVal('director', enriched.director);
          if (enriched.studio) applyVal('studio', enriched.studio);
          if (enriched.country) applyVal('country', enriched.country);
          if (enriched.synopsis) applyVal('synopsis', enriched.synopsis);
          if (enriched.genres && enriched.genres.length > 0) {
            applyVal('genres', enriched.genres.join(', '));
          }

          const fieldsMsg = data.fields_enriched ? data.fields_enriched.join(', ') : 'поля';
          showToast(`Підтягнуто з Hikka: ${fieldsMsg}`);

          fetchHikkaBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>Підтягнуто!</span>
          `;
          setTimeout(() => {
            fetchHikkaBtn.innerHTML = originalHtml;
            fetchHikkaBtn.disabled = false;
          }, 2000);
        } else {
          showToast(data.message || 'Нових даних на Hikka не знайдено');
          fetchHikkaBtn.innerHTML = originalHtml;
          fetchHikkaBtn.disabled = false;
        }
      } catch (err) {
        console.error('Помилка підтягування з Hikka:', err);
        showToast('Помилка запиту до сервера');
        fetchHikkaBtn.innerHTML = originalHtml;
        fetchHikkaBtn.disabled = false;
      }
    });
  }

  // Handle Delete Title button
  const deleteBtn = document.getElementById('btn-edit-delete-title');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!currentItem) return;
      const titleName = currentItem.title_ua || currentItem.title_orig || `#${currentItem.id}`;
      const confirmed = window.confirm(`Ви дійсно бажаєте видалити тайтл "${titleName}" (ID #${currentItem.id}) з бази даних?\n\nЦю дію неможливо скасувати!`);
      if (!confirmed) return;

      deleteBtn.disabled = true;
      const originalHtml = deleteBtn.innerHTML;
      deleteBtn.textContent = 'Видалення...';

      try {
        const res = await fetch('/api/titles/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentItem.id })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const idToDelete = currentItem.id;
          if (window.TOLOKA_CATALOG?.titles) {
            const idx = window.TOLOKA_CATALOG.titles.findIndex(t => t.id === idToDelete || String(t.id) === String(idToDelete));
            if (idx !== -1) {
              window.TOLOKA_CATALOG.titles.splice(idx, 1);
            }
          }
          currentOnSave = null;
          closeModal();
          state.notify();
          showToast(`Тайтл #${idToDelete} успішно видалено з бази!`);
        } else {
          alert(`Помилка видалення: ${data.error || 'Невідома помилка'}`);
        }
      } catch (err) {
        alert(`Помилка запиту до сервера: ${err.message}`);
      } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalHtml;
      }
    });
  }
}

export function openEditModal(titleItem, options = {}) {
  if (!editModalEl || !titleItem) return;
  currentItem = titleItem;
  currentOnSave = typeof options === 'function' ? options : (options.onSave || null);

  const form = document.getElementById('edit-title-form');
  if (!form) return;

  // Clear any existing change highlights
  form.querySelectorAll('.is-changed').forEach(el => el.classList.remove('is-changed'));

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
