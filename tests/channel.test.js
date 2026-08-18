const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { getChannelIdFromUrl } = require('../src/main/youtube');

describe('YouTube API - Channel URL & Handle Resolution Tests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('1. Handle URLs (@handle)', () => {
    it('should resolve channel ID from handle URL: https://youtube.com/@pewdiepie', async () => {
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: 'UC-lHJZR3Gqxm24_Vd_AJ5Yw' }]
          }
        };
      });

      const result = await getChannelIdFromUrl('test-key', 'https://youtube.com/@pewdiepie');

      assert.equal(result, 'UC-lHJZR3Gqxm24_Vd_AJ5Yw');
      assert.equal(requestedParams.forHandle, 'pewdiepie');
      assert.equal(requestedParams.part, 'id');
    });

    it('should resolve channel ID from raw @handle string: youtube.com/@streamer', async () => {
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: 'UC1234567890abcdef' }]
          }
        };
      });

      const result = await getChannelIdFromUrl('test-key', 'youtube.com/@streamer');

      assert.equal(result, 'UC1234567890abcdef');
      assert.equal(requestedParams.forHandle, 'streamer');
    });

    it('should resolve channel ID from standalone @handle: @VanTung', async () => {
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: 'UC_vantung_resolved_id' }]
          }
        };
      });

      const result = await getChannelIdFromUrl('test-key', '@VanTung');

      assert.equal(result, 'UC_vantung_resolved_id');
      assert.equal(requestedParams.forHandle, 'VanTung');
    });
  });

  describe('2. Custom Channel URLs (/c/ and /user/)', () => {
    it('should resolve channel ID from /c/ URL: https://www.youtube.com/c/CreatorName', async () => {
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: 'UC_custom_creator_123' }]
          }
        };
      });

      const result = await getChannelIdFromUrl('test-key', 'https://www.youtube.com/c/CreatorName');

      assert.equal(result, 'UC_custom_creator_123');
      assert.equal(requestedParams.forUsername, 'CreatorName');
      assert.equal(requestedParams.part, 'id');
    });

    it('should resolve channel ID from /user/ URL: https://youtube.com/user/ClassicUser', async () => {
      let requestedParams;
      mock.method(axios, 'get', async (url, config) => {
        requestedParams = config.params;
        return {
          data: {
            items: [{ id: 'UC_classic_user_456' }]
          }
        };
      });

      const result = await getChannelIdFromUrl('test-key', 'https://youtube.com/user/ClassicUser');

      assert.equal(result, 'UC_classic_user_456');
      assert.equal(requestedParams.forUsername, 'ClassicUser');
    });
  });

  describe('3. Unresolved / Invalid Channel URLs', () => {
    it('should throw error when URL does not match any YouTube channel pattern', async () => {
      await assert.rejects(
        async () => {
          await getChannelIdFromUrl('test-key', 'https://invalid-website.com/something');
        },
        {
          name: 'Error',
          message: 'Could not resolve channel ID from URL'
        }
      );
    });

    it('should throw error when YouTube API returns empty items list for channel URL', async () => {
      mock.method(axios, 'get', async () => {
        return {
          data: {
            items: []
          }
        };
      });

      await assert.rejects(
        async () => {
          await getChannelIdFromUrl('test-key', 'https://youtube.com/@non_existent_channel');
        },
        {
          name: 'Error',
          message: 'Could not resolve channel ID from URL'
        }
      );
    });

    it('should throw error when YouTube API request throws an error', async () => {
      mock.method(axios, 'get', async () => {
        throw new Error('API Request Failed');
      });

      await assert.rejects(
        async () => {
          await getChannelIdFromUrl('test-key', 'https://youtube.com/@non_existent_channel');
        },
        {
          name: 'Error',
          message: 'Could not resolve channel ID from URL'
        }
      );
    });
  });
});
