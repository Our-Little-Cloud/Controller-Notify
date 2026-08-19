const controllerImage = document.getElementById('controllerImage');
const streamTitle = document.getElementById('streamTitle');
const channelName = document.getElementById('channelName');
const progressFill = document.getElementById('progressFill');
const popup = document.getElementById('popup');

const popupCloseBtn = document.getElementById('popupCloseBtn');

let autoHideTimer = null;
let currentVideoId = null;

window.popupApi.onStreamData((data) => {
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
  window.popupApi.sendClickStream(currentVideoId);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.popupApi.sendClosePopup();
  }
});