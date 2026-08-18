/**
 * Channel Manager module for Controller Notify.
 * Handles channel store management, normalization, and Google Takeout CSV import.
 */

/**
 * Normalizes a channel object to standard schema.
 */
function normalizeChannel(rawChannel) {
  if (!rawChannel) return null;

  let id = rawChannel.id || rawChannel.channelId || '';
  let url = rawChannel.url || rawChannel.channelUrl || '';
  let title = rawChannel.title || rawChannel.channelTitle || '';
  let handle = rawChannel.handle || '';

  // Extract handle if url has @
  if (!handle && url.includes('/@')) {
    handle = '@' + url.split('/@')[1].split(/[/?#]/)[0];
  } else if (!handle && url.startsWith('@')) {
    handle = url;
  }

  // If title is missing, fallback to handle or id
  if (!title) {
    title = handle ? handle.replace(/^@/, '') : id || 'Streamer';
  }

  // If url is missing, construct it
  if (!url) {
    if (handle) {
      url = `https://www.youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`;
    } else if (id) {
      url = `https://www.youtube.com/channel/${id}`;
    }
  }

  return {
    id: id || handle || url,
    handle: handle || '',
    url: url || '',
    title: title || 'Streamer',
    avatar: rawChannel.avatar || '',
    enabled: rawChannel.enabled !== false,
    isLive: Boolean(rawChannel.isLive),
    currentStream: rawChannel.currentStream || null,
    lastLiveVideoId: rawChannel.lastLiveVideoId || null
  };
}

/**
 * Parses Google Takeout `subscriptions.csv` content.
 * Standard format:
 * Channel Id,Channel Url,Channel Title
 * UC_x5XG1OV2P6uZZ5FSM9Ttw,http://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw,Google Developers
 */
function parseSubscriptionsCsv(csvContent) {
  if (!csvContent || typeof csvContent !== 'string') {
    return [];
  }

  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const channels = [];
  let headerIndexMap = { id: -1, url: -1, title: -1 };

  // Parse header line if present
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('channel') || firstLine.includes('id') || firstLine.includes('title');
  const startIndex = hasHeader ? 1 : 0;

  if (hasHeader) {
    const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());
    headers.forEach((h, idx) => {
      if (h.includes('id')) headerIndexMap.id = idx;
      else if (h.includes('url') || h.includes('link')) headerIndexMap.url = idx;
      else if (h.includes('title') || h.includes('name')) headerIndexMap.title = idx;
    });
  }

  // Default positions if not found by name
  if (headerIndexMap.id === -1) headerIndexMap.id = 0;
  if (headerIndexMap.url === -1) headerIndexMap.url = 1;
  if (headerIndexMap.title === -1) headerIndexMap.title = 2;

  for (let i = startIndex; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    if (row.length === 0) continue;

    const channelId = row[headerIndexMap.id] || '';
    const channelUrl = row[headerIndexMap.url] || '';
    const channelTitle = row[headerIndexMap.title] || '';

    if (channelId || channelUrl || channelTitle) {
      const normalized = normalizeChannel({
        id: channelId,
        url: channelUrl,
        title: channelTitle
      });
      if (normalized && (normalized.id || normalized.url)) {
        channels.push(normalized);
      }
    }
  }

  return channels;
}

/**
 * Helper to parse a single CSV row, respecting quoted values.
 */
function parseCsvRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Adds a channel to the list, preventing duplicates.
 */
function addChannelToList(channels = [], newChannel) {
  const normalized = normalizeChannel(newChannel);
  if (!normalized || (!normalized.id && !normalized.url && !normalized.handle)) {
    throw new Error('Invalid channel data');
  }

  const list = Array.isArray(channels) ? [...channels] : [];

  // Check if channel already exists (by ID, URL, or Handle)
  const existingIndex = list.findIndex(c => {
    if (normalized.id && c.id && c.id === normalized.id) return true;
    if (normalized.handle && c.handle && c.handle.toLowerCase() === normalized.handle.toLowerCase()) return true;
    if (normalized.url && c.url && c.url.toLowerCase() === normalized.url.toLowerCase()) return true;
    return false;
  });

  if (existingIndex >= 0) {
    // Update existing channel properties while preserving live status / state
    list[existingIndex] = {
      ...list[existingIndex],
      ...normalized,
      isLive: list[existingIndex].isLive,
      lastLiveVideoId: list[existingIndex].lastLiveVideoId
    };
  } else {
    list.push(normalized);
  }

  return list;
}

/**
 * Removes a channel from the list by ID, handle, or URL.
 */
function removeChannelFromList(channels = [], identifier) {
  if (!Array.isArray(channels) || !identifier) return channels;
  const lower = identifier.toLowerCase();
  return channels.filter(c => c.id !== identifier && c.handle?.toLowerCase() !== lower && c.url?.toLowerCase() !== lower);
}

/**
 * Toggles notifications enabled/disabled for a channel.
 */
function toggleChannelEnabled(channels = [], identifier, enabled) {
  if (!Array.isArray(channels) || !identifier) return channels;
  const lower = identifier.toLowerCase();
  return channels.map(c => {
    if (c.id === identifier || c.handle?.toLowerCase() === lower || c.url?.toLowerCase() === lower) {
      return { ...c, enabled: enabled !== undefined ? enabled : !c.enabled };
    }
    return c;
  });
}

/**
 * Migrates legacy store with single channelId / channelUrl to multi-channel list.
 */
function migrateChannelsStore(storeData = {}) {
  let channels = Array.isArray(storeData.channels) ? [...storeData.channels] : [];

  // If legacy single channel exists and not yet in channels array
  const legacyChannelId = storeData.channelId;
  const legacyChannelUrl = storeData.channelUrl;

  if ((legacyChannelId || legacyChannelUrl) && channels.length === 0) {
    const legacyChannel = normalizeChannel({
      id: legacyChannelId,
      url: legacyChannelUrl,
      title: legacyChannelUrl ? legacyChannelUrl.replace(/^.*[@/]/, '') : 'Default Channel'
    });
    if (legacyChannel) {
      channels.push(legacyChannel);
    }
  }

  return channels;
}

module.exports = {
  normalizeChannel,
  parseSubscriptionsCsv,
  addChannelToList,
  removeChannelFromList,
  toggleChannelEnabled,
  migrateChannelsStore
};
