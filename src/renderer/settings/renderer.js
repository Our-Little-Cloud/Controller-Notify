const apiKeyInput = document.getElementById('apiKey');
const channelUrlInput = document.getElementById('channelUrl');
const channelIdInput = document.getElementById('channelId');
const themeSelect = document.getElementById('themeSelect');
const popupCornerSelect = document.getElementById('popupCorner');
const autoHideDurationInput = document.getElementById('autoHideDuration');
const controllerImageInput = document.getElementById('controllerImage');
const showNotificationsCheckbox = document.getElementById('showNotifications');
const openInBrowserCheckbox = document.getElementById('openInBrowser');
const launchAtStartupCheckbox = document.getElementById('launchAtStartup');
const testApiBtn = document.getElementById('testApiBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const testResult = document.getElementById('testResult');
const saveResult = document.getElementById('saveResult');
const form = document.getElementById('settingsForm');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const liveStatusContainer = document.getElementById('liveStatusContainer');
const refreshLiveBtn = document.getElementById('refreshLiveBtn');

// Channels tab elements
const addChannelForm = document.getElementById('addChannelForm');
const newChannelInput = document.getElementById('newChannelInput');
const addChannelBtn = document.getElementById('addChannelBtn');
const addChannelResult = document.getElementById('addChannelResult');
const csvDropZone = document.getElementById('csvDropZone');
const csvFileInput = document.getElementById('csvFileInput');
const importResult = document.getElementById('importResult');
const channelsList = document.getElementById('channelsList');
const channelCount = document.getElementById('channelCount');

let isLoading = false;

function applyTheme(theme) {
  const currentTheme = theme || 'pink';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('appTheme', currentTheme);
}

async function loadSettings() {
  try {
    const settings = await window.api.getSettings();
    
    apiKeyInput.value = settings.apiKey || '';
    channelUrlInput.value = settings.channelUrl || '';
    channelIdInput.value = settings.channelId || '';
    if (themeSelect) {
      themeSelect.value = settings.theme || 'pink';
    }
    applyTheme(settings.theme || 'pink');
    popupCornerSelect.value = settings.popupCorner || 'bottom-right';
    autoHideDurationInput.value = (settings.autoHideDuration || 10000) / 1000;
    controllerImageInput.value = settings.controllerImage || '';
    showNotificationsCheckbox.checked = settings.showNotifications !== false;
    openInBrowserCheckbox.checked = settings.openInBrowser !== false;
    launchAtStartupCheckbox.checked = settings.launchAtStartup || false;
    const footballEnabledCheckbox = document.getElementById('footballEnabled');
    if (footballEnabledCheckbox) {
      footballEnabledCheckbox.checked = settings.footballEnabled !== false;
      applyFootballVisibility(settings.footballEnabled !== false);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

const testPopupBtn = document.getElementById('testPopupBtn');
if (testPopupBtn) {
  testPopupBtn.addEventListener('click', async () => {
    const customImg = controllerImageInput ? controllerImageInput.value.trim() : '';
    if (customImg) {
      localStorage.setItem('controllerImage', customImg);
    } else {
      localStorage.removeItem('controllerImage');
    }

    // Auto-save settings first so corner, theme & autoHideDuration take effect immediately for test
    try {
      const selectedTheme = themeSelect ? themeSelect.value : 'pink';
      applyTheme(selectedTheme);
      const currentSettings = {
        apiKey: apiKeyInput.value.trim(),
        channelUrl: channelUrlInput.value.trim(),
        channelId: channelIdInput.value.trim(),
        theme: selectedTheme,
        popupCorner: popupCornerSelect.value,
        autoHideDuration: Math.max(1, parseInt(autoHideDurationInput.value) || 10) * 1000,
        controllerImage: customImg,
        showNotifications: showNotificationsCheckbox.checked,
        openInBrowser: openInBrowserCheckbox.checked,
        launchAtStartup: launchAtStartupCheckbox.checked
      };
      await window.api.saveSettings(currentSettings);
    } catch (e) {
      console.warn('Auto-save before test notification:', e.message);
    }

    if (window.api && typeof window.api.testNotification === 'function') {
      await window.api.testNotification({
        videoId: '0muHFBSiybw',
        title: 'lofi hip hop radio 📚 - beats to relax/study to',
        channelTitle: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/0muHFBSiybw/hqdefault.jpg'
      });
    }
  });
}

// Auto-save on theme, corner or duration change
async function autoSavePopupPreferences() {
  try {
    const selectedTheme = themeSelect ? themeSelect.value : 'pink';
    applyTheme(selectedTheme);
    const currentSettings = {
      apiKey: apiKeyInput.value.trim(),
      channelUrl: channelUrlInput.value.trim(),
      channelId: channelIdInput.value.trim(),
      theme: selectedTheme,
      popupCorner: popupCornerSelect.value,
      autoHideDuration: Math.max(1, parseInt(autoHideDurationInput.value) || 10) * 1000,
      controllerImage: controllerImageInput ? controllerImageInput.value.trim() : '',
      showNotifications: showNotificationsCheckbox.checked,
      openInBrowser: openInBrowserCheckbox.checked,
      launchAtStartup: launchAtStartupCheckbox.checked
    };
    await window.api.saveSettings(currentSettings);
  } catch (e) {
    console.error('Failed to auto-save popup preferences:', e);
  }
}

if (themeSelect) {
  themeSelect.addEventListener('change', autoSavePopupPreferences);
}

if (popupCornerSelect) {
  popupCornerSelect.addEventListener('change', autoSavePopupPreferences);
}

if (autoHideDurationInput) {
  autoHideDurationInput.addEventListener('change', autoSavePopupPreferences);
}

// Listen for notification setting changed from tray menu
if (window.api.onNotificationSettingChanged) {
  window.api.onNotificationSettingChanged((checked) => {
    showNotificationsCheckbox.checked = checked;
  });
}

// Listen for live status broadcast
if (window.api.onLiveStatusUpdated) {
  window.api.onLiveStatusUpdated((statusData) => {
    renderLiveStatus(statusData);
    loadChannels();
  });
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// CHANNELS TAB LOGIC & SEARCH/FILTER
// -------------------------------------------------------------

let allChannels = [];
let searchQuery = '';
let activeFilter = 'all';

const channelSearchInput = document.getElementById('channelSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const filterPills = document.querySelectorAll('.filter-pill');
const filterStatusText = document.getElementById('filterStatusText');
const subTabBtns = document.querySelectorAll('.sub-tab-btn');
const subTabPanels = document.querySelectorAll('.sub-tab-panel');

// Sub-Tab Switching Logic
subTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetSubtab = btn.dataset.subtab;
    subTabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    subTabPanels.forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const targetPanel = document.getElementById(`subtab-${targetSubtab}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      targetPanel.style.display = 'block';
      if (targetSubtab === 'add-import') {
        const newChannelInput = document.getElementById('newChannelInput');
        if (newChannelInput) {
          setTimeout(() => newChannelInput.focus(), 50);
        }
      }
    }
  });
});

function switchToMonitoredSubTab() {
  const monitoredBtn = document.querySelector('.sub-tab-btn[data-subtab="monitored"]');
  if (monitoredBtn) {
    monitoredBtn.click();
  }
}

// Search and Filter Listeners
if (channelSearchInput) {
  channelSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    if (clearSearchBtn) {
      clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    }
    filterAndRenderChannels();
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    searchQuery = '';
    channelSearchInput.value = '';
    clearSearchBtn.style.display = 'none';
    filterAndRenderChannels();
  });
}

const refreshChannelsBtn = document.getElementById('refreshChannelsBtn');
if (refreshChannelsBtn) {
  refreshChannelsBtn.addEventListener('click', async () => {
    refreshChannelsBtn.disabled = true;
    refreshChannelsBtn.textContent = '🔄 Checking...';
    try {
      if (window.api && typeof window.api.checkLiveNow === 'function') {
        await window.api.checkLiveNow();
      }
      await loadChannels();
    } catch (err) {
      console.error('Failed to refresh channels status:', err);
    } finally {
      refreshChannelsBtn.disabled = false;
      refreshChannelsBtn.textContent = '🔄 Refresh Status';
    }
  });
}

filterPills.forEach(pill => {
  pill.addEventListener('click', () => {
    filterPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.dataset.filter || 'all';
    filterAndRenderChannels();
  });
});

async function loadChannels() {
  if (!channelsList) return;
  try {
    if (!window.api || typeof window.api.getChannels !== 'function') {
      channelsList.innerHTML = '<div class="channels-empty">Please restart the app to load channels.</div>';
      return;
    }
    allChannels = (await window.api.getChannels()) || [];
    filterAndRenderChannels();
  } catch (error) {
    console.error('Failed to load channels:', error);
    channelsList.innerHTML = `<div class="channels-empty">Error loading channels: ${escapeHtml(error.message)}<br><small>Please restart Controller Notify</small></div>`;
  }
}

function filterAndRenderChannels() {
  if (!channelsList) return;
  if (!allChannels) allChannels = [];

  if (channelCount) {
    channelCount.textContent = allChannels.length;
  }

  const filtered = allChannels.filter(c => {
    // 1. Text Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (c.title || '').toLowerCase().includes(q);
      const handleMatch = (c.handle || '').toLowerCase().includes(q);
      const idMatch = (c.id || '').toLowerCase().includes(q);
      const urlMatch = (c.url || '').toLowerCase().includes(q);
      if (!titleMatch && !handleMatch && !idMatch && !urlMatch) {
        return false;
      }
    }

    // 2. Status Filter Pills
    if (activeFilter === 'live') return c.isLive;
    if (activeFilter === 'offline') return !c.isLive;
    if (activeFilter === 'enabled') return c.enabled !== false;
    if (activeFilter === 'muted') return c.enabled === false;

    return true; // 'all'
  });

  // Update status summary text
  if (filterStatusText) {
    if (searchQuery || activeFilter !== 'all') {
      filterStatusText.style.display = 'block';
      filterStatusText.textContent = `Showing ${filtered.length} of ${allChannels.length} channel(s)`;
    } else {
      filterStatusText.style.display = 'none';
    }
  }

  renderChannelsList(filtered);
}

function formatChannelUrl(c) {
  if (!c) return 'https://www.youtube.com';
  const url = (c.url || '').trim();
  const handle = (c.handle || '').trim();
  const id = (c.id || '').trim();

  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    return url;
  }
  if (url && url.startsWith('@')) {
    return `https://www.youtube.com/${url}`;
  }
  if (url && (url.startsWith('youtube.com') || url.startsWith('www.youtube.com'))) {
    return `https://${url}`;
  }
  if (handle) {
    return `https://www.youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`;
  }
  if (id && id.startsWith('UC') && id.length === 24) {
    return `https://www.youtube.com/channel/${id}`;
  }
  if (id) {
    return `https://www.youtube.com/${id.startsWith('@') ? id : '@' + id}`;
  }
  return 'https://www.youtube.com';
}

function renderChannelsList(channels) {
  if (!channelsList) return;

  if (!allChannels || allChannels.length === 0) {
    channelsList.innerHTML = `
      <div class="channels-empty">
        No channels added yet.<br>
        Add a streamer handle or import a Google Takeout CSV!
      </div>
    `;
    return;
  }

  if (!channels || channels.length === 0) {
    channelsList.innerHTML = `
      <div class="channels-empty">
        🔍 No channels match your search or status filter.
      </div>
    `;
    return;
  }

  channelsList.innerHTML = channels.map(c => {
    const channelUrl = formatChannelUrl(c);
    return `
    <div class="channel-card ${c.enabled === false ? 'disabled' : ''}" data-channel-id="${escapeHtml(c.id)}" data-channel-url="${escapeHtml(channelUrl)}" title="Click to open channel in browser">
      <div class="channel-card-left" data-action="open-url" data-url="${escapeHtml(channelUrl)}">
        <div class="channel-icon-badge">${c.isLive ? '🔴' : '🎮'}</div>
        <div class="channel-card-info">
          <div class="channel-card-name">
            ${escapeHtml(c.title || c.handle || c.id)}
            ${c.isLive ? '<span class="badge-live-mini">LIVE</span>' : '<span class="badge-offline-mini">Offline</span>'}
          </div>
          <div class="channel-card-handle">${escapeHtml(c.handle || c.url || c.id)}</div>
        </div>
      </div>
      <div class="channel-card-actions">
        <button type="button" class="icon-btn open-url" title="Open Channel in Web Browser" data-action="open-url" data-url="${escapeHtml(channelUrl)}">
          🔗
        </button>
        <button type="button" class="icon-btn ${c.enabled !== false ? 'active-bell' : ''}" title="${c.enabled !== false ? 'Notifications Enabled' : 'Notifications Muted'}" data-action="toggle">
          ${c.enabled !== false ? '🔔' : '🔕'}
        </button>
        <button type="button" class="icon-btn delete" title="Remove Channel" data-action="delete">
          🗑️
        </button>
      </div>
    </div>
  `;
  }).join('');

  // Attach action listeners
  channelsList.querySelectorAll('.channel-card').forEach(card => {
    const id = card.dataset.channelId;
    const url = card.dataset.channelUrl;

    // Card click & chain icon click: open in browser
    card.addEventListener('click', (e) => {
      // If clicked toggle or delete buttons, don't open URL
      if (e.target.closest('[data-action="toggle"]') || e.target.closest('[data-action="delete"]')) {
        return;
      }
      if (url && window.api && typeof window.api.openExternalUrl === 'function') {
        window.api.openExternalUrl(url);
      }
    });

    const toggleBtn = card.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const channel = allChannels.find(c => String(c.id) === String(id));
          const newEnabled = channel ? !channel.enabled : false;
          await window.api.toggleChannel({ channelId: id, enabled: newEnabled });
        } catch (err) {
          console.error('Failed to toggle channel:', err);
        } finally {
          loadChannels();
        }
      });
    }

    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove channel from watchlist?`)) {
          try {
            await window.api.removeChannel(id);
          } catch (err) {
            console.error('Failed to remove channel:', err);
          } finally {
            loadChannels();
          }
        }
      });
    }
  });
}

if (addChannelForm) {
  addChannelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = newChannelInput.value.trim();
    if (!input) return;

    addChannelBtn.disabled = true;
    addChannelBtn.textContent = 'Adding...';
    addChannelResult.style.display = 'none';

    try {
      const res = await window.api.addChannel(input);
      if (res.success) {
        newChannelInput.value = '';
        addChannelResult.textContent = `✅ Channel added!`;
        addChannelResult.className = 'test-result success';
        addChannelResult.style.display = 'block';
        setTimeout(() => { addChannelResult.style.display = 'none'; }, 3000);
        await loadChannels();
        switchToMonitoredSubTab();
      } else {
        addChannelResult.textContent = `❌ ${res.error || 'Failed to add channel'}`;
        addChannelResult.className = 'test-result error';
        addChannelResult.style.display = 'block';
      }
    } catch (err) {
      addChannelResult.textContent = `❌ ${err.message}`;
      addChannelResult.className = 'test-result error';
      addChannelResult.style.display = 'block';
    } finally {
      addChannelBtn.disabled = false;
      addChannelBtn.textContent = 'Add';
    }
  });
}

// CSV Drag and Drop & File Upload
if (csvDropZone && csvFileInput) {
  csvDropZone.addEventListener('click', () => csvFileInput.click());

  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processCsvFile(file);
  });

  csvDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    csvDropZone.classList.add('dragover');
  });

  csvDropZone.addEventListener('dragleave', () => {
    csvDropZone.classList.remove('dragover');
  });

  csvDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    csvDropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processCsvFile(file);
  });
}

function processCsvFile(file) {
  if (!file.name.endsWith('.csv')) {
    importResult.textContent = '❌ Please select a valid .csv file from Google Takeout';
    importResult.className = 'test-result error';
    importResult.style.display = 'block';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const csvContent = e.target.result;
    try {
      const res = await window.api.importSubscriptionsCsv(csvContent);
      if (res.success) {
        importResult.textContent = `✅ Successfully imported ${res.count} channel(s)!`;
        importResult.className = 'test-result success';
        importResult.style.display = 'block';
        await loadChannels();
        switchToMonitoredSubTab();
      } else {
        importResult.textContent = `❌ ${res.error || 'Failed to import CSV'}`;
        importResult.className = 'test-result error';
        importResult.style.display = 'block';
      }
    } catch (err) {
      importResult.textContent = `❌ Import failed: ${err.message}`;
      importResult.className = 'test-result error';
      importResult.style.display = 'block';
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------
// LIVE NOW TAB LOGIC (MULTI-CHANNEL HUB)
// -------------------------------------------------------------

async function loadLiveStatus(forceRefresh = false) {
  if (!liveStatusContainer) return;
  
  if (forceRefresh) {
    refreshLiveBtn.disabled = true;
    refreshLiveBtn.textContent = '🔄 Checking...';
  }
  
  try {
    const statusData = forceRefresh ? await window.api.checkLiveNow() : await window.api.getLiveStatus();
    renderLiveStatus(statusData);
  } catch (error) {
    console.error('Failed to load live status:', error);
    liveStatusContainer.innerHTML = `
      <div class="offline-card">
        <div class="offline-icon">⚠️</div>
        <div class="offline-title">Error Loading Status</div>
        <div class="offline-subtitle">${escapeHtml(error.message)}</div>
        <button type="button" class="btn btn-secondary" onclick="loadLiveStatus(true)">Retry</button>
      </div>
    `;
  } finally {
    if (forceRefresh) {
      refreshLiveBtn.disabled = false;
      refreshLiveBtn.textContent = '🔄 Refresh';
    }
  }
}

function renderLiveStatus(data) {
  if (!liveStatusContainer) return;
  
  const channels = data.channels || [];
  const liveChannels = channels.filter(c => c.isLive && c.currentStream);
  const singleStream = data.streamData;

  // Case 1: No channels configured
  if (channels.length === 0 && !data.channelUrl && !data.channelId) {
    liveStatusContainer.innerHTML = `
      <div class="offline-card">
        <div class="offline-icon">👥</div>
        <div class="offline-title">No Channels Monitored</div>
        <div class="offline-subtitle">Add your favorite streamer handles or import your YouTube subscriptions!</div>
        <button type="button" class="btn btn-primary" id="goToChannelsBtn">➕ Add Channels</button>
      </div>
    `;
    const goToChannelsBtn = document.getElementById('goToChannelsBtn');
    if (goToChannelsBtn) {
      goToChannelsBtn.addEventListener('click', () => {
        document.querySelector('.tab-btn[data-tab="channels"]')?.click();
      });
    }
    return;
  }
  
  // Case 2: One or more channels are LIVE
  if (liveChannels.length > 0 || (data.isLive && singleStream)) {
    const activeStreams = liveChannels.length > 0 ? liveChannels.map(c => c.currentStream) : [singleStream];
    const offlineChannels = channels.filter(c => !c.isLive);

    liveStatusContainer.innerHTML = `
      <div class="live-grid">
        ${activeStreams.map(stream => {
          const startTimeStr = stream.publishedAt ? formatTime(new Date(stream.publishedAt).getTime()) : 'Recently';
          return `
            <div class="live-card is-live">
              <div class="live-header-badge live">Streaming Now</div>
              
              ${stream.thumbnail ? `
                <div class="live-thumbnail-wrapper" data-video-id="${escapeHtml(stream.videoId)}">
                  <img src="${stream.thumbnail}" alt="${escapeHtml(stream.title)}">
                  <div class="live-play-overlay">
                    <div class="live-play-icon">▶</div>
                  </div>
                </div>
              ` : ''}
              
              <div class="live-stream-title">${escapeHtml(stream.title)}</div>
              <div class="live-channel-info">
                <span class="live-channel-name">👾 ${escapeHtml(stream.channelTitle || 'Streamer')}</span>
                <span class="live-time-meta">Started: ${startTimeStr}</span>
              </div>
              
              <button type="button" class="btn btn-primary live-action-btn" data-video-id="${escapeHtml(stream.videoId)}">
                ▶ Watch Live Stream
              </button>
            </div>
          `;
        }).join('')}

        ${offlineChannels.length > 0 ? `
          <div class="offline-streamers-summary">
            <div class="offline-streamers-title">💤 Offline Channels (${offlineChannels.length})</div>
            <div class="offline-streamers-tags">
              ${offlineChannels.map(c => `<span class="streamer-tag">${escapeHtml(c.title || c.handle || c.id)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    // Attach click listeners to watch buttons and thumbnail overlays
    liveStatusContainer.querySelectorAll('[data-video-id]').forEach(el => {
      el.addEventListener('click', () => {
        const vid = el.dataset.videoId;
        window.api.openStreamUrl(vid);
      });
    });
    return;
  }
  
  // Case 3: All channels are offline
  const lastCheckStr = data.lastChecked ? formatTime(data.lastChecked) : 'Just now';
  const totalCount = channels.length || 1;
  
  liveStatusContainer.innerHTML = `
    <div class="offline-card">
      <div class="offline-icon">💤</div>
      <div class="offline-title">All Channels are Offline</div>
      <div class="offline-subtitle">
        Monitoring <strong>${totalCount} channel(s)</strong>.<br>
        None of your watched streamers are live right now.
      </div>
      <div style="font-size: 11px; color: #aaa; margin-bottom: 16px;">
        Last checked: ${lastCheckStr}
      </div>
      <div class="offline-actions">
        <button type="button" class="btn btn-primary" id="offlineRefreshBtn">🔄 Check Status</button>
        <button type="button" class="btn btn-secondary" id="manageChannelsBtn">👥 Manage Channels</button>
      </div>

      ${channels.length > 0 ? `
        <div class="offline-streamers-summary" style="text-align: left;">
          <div class="offline-streamers-title">Watched Streamers:</div>
          <div class="offline-streamers-tags">
            ${channels.map(c => `<span class="streamer-tag">${escapeHtml(c.title || c.handle || c.id)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  const offlineRefreshBtn = document.getElementById('offlineRefreshBtn');
  if (offlineRefreshBtn) {
    offlineRefreshBtn.addEventListener('click', () => loadLiveStatus(true));
  }

  const manageChannelsBtn = document.getElementById('manageChannelsBtn');
  if (manageChannelsBtn) {
    manageChannelsBtn.addEventListener('click', () => {
      document.querySelector('.tab-btn[data-tab="channels"]')?.click();
    });
  }
}

if (refreshLiveBtn) {
  refreshLiveBtn.addEventListener('click', () => {
    loadLiveStatus(true);
  });
}

function showTestResult(message, isError = false) {
  testResult.textContent = message;
  testResult.className = 'test-result ' + (isError ? 'error' : 'success');
  testResult.style.display = 'block';
}

function hideTestResult() {
  testResult.style.display = 'none';
}

function showSaveResult(message, isError = false) {
  saveResult.textContent = message;
  saveResult.className = 'save-result ' + (isError ? 'error' : 'success');
  saveResult.style.display = 'block';
}

function hideSaveResult() {
  saveResult.style.display = 'none';
}

function setLoading(loading) {
  isLoading = loading;
  saveBtn.disabled = loading;
  testApiBtn.disabled = loading;
  saveBtn.querySelector('.btn-text').style.display = loading ? 'none' : 'inline';
  saveBtn.querySelector('.btn-loading').style.display = loading ? 'inline' : 'none';
}

testApiBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const channelUrl = channelUrlInput.value.trim();
  const channelId = channelIdInput.value.trim();
  const targetChannel = channelUrl || channelId;
  
  if (!targetChannel) {
    showTestResult('Please enter a channel URL, @handle, or ID first', true);
    return;
  }
  
  setLoading(true);
  hideTestResult();
  
  try {
    const result = await window.api.testApi({ apiKey, channelId: targetChannel, channelUrl });
    if (result.success) {
      if (result.channelId && !result.channelId.startsWith('http')) {
        channelIdInput.value = result.channelId;
      }
      const warningText = result.warning ? ` (${result.warning})` : '';
      const modeText = apiKey ? 'API Mode' : 'Free 0-Quota Mode';
      showTestResult(`✅ Connected via ${modeText}!${warningText}${result.isLive ? ` — Currently LIVE: "${result.title}"` : ' — Channel is offline'}`, false);
    } else {
      showTestResult(`❌ Test failed: ${result.error}`, true);
    }
  } catch (error) {
    showTestResult(`❌ Test failed: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
});

channelUrlInput.addEventListener('input', () => {
  hideTestResult();
});

channelUrlInput.addEventListener('blur', async () => {
  const apiKey = apiKeyInput.value.trim();
  const channelUrl = channelUrlInput.value.trim();
  
  if (apiKey && channelUrl) {
    try {
      const result = await window.api.resolveChannelId({ apiKey, channelUrl });
      if (result.success && result.channelId) {
        channelIdInput.value = result.channelId;
        showTestResult(`✅ Resolved channel ID: ${result.channelId}`, false);
        setTimeout(hideTestResult, 3000);
      }
    } catch (error) {
      console.error('Failed to resolve channel ID:', error);
    }
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const settings = {
    apiKey: apiKeyInput.value.trim(),
    channelUrl: channelUrlInput.value.trim(),
    channelId: channelIdInput.value.trim(),
    theme: themeSelect ? themeSelect.value : 'pink',
    popupCorner: popupCornerSelect.value,
    autoHideDuration: parseInt(autoHideDurationInput.value) * 1000,
    controllerImage: controllerImageInput.value.trim(),
    showNotifications: showNotificationsCheckbox.checked,
    openInBrowser: openInBrowserCheckbox.checked,
    launchAtStartup: launchAtStartupCheckbox.checked
  };

  const footballEnabledCheckbox = document.getElementById('footballEnabled');
  if (footballEnabledCheckbox) {
    settings.footballEnabled = footballEnabledCheckbox.checked;
    if (typeof window.api.setFootballEnabled === 'function') {
      await window.api.setFootballEnabled(footballEnabledCheckbox.checked);
      applyFootballVisibility(footballEnabledCheckbox.checked);
    }
  }
  
  setLoading(true);
  hideSaveResult();
  
  try {
    const res = await window.api.saveSettings(settings);
    if (res && res.channelId) {
      channelIdInput.value = res.channelId;
    }
    showSaveResult('✅ Settings saved successfully!', false);
  } catch (error) {
    showSaveResult(`❌ Failed to save: ${error.message}`, true);
  } finally {
    setLoading(false);
  }
});

cancelBtn.addEventListener('click', () => {
  window.api.closeSettings();
});

closeBtn.addEventListener('click', () => {
  window.api.closeSettings();
});

minimizeBtn.addEventListener('click', () => {
  window.api.minimizeSettings();
});

// Tab switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    tabPanels.forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const targetPanel = document.getElementById(`tab-${tab}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    if (tab === 'history') {
      loadHistory();
    } else if (tab === 'live') {
      loadLiveStatus();
    } else if (tab === 'channels') {
      loadChannels();
    } else if (tab === 'football') {
      loadFootballTab();
    }
  });
});

// Horizontal scroll wheel navigation for tabs
const tabsBar = document.getElementById('tabsBar');
if (tabsBar) {
  tabsBar.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabsBar.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

// External link buttons (Google Takeout, Cloud Console, etc.)
document.querySelectorAll('.external-link-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const url = btn.dataset.url;
    if (url) {
      if (window.api && typeof window.api.openExternalUrl === 'function') {
        window.api.openExternalUrl(url);
      } else if (window.api && typeof window.api.openStreamUrl === 'function') {
        window.api.openStreamUrl(url);
      }
    }
  });
});

async function loadHistory() {
  try {
    const history = await window.api.getHistory();
    let matchHistory = [];
    try {
      if (typeof window.api.getFootballState === 'function') {
        // Football history rides on the same store; fetch via dedicated state
        const fbSettings = await window.api.getSettings();
        matchHistory = Array.isArray(fbSettings.matchHistory) ? fbSettings.matchHistory : [];
      }
    } catch (fbError) {
      console.error('Failed to load match history:', fbError);
    }
    const merged = [
      ...history.map(h => ({ ...h, kind: 'stream' })),
      ...matchHistory.map(m => ({ ...m, kind: 'fixture' }))
    ].sort((a, b) => b.timestamp - a.timestamp);
    renderHistory(merged);
  } catch (error) {
    console.error('Failed to load history:', error);
    historyList.innerHTML = '<div class="history-empty">Failed to load history</div>';
  }
}

function renderHistory(items) {
  if (!items || items.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No notifications yet</div>';
    return;
  }

  historyList.innerHTML = items.map(item => {
    if (item.kind === 'fixture') {
      const score = item.scoreHome != null ? `${item.scoreHome}-${item.scoreAway}` : '';
      const label = item.type === 'reminder' ? 'starts soon' : item.type === 'kickoff' ? `kicked off ${score}` : `FT ${score}`;
      return `
      <div class="history-item" data-kind="fixture">
        <div class="history-thumbnail" style="display:flex;align-items:center;justify-content:center;color:var(--fb-live-accent);">${SVG_ICONS.football}</div>
        <div class="history-info">
          <div class="history-title">${escapeHtml(item.title)} ${score ? `<strong>${escapeHtml(score)}</strong>` : ''}</div>
          <div class="history-meta">
            <span class="history-time">🕐 ${formatTime(item.timestamp)}</span>
            <span class="history-badge">${SVG_ICONS.football} ${escapeHtml(label)}</span>
          </div>
        </div>
      </div>`;
    }
    return `
    <div class="history-item ${item.clicked ? 'clicked' : ''}" data-video-id="${item.videoId}">
      ${item.thumbnail ? `<img src="${item.thumbnail}" alt="" class="history-thumbnail">` : '<div class="history-thumbnail" style="display:flex;align-items:center;justify-content:center;font-size:18px;">🎮</div>'}
      <div class="history-info">
        <div class="history-title">${escapeHtml(item.title)}</div>
        <div class="history-meta">
          <span class="history-badge">${SVG_ICONS.gamepad} Stream</span>
          <span class="history-time">🕐 ${formatTime(item.timestamp)}</span>
          <span class="history-channel">${escapeHtml(item.channelTitle)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Add click handlers (streams only)
  historyList.querySelectorAll('.history-item[data-video-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const videoId = el.dataset.videoId;
      await window.api.markHistoryClicked(videoId);
      el.classList.add('clicked');
      window.api.sendClickStream();
    });
  });
}

clearHistoryBtn.addEventListener('click', async () => {
  if (confirm('Clear all notification history?')) {
    await window.api.clearHistory();
    historyList.innerHTML = '<div class="history-empty">No notifications yet</div>';
  }
});

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.closeSettings();
  }
});

// ================= Football Tab Logic (plan §3.1) =================

const SVG_ICONS = {
  football: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 2v5M20.5 9.5L16 10M3.5 9.5L8 10M6 21l3.5-6M18 21l-3.5-6"/></svg>',
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11" aria-hidden="true"><path d="M6 12h4M8 10v4M15 13h.01M18 11h.01"/><rect x="2" y="6" width="20" height="12" rx="6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>',
  flame: '<svg class="flame-badge" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 4-3 6-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-2.5 2.5.5 5 3 5 6.5a7 7 0 0 1-14 0c0-5 5-7 7-13z"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m3 3L21 8l-3-3"/></svg>'
};

const LEAGUE_LABELS = {
  PL: 'EPL', PD: 'La Liga', SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1',
  CL: 'UCL', WC: 'World Cup', EC: 'Euro', ELC: 'Championship', DED: 'Eredivisie',
  PPL: 'Primeira', BSA: 'Brasileirão',
  'ENG-FA': 'FA Cup', 'ENG-LC': 'Carabao Cup', 'ESP-CDR': 'Copa del Rey',
  'ITA-CI': 'Coppa Italia', 'GER-PK': 'DFB-Pokal', 'GER-SC': 'Supercup', 'FRA-TC': 'Trophée des Champions'
};
const FD_LEAGUE_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'WC', 'EC', 'ELC', 'DED', 'PPL', 'BSA'];

let footballState = {
  apiKey: '', favoriteTeams: [], pinnedFixtures: [], leagues: [], allMode: true, cupsEnabled: true, liveBoost: true, reminderMinutes: 15
};
let fixturesCache = [];
let activeFixtureFilter = 'all';
let favSearchLeague = 'PL';

const leagueChipsEl = document.getElementById('leagueChips');
const favLeagueChipsEl = document.getElementById('favLeagueChips');
const fixturesListEl = document.getElementById('fixturesList');
const footballBannerEl = document.getElementById('footballBanner');
const refreshFixturesBtn = document.getElementById('refreshFixturesBtn');
const teamSearchInput = document.getElementById('teamSearchInput');
const teamSearchBtn = document.getElementById('teamSearchBtn');
const teamSearchResultsEl = document.getElementById('teamSearchResults');
const teamSearchHelpEl = document.getElementById('teamSearchHelp');
const favoriteTeamsListEl = document.getElementById('favoriteTeamsList');
const pinnedFixturesListEl = document.getElementById('pinnedFixturesList');
const reminderMinutesInput = document.getElementById('reminderMinutesInput');
const liveBoostCheckbox = document.getElementById('liveBoostCheckbox');

// Centered Date Navigator Elements
const fbDateNav = document.getElementById('fbDateNav');
const fbPrevDayBtn = document.getElementById('fbPrevDayBtn');
const fbNextDayBtn = document.getElementById('fbNextDayBtn');
const fbDateCenter = document.getElementById('fbDateCenter');
const fbDateTitle = document.getElementById('fbDateTitle');
const fbDateBadge = document.getElementById('fbDateBadge');
const fbTodayQuickBtn = document.getElementById('fbTodayQuickBtn');

let selectedDateOffset = 0; // 0 = Today, -1 = Yesterday, +1 = Tomorrow, etc.

function getOffsetDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function formatDateNavTitle(date, offsetDays) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (offsetDays === 0) {
    return `Today · ${weekday}, ${monthDay}`;
  } else if (offsetDays === 1) {
    return `Tomorrow · ${weekday}, ${monthDay}`;
  } else if (offsetDays === -1) {
    return `Yesterday · ${weekday}, ${monthDay}`;
  }
  return `${weekday}, ${monthDay}`;
}

function changeDateOffset(delta) {
  selectedDateOffset += delta;
  renderFixtures();
}

function resetToToday() {
  selectedDateOffset = 0;
  renderFixtures();
}

function applyFootballVisibility(enabled) {
  const btn = document.querySelector('.tab-btn[data-tab="football"]');
  if (btn) btn.style.display = enabled ? '' : 'none';
}

async function loadFootballTab() {
  if (typeof window.api.getFootballState !== 'function') return;
  try {
    const state = await window.api.getFootballState();
    if (!state.success) {
      if (state.disabled) applyFootballVisibility(false);
      return;
    }
    footballState = {
      apiKey: state.apiKey || '',
      favoriteTeams: state.favoriteTeams || [],
      pinnedFixtures: state.pinnedFixtures || [],
      leagues: state.leagues || [],
      allMode: state.allLeagues !== false,
      cupsEnabled: state.cupsEnabled !== false,
      liveBoost: state.liveBoost !== false,
      reminderMinutes: state.reminderMinutes || 15
    };
    reminderMinutesInput.value = footballState.reminderMinutes;
    liveBoostCheckbox.checked = footballState.liveBoost;
    teamSearchHelpEl.textContent = 'Searching bundled top clubs — fixtures come from ESPN after favoriting.';

    const sched = await window.api.getFootballSchedule();
    fixturesCache = (sched && sched.fixtures) || [];

    renderLeagueChips(leagueChipsEl, footballState.leagues, footballState.cupsEnabled, footballState.allMode);
    renderFavLeagueChips(favLeagueChipsEl, favSearchLeague);
    renderFavoriteTeams();
    renderPinnedFixtures();
    renderFixtures();
    updateFootballBanner();
  } catch (error) {
    console.error('Failed to load football tab:', error);
    fixturesListEl.innerHTML = '<div class="fb-empty">Failed to load football data</div>';
  }
}

function renderLeagueChips(container, activeCodes, cupsEnabled, allMode) {
  // "All" is an exclusive mode: only All is bold; individual chips are bold
  // only after leaving All mode by clicking one of them.
  const chips = [
    { code: '__ALL__', label: 'All', active: !!allMode },
    ...FD_LEAGUE_CODES.map(code => ({ code, label: LEAGUE_LABELS[code], active: !allMode && activeCodes.includes(code) })),
    { code: '__CUPS__', label: 'Other Cup', active: !!cupsEnabled }
  ];
  container.innerHTML = chips.map(c => `
    <button type="button" class="league-chip ${c.active ? 'active' : ''}" data-league="${c.code}">${c.label}</button>
  `).join('');
  container.querySelectorAll('.league-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.league;
      if (code === '__ALL__') selectAllLeagues();
      else if (code === '__CUPS__') toggleCups();
      else toggleLeague(code);
    });
  });
}

async function saveLeagues() {
  // Optimistic UI: chips reflect the new state immediately, even if the IPC
  // call is slow or fails (error only logged; state re-syncs on next load).
  renderLeagueChips(leagueChipsEl, footballState.leagues, footballState.cupsEnabled, footballState.allMode);
  renderFixtures();
  try {
    await window.api.setFootballLeagues({
      all: footballState.allMode,
      leagues: footballState.leagues,
      cupsEnabled: footballState.cupsEnabled
    });
  } catch (error) {
    console.error('Failed to save leagues:', error);
  }
}

function selectAllLeagues() {
  footballState.allMode = true;
  saveLeagues();
}

async function toggleCups() {
  footballState.cupsEnabled = !footballState.cupsEnabled;
  await saveLeagues();
}

async function toggleLeague(code) {
  // Clicking a league chip exits All mode and selects that chip; clicking a
  // selected chip deselects it (multi-select across clicks).
  footballState.allMode = false;
  if (footballState.leagues.includes(code)) {
    footballState.leagues = footballState.leagues.filter(c => c !== code);
  } else {
    footballState.leagues = [...footballState.leagues, code];
  }
  await saveLeagues();
}

function renderFavLeagueChips(container, activeCode) {
  container.innerHTML = FD_LEAGUE_CODES.map(code => `
    <button type="button" class="league-chip ${code === activeCode ? 'active' : ''}" data-league="${code}">${LEAGUE_LABELS[code]}</button>
  `).join('');
  container.querySelectorAll('.league-chip').forEach(chip => {
    chip.addEventListener('click', () => setFavSearchLeague(chip.dataset.league));
  });
}

function setFavSearchLeague(code) {
  favSearchLeague = code;
  renderFavLeagueChips(favLeagueChipsEl, code);
  if (teamSearchInput.value.trim()) runTeamSearch();
}

function updateFootballBanner() {
  if (fixturesCache.length === 0) {
    footballBannerEl.innerHTML = `${SVG_ICONS.key}<span>Fixtures load automatically from ESPN — favorite teams above (⭐ Favorites) and press 🔄 Refresh.</span>`;
    footballBannerEl.style.display = 'flex';
  } else {
    footballBannerEl.style.display = 'none';
  }
}

function isFavoriteSide(fixture) {
  return footballState.favoriteTeams.some(t =>
    (t.id && (t.id === fixture.homeTeam.id || t.id === fixture.awayTeam.id)) ||
    (fixture.homeTeam.name.toLowerCase() === (t.name || '').toLowerCase()) ||
    (fixture.awayTeam.name.toLowerCase() === (t.name || '').toLowerCase())
  );
}

function isPinned(fixture) {
  return footballState.pinnedFixtures.some(p => p.id === fixture.id);
}

function crestHtml(team) {
  if (team.crest) {
    return `<img class="team-crest" src="${escapeHtml(team.crest)}" alt="" loading="lazy" data-monogram="${escapeHtml(team.name)}">`;
  }
  return monogramHtml(team.name);
}

// Swap broken crest images for monograms (no inline handlers)
function wireCrestFallbacks(container) {
  container.querySelectorAll('img.team-crest[data-monogram]').forEach(img => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.innerHTML = monogramHtml(img.dataset.monogram);
      img.replaceWith(span.firstElementChild);
    }, { once: true });
  });
}

function monogramHtml(name) {
  let hash = 0;
  const clean = name || '?';
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const r = 40 + (hash % 180), g = 40 + ((hash >> 3) % 180), b = 40 + ((hash >> 6) % 180);
  const words = clean.trim().split(/\s+/);
  const initials = (words.length >= 2 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
  return `<span class="crest-monogram" style="background:rgb(${r},${g},${b})">${escapeHtml(initials)}</span>`;
}

function renderFixtures() {
  try {
    renderFixturesInner();
  } catch (error) {
    console.error('Failed to render fixtures:', error);
    fixturesListEl.innerHTML = '<div class="fb-empty">Failed to render fixtures — check the console.</div>';
  }
}

function renderFixturesInner() {
  const targetDate = getOffsetDate(selectedDateOffset);
  const targetDateString = targetDate.toDateString();

  let list = fixturesCache.filter(f => {
    if (activeFixtureFilter === 'favorites') return f.watched || isFavoriteSide(f);
    if (activeFixtureFilter === 'live') return f.status === 'live';
    if (activeFixtureFilter === 'finished') return f.status === 'finished';
    return true;
  });

  // All mode shows everything; otherwise watched fixtures (favorite team
  // playing or pinned, matched server-side via cross-provider club identity)
  // always pass and other fixtures must match an enabled league chip (Q10).
  list = list.filter(f =>
    footballState.allMode ||
    f.watched ||
    isPinned(f) ||
    footballState.leagues.includes(f.competition.code)
  );

  // Filter fixtures specifically for the selected date
  const dayFixtures = list
    .filter(f => f.kickoffUtc && new Date(f.kickoffUtc).toDateString() === targetDateString)
    .sort((a, b) => Date.parse(a.kickoffUtc || 0) - Date.parse(b.kickoffUtc || 0));

  // Update date navigator bar
  if (fbDateNav) {
    fbDateNav.classList.toggle('is-today', selectedDateOffset === 0);
  }
  if (fbDateTitle) {
    fbDateTitle.textContent = formatDateNavTitle(targetDate, selectedDateOffset);
  }
  if (fbDateBadge) {
    fbDateBadge.textContent = `${dayFixtures.length} match${dayFixtures.length === 1 ? '' : 'es'}`;
  }
  if (fbTodayQuickBtn) {
    fbTodayQuickBtn.style.display = selectedDateOffset !== 0 ? 'inline-block' : 'none';
  }

  if (dayFixtures.length === 0) {
    fixturesListEl.innerHTML = `
      <div class="fb-empty">
        No matches scheduled for <strong>${escapeHtml(formatDateNavTitle(targetDate, selectedDateOffset))}</strong>.
        ${selectedDateOffset !== 0 ? '<br><button type="button" class="btn btn-secondary btn-sm" style="margin-top: 10px;" id="jumpTodayEmptyBtn">↺ Jump to Today</button>' : ''}
      </div>
    `;
    const jumpBtn = document.getElementById('jumpTodayEmptyBtn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', resetToToday);
    }
    return;
  }

  let html = dayFixtures.map(f => {
    const live = f.status === 'live';
    const finished = f.status === 'finished';

    const homeHtml = (live || finished)
      ? `${escapeHtml(f.homeTeam.name)} ${crestHtml(f.homeTeam)} <strong class="score-val">${f.score.home ?? 0}</strong>`
      : `${escapeHtml(f.homeTeam.name)} ${crestHtml(f.homeTeam)}`;
    const awayHtml = (live || finished)
      ? `<strong class="score-val">${f.score.away ?? 0}</strong> ${crestHtml(f.awayTeam)} ${escapeHtml(f.awayTeam.name)}`
      : `${crestHtml(f.awayTeam)} ${escapeHtml(f.awayTeam.name)}`;

    const center = finished
      ? `<span class="fixture-score">${f.score.home ?? '-'} : ${f.score.away ?? '-'}</span>`
      : live
        ? `<span class="fixture-score">${escapeHtml(f.minute || 'LIVE')}</span>`
        : `<span class="fixture-kickoff">${new Date(f.kickoffUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    return `
    <div class="fixture-row ${live ? 'is-live' : ''}" data-fixture-id="${escapeHtml(f.id)}">
      <div class="fixture-teams">
        <span class="fixture-team home">${homeHtml}</span>
        ${center}
        <span class="fixture-team away">${awayHtml}</span>
      </div>
      ${f.bigMatch ? SVG_ICONS.flame : ''}
      ${(LEAGUE_LABELS[f.competition.code] || f.competition.code) ? `<span class="comp-chip">${escapeHtml(LEAGUE_LABELS[f.competition.code] || f.competition.code)}</span>` : ''}
      <button type="button" class="star-btn ${isPinned(f) ? 'pinned' : ''}" data-pin-id="${escapeHtml(f.id)}" title="Pin fixture">
        ${isPinned(f) ? SVG_ICONS.starFilled : SVG_ICONS.star}
      </button>
    </div>`;
  }).join('');

  fixturesListEl.innerHTML = html;
  wireCrestFallbacks(fixturesListEl);

  fixturesListEl.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fixture = fixturesCache.find(f => f.id === btn.dataset.pinId);
      if (!fixture) return;
      try {
        const res = await window.api.togglePinFixture(fixture);
        if (res.success) {
          footballState.pinnedFixtures = res.pinnedFixtures;
          renderFixtures();
          renderPinnedFixtures();
        }
      } catch (error) {
        console.error('Failed to toggle pin:', error);
      }
    });
  });
}

function renderPinnedFixtures() {
  if (footballState.pinnedFixtures.length === 0) {
    pinnedFixturesListEl.innerHTML = '<div class="fb-empty">No pinned fixtures yet. Star a match in the 📅 Matches tab!</div>';
    return;
  }
  pinnedFixturesListEl.innerHTML = footballState.pinnedFixtures.map(pf => {
    const cached = fixturesCache.find(c =>
      c.id === pf.id ||
      (c.homeTeam && pf.homeTeam && c.homeTeam.name.toLowerCase() === pf.homeTeam.name.toLowerCase() &&
       c.awayTeam && pf.awayTeam && c.awayTeam.name.toLowerCase() === pf.awayTeam.name.toLowerCase())
    );
    const kickoff = pf.kickoffUtc || (cached && cached.kickoffUtc);
    const status = (cached && cached.status) || pf.status || 'scheduled';
    const minute = (cached && cached.minute != null) ? cached.minute : pf.minute;
    const score = (cached && cached.score) ? cached.score : (pf.score || { home: null, away: null });

    const live = status === 'live';
    const finished = status === 'finished';

    const homeHtml = (live || finished)
      ? `${escapeHtml(pf.homeTeam.name)} ${crestHtml(pf.homeTeam)} <strong class="score-val">${score.home ?? 0}</strong>`
      : `${escapeHtml(pf.homeTeam.name)} ${crestHtml(pf.homeTeam)}`;
    const awayHtml = (live || finished)
      ? `<strong class="score-val">${score.away ?? 0}</strong> ${crestHtml(pf.awayTeam)} ${escapeHtml(pf.awayTeam.name)}`
      : `${crestHtml(pf.awayTeam)} ${escapeHtml(pf.awayTeam.name)}`;

    const centerHtml = live
      ? `<span class="fixture-score">${escapeHtml(minute || 'LIVE')}</span>`
      : finished
        ? `<span class="fixture-score">${score.home ?? '-'} : ${score.away ?? '-'}</span>`
        : `<span class="fixture-kickoff">${kickoff ? new Date(kickoff).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD'}</span>`;

    return `
    <div class="fixture-row ${live ? 'is-live' : ''}">
      <div class="fixture-teams">
        <span class="fixture-team home">${homeHtml}</span>
        ${centerHtml}
        <span class="fixture-team away">${awayHtml}</span>
      </div>
      <button type="button" class="star-btn pinned" data-unpin-id="${escapeHtml(pf.id)}" title="Unpin">${SVG_ICONS.starFilled}</button>
    </div>`;
  }).join('');

  pinnedFixturesListEl.querySelectorAll('[data-unpin-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fixture = footballState.pinnedFixtures.find(f => f.id === btn.dataset.unpinId);
      if (!fixture) return;
      try {
        const res = await window.api.togglePinFixture(fixture);
        if (res.success) {
          footballState.pinnedFixtures = res.pinnedFixtures;
          renderPinnedFixtures();
          renderFixtures();
        }
      } catch (error) {
        console.error('Failed to unpin:', error);
      }
    });
  });
}

function renderFavoriteTeams() {
  if (footballState.favoriteTeams.length === 0) {
    favoriteTeamsListEl.innerHTML = '<span class="fb-empty" style="padding:6px;">No favorite teams yet — search above!</span>';
    return;
  }
  favoriteTeamsListEl.innerHTML = footballState.favoriteTeams.map(t => `
    <span class="favorite-chip">${crestHtml(t)} ${escapeHtml(t.name)}
      <button type="button" data-remove-team="${escapeHtml(t.id)}" data-remove-name="${escapeHtml(t.name)}" title="Remove favorite">✕</button>
    </span>
  `).join('');
  wireCrestFallbacks(favoriteTeamsListEl);
  favoriteTeamsListEl.querySelectorAll('[data-remove-team]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const res = await window.api.removeFavoriteTeam(btn.dataset.removeTeam || btn.dataset.removeName);
        if (res.success) {
          footballState.favoriteTeams = res.favoriteTeams;
          renderFavoriteTeams();
          renderFixtures();
        }
      } catch (error) {
        console.error('Failed to remove favorite:', error);
      }
    });
  });
}

async function runTeamSearch() {
  const query = teamSearchInput.value.trim();
  teamSearchResultsEl.innerHTML = '<div class="fb-empty">Searching...</div>';
  try {
    const res = await window.api.searchFootballTeams({ query, competitionCode: favSearchLeague });
    if (!res.success || res.disabled) {
      teamSearchResultsEl.innerHTML = '<div class="fb-empty">Football features are disabled.</div>';
      return;
    }
    if (res.teams.length === 0) {
      teamSearchResultsEl.innerHTML = '<div class="fb-empty">No teams found in this league.</div>';
      return;
    }
    teamSearchResultsEl.innerHTML = res.teams.map(t => `
      <div class="team-result" data-team-name="${escapeHtml(t.name)}" data-team-code="${escapeHtml(t.competitionCode)}">
        ${crestHtml(t)} ${escapeHtml(t.name)}
        <span style="margin-left:auto;">${SVG_ICONS.star}</span>
      </div>
    `).join('');
    wireCrestFallbacks(teamSearchResultsEl);
    teamSearchResultsEl.querySelectorAll('.team-result').forEach(el => {
      el.addEventListener('click', async () => {
        try {
          const res2 = await window.api.addFavoriteTeam({
            id: '', name: el.dataset.teamName, crest: '', competitionCode: el.dataset.teamCode
          });
          if (res2.success) {
            footballState.favoriteTeams = res2.favoriteTeams;
            renderFavoriteTeams();
            renderFixtures();
            teamSearchResultsEl.innerHTML = `<div class="fb-empty">⭐ ${escapeHtml(el.dataset.teamName)} favorited!</div>`;
          }
        } catch (error) {
          console.error('Failed to add favorite:', error);
        }
      });
    });
  } catch (error) {
    console.error('Team search failed:', error);
    teamSearchResultsEl.innerHTML = '<div class="fb-empty">Search failed — try again.</div>';
  }
}

teamSearchBtn.addEventListener('click', runTeamSearch);
teamSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runTeamSearch();
});

refreshFixturesBtn.addEventListener('click', async () => {
  refreshFixturesBtn.disabled = true;
  fixturesListEl.innerHTML = '<div class="fb-skeleton"></div><div class="fb-skeleton"></div><div class="fb-skeleton"></div>';
  try {
    const res = await window.api.checkFootballNow();
    if (res.success) {
      const sched = await window.api.getFootballSchedule();
      fixturesCache = (sched && sched.fixtures) || [];
      updateFootballBanner();
      renderFixtures();
    } else if (res.disabled) {
      applyFootballVisibility(false);
    } else {
      fixturesListEl.innerHTML = `<div class="fb-empty">Refresh failed: ${escapeHtml(res.error || 'unknown error')}</div>`;
    }
  } catch (error) {
    console.error('Fixture refresh failed:', error);
    fixturesListEl.innerHTML = '<div class="fb-empty">Refresh failed — check your connection.</div>';
  } finally {
    refreshFixturesBtn.disabled = false;
  }
});

document.querySelectorAll('.fixture-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.fixture-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeFixtureFilter = pill.dataset.fixtureFilter;
    renderFixtures();
  });
});

reminderMinutesInput.addEventListener('change', async () => {
  const minutes = Math.min(120, Math.max(5, parseInt(reminderMinutesInput.value) || 15));
  reminderMinutesInput.value = minutes;
  try {
    await window.api.saveSettings({ matchReminderMinutes: minutes });
  } catch (error) {
    console.error('Failed to save reminder minutes:', error);
  }
});

liveBoostCheckbox.addEventListener('change', async () => {
  try {
    await window.api.saveSettings({ footballLiveBoost: liveBoostCheckbox.checked });
  } catch (error) {
    console.error('Failed to save live boost setting:', error);
  }
});

if (typeof window.api.onFootballStatusUpdated === 'function') {
  window.api.onFootballStatusUpdated(() => {
    // Always keep the cache warm; rendering a hidden list is harmless.
    window.api.getFootballSchedule().then(sched => {
      fixturesCache = (sched && sched.fixtures) || [];
      renderFixtures();
      renderPinnedFixtures();
    }).catch(err => console.error('Football schedule refresh failed:', err));
  });
}

if (fbPrevDayBtn) {
  fbPrevDayBtn.addEventListener('click', () => changeDateOffset(-1));
}

if (fbNextDayBtn) {
  fbNextDayBtn.addEventListener('click', () => changeDateOffset(1));
}

if (fbDateCenter) {
  fbDateCenter.addEventListener('click', () => resetToToday());
  fbDateCenter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      resetToToday();
    }
  });
}

if (fbTodayQuickBtn) {
  fbTodayQuickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetToToday();
  });
}

// Keyboard shortcuts (Left/Right arrow) when on the Matches subtab
document.addEventListener('keydown', (e) => {
  const activeTabBtn = document.querySelector('.tab-btn.active');
  const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : null;
  const activeSubtabBtn = document.querySelector('#tab-football .sub-tab-btn.active');
  const activeSubtab = activeSubtabBtn ? activeSubtabBtn.dataset.subtab : null;

  if (activeTab !== 'football' || activeSubtab !== 'fb-matches') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    changeDateOffset(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    changeDateOffset(1);
  }
});

if (window.api && typeof window.api.onSelectTab === 'function') {
  window.api.onSelectTab((tabName) => {
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  });
}

loadSettings();