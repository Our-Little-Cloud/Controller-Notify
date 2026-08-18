const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { checkLiveStatus } = require('../src/main/youtube');

describe('YouTube API - Live Status & Search API Tests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('1. Active Live Stream Detection', () => {
    it('should return live stream details when channel has an active live stream', async () => {
      const mockLiveVideo = {
        id: { videoId: 'live_vid_999' },
        snippet: {
          title: 'Speedrunning Elden Ring Live!',
          channelTitle: 'Gamer Channel',
          thumbnails: {
            high: { url: 'https://i.ytimg.com/vi/live_vid_999/hqdefault.jpg' },
            default: { url: 'https://i.ytimg.com/vi/live_vid_999/default.jpg' }
          },
          publishedAt: '2026-08-18T12:00:00Z'
        }
      };

      let requestedUrl;
      let requestedParams;
      let requestedTimeout;

      mock.method(axios, 'get', async (url, config) => {
        requestedUrl = url;
        requestedParams = config.params;
        requestedTimeout = config.timeout;
        return {
          data: {
            items: [mockLiveVideo]
          }
        };
      });

      const result = await checkLiveStatus('test-api-key', 'UC_streamer_123');

      assert.equal(result.isLive, true);
      assert.equal(result.videoId, 'live_vid_999');
      assert.equal(result.title, 'Speedrunning Elden Ring Live!');
      assert.equal(result.channelTitle, 'Gamer Channel');
      assert.equal(result.thumbnail, 'https://i.ytimg.com/vi/live_vid_999/hqdefault.jpg');
      assert.equal(result.publishedAt, '2026-08-18T12:00:00Z');

      // Verify endpoint and query params
      assert.equal(requestedUrl, 'https://www.googleapis.com/youtube/v3/search');
      assert.equal(requestedParams.part, 'snippet');
      assert.equal(requestedParams.channelId, 'UC_streamer_123');
      assert.equal(requestedParams.eventType, 'live');
      assert.equal(requestedParams.type, 'video');
      assert.equal(requestedParams.key, 'test-api-key');
      assert.equal(requestedParams.maxResults, 1);
      assert.equal(requestedTimeout, 10000);
    });

    it('should fallback to default thumbnail if high resolution thumbnail is missing', async () => {
      const mockLiveVideo = {
        id: { videoId: 'live_fallback_123' },
        snippet: {
          title: 'Chill stream without HD thumbnail',
          channelTitle: 'Indie Dev',
          thumbnails: {
            default: { url: 'https://i.ytimg.com/vi/live_fallback_123/default.jpg' }
          },
          publishedAt: '2026-08-18T13:00:00Z'
        }
      };

      mock.method(axios, 'get', async () => {
        return {
          data: {
            items: [mockLiveVideo]
          }
        };
      });

      const result = await checkLiveStatus('test-key', 'UC_indie_dev');

      assert.equal(result.isLive, true);
      assert.equal(result.thumbnail, 'https://i.ytimg.com/vi/live_fallback_123/default.jpg');
    });
  });

  describe('2. Offline Channel Status', () => {
    it('should return { isLive: false } when no live streams are found', async () => {
      mock.method(axios, 'get', async () => {
        return {
          data: {
            items: []
          }
        };
      });

      const result = await checkLiveStatus('test-key', 'UC_offline_channel');

      assert.deepEqual(result, { isLive: false });
    });
  });

  describe('3. Network and Server Error Handling', () => {
    it('should throw "Request timeout" when network request times out (ECONNABORTED)', async () => {
      mock.method(axios, 'get', async () => {
        const timeoutError = new Error('timeout of 10000ms exceeded');
        timeoutError.code = 'ECONNABORTED';
        throw timeoutError;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('test-key', 'UC_channel');
        },
        {
          name: 'Error',
          message: 'Request timeout'
        }
      );
    });

    it('should throw "YouTube API error: 500" when YouTube server returns HTTP 500', async () => {
      mock.method(axios, 'get', async () => {
        const serverError = new Error('Internal Server Error');
        serverError.response = { status: 500 };
        throw serverError;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('test-key', 'UC_channel');
        },
        {
          name: 'Error',
          message: 'YouTube API error: 500'
        }
      );
    });

    it('should throw "YouTube API error: 503" when YouTube server is unavailable', async () => {
      mock.method(axios, 'get', async () => {
        const serverError = new Error('Service Unavailable');
        serverError.response = { status: 503 };
        throw serverError;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('test-key', 'UC_channel');
        },
        {
          name: 'Error',
          message: 'YouTube API error: 503'
        }
      );
    });

    it('should throw "Network error: ..." on generic connection errors', async () => {
      mock.method(axios, 'get', async () => {
        throw new Error('ENOTFOUND api.googleapis.com');
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('test-key', 'UC_channel');
        },
        {
          name: 'Error',
          message: 'Network error: ENOTFOUND api.googleapis.com'
        }
      );
    });
  });
});
