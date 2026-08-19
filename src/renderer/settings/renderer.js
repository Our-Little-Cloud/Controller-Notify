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
    const channelUrl = c.url || (c.handle ? `https://www.youtube.com/${c.handle.startsWith('@') ? c.handle : '@' + c.handle}` : `https://www.youtube.com/channel/${c.id}`);
    return `
    <div class="channel-card ${c.enabled === false ? 'disabled' : ''}" data-channel-id="${escapeHtml(c.id)}">
      <div class="channel-card-left" data-action="open-url" data-url="${escapeHtml(channelUrl)}" title="Click to open channel in web browser">
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

    // Open channel URL in default web browser
    card.querySelectorAll('[data-action="open-url"]').forEach(el => {
      el.addEventListener('click', (e) => {
        // Prevent toggle/delete buttons inside actions from triggering card click
        if (e.target.closest('[data-action="toggle"]') || e.target.closest('[data-action="delete"]')) return;
        const url = el.dataset.url;
        if (url && window.api && typeof window.api.openExternalUrl === 'function') {
          window.api.openExternalUrl(url);
        }
      });
    });

    const toggleBtn = card.querySelector('[data-action="toggle"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const channel = allChannels.find(c => c.id === id);
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
    renderHistory(history);
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
  
  historyList.innerHTML = items.map(item => `
    <div class="history-item ${item.clicked ? 'clicked' : ''}" data-video-id="${item.videoId}">
      ${item.thumbnail ? `<img src="${item.thumbnail}" alt="" class="history-thumbnail">` : '<div class="history-thumbnail" style="display:flex;align-items:center;justify-content:center;font-size:18px;">🎮</div>'}
      <div class="history-info">
        <div class="history-title">${escapeHtml(item.title)}</div>
        <div class="history-meta">
          <span class="history-time">🕐 ${formatTime(item.timestamp)}</span>
          <span class="history-channel">${escapeHtml(item.channelTitle)}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  historyList.querySelectorAll('.history-item').forEach(el => {
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
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.api.closeSettings();
  }
});

loadSettings();