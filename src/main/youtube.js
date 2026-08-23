const http = require('http');
const https = require('https');
const axios = require('axios');

// Shared connection pool with keepAlive enabled to prevent socket churn
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 5, keepAliveMsecs: 10000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 5, keepAliveMsecs: 10000 });

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

const WIN1252_MAP = {
  '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85,
  '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A,
  '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92,
  '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C,
  '\u017E': 0x9E, '\u0178': 0x9F
};

function fixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  if (!/[\u0080-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u0178\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/.test(str)) {
    return str;
  }
  try {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const code = ch.charCodeAt(0);
      if (code < 128) {
        bytes.push(code);
      } else if (WIN1252_MAP[ch] !== undefined) {
        bytes.push(WIN1252_MAP[ch]);
      } else if (code <= 255) {
        bytes.push(code);
      } else {
        return str;
      }
    }
    const buf = Buffer.from(bytes);
    const decoded = buf.toString('utf8');
    if (!decoded.includes('\uFFFD')) return decoded;
  } catch (e) {
    // Return original on decode failure
  }
  return str;
}

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (e) { return _; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (e) { return _; }
    });
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return str;
  return fixMojibake(decodeHtmlEntities(str));
}

async function checkLiveStatus(apiKey, channelId) {
  if (!apiKey || !channelId) {
    throw new Error('API key and channel ID are required');
  }

  try {
    const response = await axios.get(`${YOUTUBE_API_BASE}/search`, {
      params: {
        part: 'snippet',
        channelId: channelId,
        eventType: 'live',
        type: 'video',
        key: apiKey,
        maxResults: 1
      },
      timeout: 10000,
      httpAgent,
      httpsAgent
    });

    const items = response.data.items || [];
    
    if (items.length > 0) {
      const video = items[0];
      return {
        isLive: true,
        videoId: video.id.videoId,
        title: sanitizeString(video.snippet.title),
        channelTitle: sanitizeString(video.snippet.channelTitle),
        thumbnail: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url,
        publishedAt: video.snippet.publishedAt
      };
    }

    return { isLive: false };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 403) {
        throw new Error('Invalid API key or quota exceeded');
      } else if (status === 400) {
        throw new Error('Invalid channel ID');
      }
      throw new Error(`YouTube API error: ${status}`);
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout');
    }
    throw new Error(`Network error: ${error.message}`);
  }
}

async function getChannelIdFromUrl(apiKey, channelUrl) {
  if (!apiKey || !channelUrl) {
    throw new Error('Could not resolve channel ID from URL');
  }

  const trimmed = channelUrl.trim();

  // If already a standalone UC channel ID (e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    try {
      const response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
        params: { part: 'id', id: trimmed, key: apiKey },
        httpAgent,
        httpsAgent
      });
      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0].id;
      }
    } catch (e) {
      return trimmed;
    }
    return trimmed;
  }

  const patterns = [
    { regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: 'id' },
    { regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([a-zA-Z0-9_.-]+)/, type: 'handle' },
    { regex: /^@([a-zA-Z0-9_.-]+)$/, type: 'handle' },
    { regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/c\/([a-zA-Z0-9_.-]+)/, type: 'username' },
    { regex: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/user\/([a-zA-Z0-9_.-]+)/, type: 'username' }
  ];

  for (const { regex, type } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      const identifier = match[1];
      try {
        let response;
        if (type === 'handle') {
          response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
            params: { part: 'id', forHandle: identifier, key: apiKey },
            httpAgent,
            httpsAgent
          });
        } else if (type === 'username') {
          response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
            params: { part: 'id', forUsername: identifier, key: apiKey },
            httpAgent,
            httpsAgent
          });
        } else {
          response = await axios.get(`${YOUTUBE_API_BASE}/channels`, {
            params: { part: 'id', id: identifier, key: apiKey },
            httpAgent,
            httpsAgent
          });
        }
        
        if (response.data.items && response.data.items.length > 0) {
          return response.data.items[0].id;
        }
      } catch (e) {
        continue;
      }
    }
  }

  throw new Error('Could not resolve channel ID from URL');
}

/**
 * Check live status without an API key by probing the YouTube canonical /live endpoint.
 * Cost: 0 API quota units (100% Free).
 */
async function checkLiveStatusFree(channelIdentifier) {
  if (!channelIdentifier) {
    throw new Error('Channel URL or ID is required');
  }

  const trimmed = channelIdentifier.trim();
  let liveUrl = trimmed;

  if (trimmed.startsWith('@')) {
    liveUrl = `https://www.youtube.com/@${trimmed.slice(1)}/live`;
  } else if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
    liveUrl = `https://www.youtube.com/channel/${trimmed}/live`;
  } else if (trimmed.includes('youtube.com')) {
    if (!trimmed.endsWith('/live')) {
      liveUrl = trimmed.replace(/\/+$/, '') + '/live';
    }
  } else {
    liveUrl = `https://www.youtube.com/@${trimmed}/live`;
  }

  try {
    const response = await axios.get(liveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 10000,
      maxRedirects: 5,
      httpAgent,
      httpsAgent
    });

    const html = typeof response.data === 'string' ? response.data : '';
    
    // Check if the page indicates an active live broadcast (exclude VOD and generic sidebar badges)
    const isLive = html.includes('"isLiveNow":true') && html.includes('"isLive":true');

    if (isLive) {
      let videoId = null;
      const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)"/);
      if (canonicalMatch) {
        videoId = canonicalMatch[1];
      } else {
        const vidMatch = html.match(/watch\?v=([a-zA-Z0-9_-]+)/) || html.match(/"videoId":"([a-zA-Z0-9_-]+)"/);
        if (vidMatch) videoId = vidMatch[1];
      }

      let title = 'Live Stream';
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) {
        title = sanitizeString(titleMatch[1].replace(/ - YouTube$/, '').trim());
      }

      let channelTitle = trimmed;
      const authorMatch = html.match(/<meta name="author" content="([^"]+)"/) || html.match(/<link itemprop="name" content="([^"]+)"/);
      if (authorMatch) {
        channelTitle = sanitizeString(authorMatch[1]);
      }

      let thumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
      const thumbMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (thumbMatch) {
        thumbnail = thumbMatch[1];
      }

      return {
        isLive: true,
        videoId: videoId || 'live',
        title: sanitizeString(title),
        channelTitle: sanitizeString(channelTitle),
        thumbnail,
        publishedAt: new Date().toISOString()
      };
    }

    return { isLive: false };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout');
    }
    throw new Error(`Network error: ${error.message}`);
  }
}

/**
 * Unified live check that uses API key if available, or falls back to free 0-quota probe.
 */
async function checkLiveStatusUnified({ apiKey, channelId, channelUrl }) {
  if (apiKey && channelId && !channelId.startsWith('@') && !channelId.includes('youtube.com')) {
    try {
      return await checkLiveStatus(apiKey, channelId);
    } catch (err) {
      // Fallback to free check if API key quota exceeded or failed
      const identifier = channelUrl || channelId;
      if (identifier) {
        return await checkLiveStatusFree(identifier);
      }
      throw err;
    }
  }

  const target = channelUrl || channelId;
  if (!target) {
    throw new Error('Channel URL or ID is required');
  }
  return await checkLiveStatusFree(target);
}

module.exports = {
  checkLiveStatus,
  getChannelIdFromUrl,
  checkLiveStatusFree,
  checkLiveStatusUnified,
  decodeHtmlEntities,
  fixMojibake,
  sanitizeString
};