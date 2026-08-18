const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { checkLiveStatus } = require('../src/main/youtube');

describe('YouTube API - API Key Tests', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe('1. Missing or Undefined API Key Validation', () => {
    it('should throw an error when apiKey is undefined in checkLiveStatus', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus(undefined, 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });

    it('should throw an error when apiKey is empty string in checkLiveStatus', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus('', 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });

    it('should throw an error when apiKey is null in checkLiveStatus', async () => {
      await assert.rejects(
        async () => {
          await checkLiveStatus(null, 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
        },
        {
          name: 'Error',
          message: 'API key and channel ID are required'
        }
      );
    });
  });

  describe('2. Invalid API Key & Quota Exceeded (HTTP 403)', () => {
    it('should throw "Invalid API key or quota exceeded" when YouTube API responds with 403 Forbidden', async () => {
      mock.method(axios, 'get', async () => {
        const error = new Error('Request failed with status code 403');
        error.response = {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'The request cannot be completed because you have exceeded your quota.',
              errors: [{ reason: 'quotaExceeded' }]
            }
          }
        };
        throw error;
      });

      await assert.rejects(
        async () => {
          await checkLiveStatus('INVALID_OR_QUOTA_EXCEEDED_KEY', 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
        },
        {
          name: 'Error',
          message: 'Invalid API key or quota exceeded'
        }
      );
    });

    it('should pass the provided API key as a query param to axios in checkLiveStatus', async () => {
      let capturedParams;
      mock.method(axios, 'get', async (url, config) => {
        capturedParams = config.params;
        return {
          data: {
            items: []
          }
        };
      });

      const testApiKey = 'AIzaSyD-TEST-API-KEY-12345';
      await checkLiveStatus(testApiKey, 'UC_x5XG1OV2P6uZZ5FSM9Ttw');

      assert.equal(capturedParams.key, testApiKey);
    });
  });
});
