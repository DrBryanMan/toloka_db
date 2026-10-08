/**
 * Pagination Component (Matching VOC-ALL Pattern)
 */

export function renderPagination(container, state) {
  const total = state.filteredTitles.length;
  if (!total || total <= 0) {
    container.innerHTML = '';
    return;
  }

  const page = state.currentPage;
  const limit = state.pageSize;
  const total_pages = state.getTotalPages();
  const has_prev = page > 1;
  const has_next = page < total_pages;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  container.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'pagination';
  nav.setAttribute('aria-label', 'Сторінки');

  // Prev button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn pagination-prev';
  prevBtn.disabled = !has_prev;
  prevBtn.setAttribute('aria-label', 'Попередня сторінка');
  prevBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>`;
  prevBtn.addEventListener('click', () => {
    if (has_prev) {
      state.setPage(page - 1);
      scrollToGridTop();
    }
  });

  // Page input
  const pageInput = document.createElement('input');
  pageInput.className = 'pagination-page-input';
  pageInput.type = 'number';
  pageInput.min = '1';
  pageInput.max = String(total_pages);
  pageInput.step = '1';
  pageInput.value = String(page);
  pageInput.title = 'Вкажіть номер сторінки';
  pageInput.setAttribute('aria-label', 'Номер сторінки');

  const clampPage = (val) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return page;
    return Math.min(Math.max(parsed, 1), total_pages);
  };

  const goToInputPage = () => {
    const nextPage = clampPage(pageInput.value);
    pageInput.value = String(nextPage);
    if (nextPage !== page) {
      state.setPage(nextPage);
      scrollToGridTop();
    }
  };

  pageInput.addEventListener('focus', () => {
    pageInput.select();
  });

  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToInputPage();
    }
    if (e.key === 'Escape') {
      pageInput.value = String(page);
      pageInput.blur();
    }
  });

  pageInput.addEventListener('blur', goToInputPage);

  // Info block
  const info = document.createElement('div');
  info.className = 'pagination-info';
  info.innerHTML = `
    <span class="pagination-range-text"><strong>${from.toLocaleString('uk-UA')}–${to.toLocaleString('uk-UA')}</strong> <span class="pagination-sep">/</span> ${total.toLocaleString('uk-UA')} &nbsp;·&nbsp; </span>
    <span>стор.</span>
    <span class="pagination-page-slot"></span>
    <span>з <strong>${total_pages.toLocaleString('uk-UA')}</strong></span>
  `;
  info.querySelector('.pagination-page-slot').appendChild(pageInput);

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn pagination-next';
  nextBtn.disabled = !has_next;
  nextBtn.setAttribute('aria-label', 'Наступна сторінка');
  nextBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>`;
  nextBtn.addEventListener('click', () => {
    if (has_next) {
      state.setPage(page + 1);
      scrollToGridTop();
    }
  });

  nav.append(prevBtn, info, nextBtn);
  container.appendChild(nav);
}

function scrollToGridTop() {
  const grid = document.getElementById('catalog-grid');
  if (grid) {
    const top = grid.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}
