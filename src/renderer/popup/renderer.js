const controllerImage = document.getElementById('controllerImage');
const streamTitle = document.getElementById('streamTitle');
const channelName = document.getElementById('channelName');
const progressFill = document.getElementById('progressFill');
const popup = document.getElementById('popup');

const popupCloseBtn = document.getElementById('popupCloseBtn');

let autoHideTimer = null;

window.popupApi.onStreamData((data) => {
  if (data.title) streamTitle.textContent = data.title;
  if (data.channelTitle) channelName.textContent = data.channelTitle;
  
  const customImage = localStorage.getItem('controllerImage');
  if (customImage) {
    controllerImage.innerHTML = `<img src="${customImage}" alt="Custom controller">`;
  } else if (data.thumbnail) {
    controllerImage.innerHTML = `<img src="${data.thumbnail}" alt="Stream thumbnail">`;
  } else {
    controllerImage.innerHTML = '';
  }
  
  startProgressAnimation();
});

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
  if (!e.target.closest('.live-badge')) {
    window.popupApi.sendClickStream();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.popupApi.sendClosePopup();
  }
});