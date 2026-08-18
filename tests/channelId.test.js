const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { checkLiveStatus, getChannelIdFromUrl } = require('../src/main/youtube');

describe('YouTube API - Channel ID Tests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('1. Missing Channel ID Validation in checkLiveStatus', () => {
    it('should throw an error when channelId is undefined', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus('valid-api-key', undefined);
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });

    it('should throw an error when channelId is empty string', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus('valid-api-key', '');
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });

    it('should throw an error when channelId is null', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus('valid-api-key', null);
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });
  });

  describe('2. Invalid Channel ID Format (HTTP 400)', () => {
    it('should throw "Invalid channel ID" when YouTube API returns HTTP 400', async () => {
      mock.method(axios, 'get', async () => {
        const error = new Error('Request failed with status code 400');
        error.response = {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Invalid channel ID parameter',
              errors: [{ reason: 'invalidParameter' }]
            }
          }
        };
        throw error;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('valid-api-key', 'INVALID_CHANNEL_ID');
        },
        {
          name: 'Error',
          message: 'Invalid channel ID'
        }
      );
    });
  });

  describe('3. Direct Channel ID Query and Parameter Verification', () => {
    it('should pass correct channelId in parameters to YouTube Search API', async () => {
      let capturedParams;
      mock.method(axios, 'get', async (url, config) => {
        capturedParams = config.params;
        return {
          data: {
            items: []
          }
        };
      });

      const targetChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
      await checkLiveStatus('test-key', targetChannelId);

      assert.equal(capturedParams.channelId, targetChannelId);
    });

    it('should resolve channel ID from direct /channel/ URL', async () => {
      const channelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
      const channelUrl = `https://www.youtube.com/channel/${channelId}`;

      let requestedUrl;
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedUrl = url;
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: channelId }]
          }
        };
      });

      const resolvedId = await getChannelIdFromUrl('test-key', channelUrl);

      assert.equal(resolvedId, channelId);
      assert.equal(requestedUrl, 'https://www.googleapis.com/youtube/v3/channels');
      assert.equal(requestedParams.id, channelId);
      assert.equal(requestedParams.part, 'id');
      assert.equal(requestedParams.key, 'test-key');
    });
  });
});
