const controllerImage = document.getElementById('controllerImage');
const streamTitle = document.getElementById('streamTitle');
const channelName = document.getElementById('channelName');
const progressFill = document.getElementById('progressFill');
const popup = document.getElementById('popup');
const liveBadge = document.querySelector('.live-badge');

const popupCloseBtn = document.getElementById('popupCloseBtn');

let autoHideTimer = null;
let currentVideoId = null;
let currentNotificationType = null;

const savedTheme = localStorage.getItem('appTheme') || 'pink';
document.documentElement.setAttribute('data-theme', savedTheme);

window.popupApi.onStreamData((data) => {
  const activeTheme = data.theme || localStorage.getItem('appTheme') || 'pink';
  document.documentElement.setAttribute('data-theme', activeTheme);
  currentNotificationType = data ? data.type : null;

  if (data.type === 'football') {
    renderFootballPopup(data);
    startProgressAnimation();
    return;
  }

  if (data.videoId) currentVideoId = data.videoId;
  if (data.title) streamTitle.textContent = data.title;
  if (data.channelTitle) channelName.textContent = data.channelTitle;
  
  const customImage = localStorage.getItem('controllerImage');
  if (customImage) {
    controllerImage.classList.add('has-img');
    controllerImage.innerHTML = `<img src="${customImage}" alt="Custom controller">`;
  } else if (data.thumbnail) {
    controllerImage.classList.add('has-img');
    controllerImage.innerHTML = `<img src="${data.thumbnail}" alt="Stream thumbnail">`;
  } else {
    controllerImage.classList.remove('has-img');
    controllerImage.innerHTML = '';
  }
  
  startProgressAnimation();
});

function renderFootballPopup(data) {
  currentVideoId = null;
  controllerImage.classList.remove('has-img');
  controllerImage.innerHTML = '';

  const eventLabel = data.eventType === 'reminder' ? 'STARTS SOON'
    : data.eventType === 'fulltime' ? 'FULL-TIME'
      : data.minute ? `LIVE · ${data.minute}` : 'KICKED OFF';

  if (liveBadge) liveBadge.textContent = `⚽ ${eventLabel}`;
  if (data.reminderMinutes && data.eventType === 'reminder') {
    liveBadge.textContent = `⚽ IN ${data.reminderMinutes} MIN`;
  }

  streamTitle.textContent = `${data.homeName} vs ${data.awayName}`;
  const score = data.scoreHome != null ? ` ${data.scoreHome} - ${data.scoreAway} ` : '';
  channelName.textContent = `${data.competitionCode || 'FOOTBALL'}${score}`;
  channelName.classList.add('football-popup-meta');
}

function startProgressAnimation() {
  const duration = 10000;
  progressFill.style.animation = 'none';
  progressFill.offsetHeight;
  progressFill.style.animation = `progressFill ${duration}ms linear forwards`;
  
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(() => {
    window.popupApi.sendClosePopup();
  }, duration);
}

if (popupCloseBtn) {
  popupCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.popupApi.sendClosePopup();
  });
}

popup.addEventListener('click', (e) => {
  if (e.target.closest('#popupCloseBtn') || e.target.closest('.popup-close-btn')) {
    return;
  }
  window.popupApi.sendClickStream(currentVideoId, currentNotificationType);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.popupApi.sendClosePopup();
  }
});