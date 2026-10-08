/**
 * Title Card Component
 */
import { escapeHtml, getSvgPlaceholder } from '../utils.js';
import { openEditModal } from './editModal.js';

export function renderTitleCard(titleItem) {
  const card = document.createElement('article');
  card.className = 'title-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', titleItem.title_ua || titleItem.raw_title);
  card.dataset.id = titleItem.id;

  const typeLabels = {
    tv: 'Серіал',
    movie: 'Фільм',
    'movie?': 'Фільм?',
    ova: 'OVA',
    ona: 'ONA',
    special: 'Спешл'
  };
  const isGuess = titleItem.type === 'movie?';
  const typeName = typeLabels[titleItem.type] || titleItem.type?.toUpperCase() || 'TV';

  const qualityDisplay = titleItem.quality ? `<span class="poster-badge-quality">${escapeHtml(titleItem.quality.split(' ')[0])}</span>` : '';
  const subDisplay = titleItem.has_sub ? `<span class="poster-badge-sub" title="Наявні субтитри">SUB</span>` : '';

  // Voc Teams Badge for bottom-right corner of poster
  const vocTeamsList = titleItem.voc_teams || titleItem.teams || [];
  const vocTeamsText = vocTeamsList.length > 0 
    ? (vocTeamsList[0] + (vocTeamsList.length > 1 ? ` +${vocTeamsList.length - 1}` : ''))
    : '';
  const vocTeamsBadge = vocTeamsText 
    ? `<span class="poster-badge-bottom-right poster-badge-voc-team" title="${escapeHtml(vocTeamsList.join(', '))}">${escapeHtml(vocTeamsText)}</span>`
    : '';

  // Uploader for footer
  const uploaderText = (titleItem.uploader || '').trim();

  const primaryPoster = titleItem.local_poster || titleItem.poster || getSvgPlaceholder(titleItem.title_ua);

  card.innerHTML = `
    <div class="card-poster-wrapper">
      <div class="poster-badges-top-left">
        ${qualityDisplay}
        ${titleItem.seeders ? `<span class="poster-badge-seeders" title="Роздають: ${titleItem.seeders}">▲ ${titleItem.seeders}</span>` : ''}
      </div>
      <button type="button" class="card-edit-btn" title="Редагувати тайтл" aria-label="Редагувати">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <div class="poster-badges-bottom-left">
        ${subDisplay}
      </div>
      ${vocTeamsBadge}
      <img 
        class="card-poster-img" 
        src="${escapeHtml(primaryPoster)}" 
        alt="${escapeHtml(titleItem.title_ua)}"
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
      />
    </div>
    <div class="card-content">
      <h3 class="card-title-ua" title="${escapeHtml(titleItem.title_ua)}">${escapeHtml(titleItem.title_ua)}</h3>
      ${titleItem.title_orig ? `<div class="card-title-orig" title="${escapeHtml(titleItem.title_orig)}">${escapeHtml(titleItem.title_orig)}</div>` : ''}
      <div class="card-specs">
        <span class="card-spec-type${isGuess ? ' type-guess' : ''}" title="${isGuess ? 'Тривалість > 50 хв — можливо фільм' : ''}">${escapeHtml(typeName)}</span>
        ${titleItem.part ? `<span class="card-spec-part">${escapeHtml(titleItem.part)}</span>` : ''}
        ${titleItem.year ? `<span class="card-spec-year">${titleItem.year}</span>` : ''}
        ${titleItem.episodes ? `<span class="card-spec-eps" title="${titleItem.total_episodes && titleItem.total_episodes > titleItem.episodes ? `Наявні ${titleItem.episodes} з ${titleItem.total_episodes} серій` : `Серій: ${titleItem.episodes}`}">${titleItem.total_episodes && titleItem.total_episodes > titleItem.episodes ? `${titleItem.episodes}/${titleItem.total_episodes} еп.` : `${titleItem.episodes} еп.`}</span>` : ''}
      </div>
      <div class="card-meta-footer">
        <span class="card-dub-team" title="${escapeHtml(uploaderText || 'Без автора')}">${escapeHtml(uploaderText || '')}</span>
        <span class="card-topic-id" title="Клікніть, щоб скопіювати ID">#${titleItem.id}</span>
      </div>
    </div>
  `;

  const img = card.querySelector('.card-poster-img');
  const onLoaded = () => {
    img.classList.add('loaded');
  };
  const onError = () => {
    // If local poster failed, fallback to remote poster first
    if (titleItem.local_poster && img.src.includes(titleItem.local_poster) && titleItem.poster) {
      img.src = titleItem.poster;
    } else {
      img.src = getSvgPlaceholder(titleItem.title_ua);
      img.classList.add('loaded');
    }
  };

  if (img.complete) {
    if (img.naturalWidth > 0) {
      onLoaded();
    } else {
      onError();
    }
  } else {
    img.addEventListener('load', onLoaded, { once: true });
    img.addEventListener('error', onError, { once: true });
  }

  // Edit button click
  const editBtn = card.querySelector('.card-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(titleItem);
    });
  }

  // Handle enter key accessibility
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      card.click();
    }
  });

  // Copy Topic ID on click
  const idEl = card.querySelector('.card-topic-id');
  if (idEl) {
    idEl.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(String(titleItem.id)).then(() => {
        idEl.classList.add('copied');
        setTimeout(() => idEl.classList.remove('copied'), 1400);
      }).catch(() => {
        idEl.classList.add('copied');
        setTimeout(() => idEl.classList.remove('copied'), 1400);
      });
    });
  }

  return card;
}
