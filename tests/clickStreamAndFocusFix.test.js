const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('IPC Click Stream Routing & Focus Tests', () => {
  it('should use targeted videoId over fallback streamData when specified in click-stream payload', () => {
    const mockStatus = {
      streamData: { videoId: 'streamerA_111', title: 'Streamer A' },
      liveChannels: [{ currentStream: { videoId: 'streamerA_111' } }]
    };

    function resolveClickUrl(targetVideoId, status) {
      const videoId = targetVideoId || status.streamData?.videoId;
      if (videoId && videoId !== 'live') {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
      return null;
    }

    // 1. When clicking notification for Streamer B ('streamerB_999')
    const clickedUrl = resolveClickUrl('streamerB_999', mockStatus);
    assert.equal(clickedUrl, 'https://www.youtube.com/watch?v=streamerB_999');

    // 2. Fallback when no targetVideoId is passed
    const fallbackUrl = resolveClickUrl(null, mockStatus);
    assert.equal(fallbackUrl, 'https://www.youtube.com/watch?v=streamerA_111');
  });

  it('should verify has-img class toggling prevents dual rendering of default gamepad icon and thumbnail', () => {
    function getControllerImageClassList(hasCustomImage, hasThumbnail) {
      const classes = ['controller-image'];
      if (hasCustomImage || hasThumbnail) {
        classes.push('has-img');
      }
      return classes.join(' ');
    }

    assert.equal(getControllerImageClassList(false, 'https://i.ytimg.com/thumb.jpg'), 'controller-image has-img');
    assert.equal(getControllerImageClassList(false, null), 'controller-image');
  });
});
