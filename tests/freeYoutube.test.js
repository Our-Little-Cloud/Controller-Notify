const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { checkLiveStatusFree, checkLiveStatusUnified } = require('../src/main/youtube');

describe('YouTube Free (0-Quota) Live Check Engine Tests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('1. Active Live Broadcast HTML Detection', () => {
    it('should detect live stream from canonical /live page with isLiveBroadcast flag', async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>🔴 Big Gaming Championship Finals! - YouTube</title>
            <link rel="canonical" href="https://www.youtube.com/watch?v=liveVid12345">
            <meta property="og:title" content="🔴 Big Gaming Championship Finals!">
            <meta property="og:image" content="https://i.ytimg.com/vi/liveVid12345/maxresdefault.jpg">
            <meta name="author" content="Pro Gaming Channel">
          </head>
          <body>
            <script>
              var ytInitialPlayerResponse = {"status":"LIVE","isLive":true,"videoDetails":{"isLiveNow":true,"isLiveBroadcast":true,"videoId":"liveVid12345"}};
            </script>
          </body>
        </html>
      `;

      let requestedUrl;
      let requestedHeaders;
      mock.method(axios, 'get', async (url, config) => {
        requestedUrl = url;
        requestedHeaders = config.headers;
        return { data: mockHtml };
      });

      const result = await checkLiveStatusFree('@gamingchannel');

      assert.equal(result.isLive, true);
      assert.equal(result.videoId, 'liveVid12345');
      assert.equal(result.title, '🔴 Big Gaming Championship Finals!');
      assert.equal(result.channelTitle, 'Pro Gaming Channel');
      assert.equal(result.thumbnail, 'https://i.ytimg.com/vi/liveVid12345/maxresdefault.jpg');
      assert.equal(requestedUrl, 'https://www.youtube.com/@gamingchannel/live');
      assert.ok(requestedHeaders['User-Agent']);
    });

    it('should correctly format direct UC channel ID into /channel/UC.../live URL', async () => {
      const mockHtml = `
        <html>
          <head>
            <link rel="canonical" href="https://www.youtube.com/watch?v=stream789">
            <meta property="og:title" content="Speedrunning Live">
          </head>
          <body>{"isLiveNow":true,"isLive":true}</body>
        </html>
      `;
      let requestedUrl;
      mock.method(axios, 'get', async (url) => {
        requestedUrl = url;
        return { data: mockHtml };
      });

      const result = await checkLiveStatusFree('UC_x5XG1OV2P6uZZ5FSM9Ttw');

      assert.equal(result.isLive, true);
      assert.equal(result.videoId, 'stream789');
      assert.equal(requestedUrl, 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw/live');
    });
  });

  describe('2. Offline Channel HTML Detection', () => {
    it('should return { isLive: false } when HTML does not contain live broadcast flags', async () => {
      const mockOfflineHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Gaming Channel - YouTube</title>
          </head>
          <body>
            <div>Welcome to my channel! No live streams currently.</div>
          </body>
        </html>
      `;

      mock.method(axios, 'get', async () => {
        return { data: mockOfflineHtml };
      });

      const result = await checkLiveStatusFree('@offlinecreator');

      assert.deepEqual(result, { isLive: false });
    });
  });

  describe('3. Unified Live Check Fallback & Routing', () => {
    it('should route to checkLiveStatusFree when no apiKey is provided', async () => {
      const mockHtml = `
        <html>
          <head><link rel="canonical" href="https://www.youtube.com/watch?v=freeVid111"></head>
          <body>"status":"LIVE", "isLive":true, "isLiveNow":true</body>
        </html>
      `;

      mock.method(axios, 'get', async () => {
        return { data: mockHtml };
      });

      const result = await checkLiveStatusUnified({
        apiKey: '',
        channelUrl: '@freeStreamer'
      });

      assert.equal(result.isLive, true);
      assert.equal(result.videoId, 'freeVid111');
    });

    it('should throw error when no channel identifier is provided', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatusFree('');
        },
        {
          name: 'Error',
          message: 'Channel URL or ID is required'
        }
      );
    });

    it('should throw "Request timeout" when free live check times out', async () => {
      mock.method(axios, 'get', async () => {
        const timeoutError = new Error('timeout of 10000ms exceeded');
        timeoutError.code = 'ECONNABORTED';
        throw timeoutError;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatusFree('@streamer');
        },
        {
          name: 'Error',
          message: 'Request timeout'
        }
      );
    });
  });
});
