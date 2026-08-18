const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculatePopupCoordinates, createWindowManager } = require('../src/main/windowManager');

describe('WindowManager Deep Module Tests', () => {
  describe('1. Corner Coordinate Calculations', () => {
    const workWidth = 1920;
    const workHeight = 1040;
    const popupWidth = 320;
    const popupHeight = 140;

    it('should calculate correct coordinates for bottom-right corner', () => {
      const coords = calculatePopupCoordinates('bottom-right', workWidth, workHeight, popupWidth, popupHeight);
      assert.equal(coords.x, 1600);
      assert.equal(coords.targetY, 900);
      assert.equal(coords.startY, 1040);
      assert.equal(coords.exitY, 1040);
    });

    it('should calculate correct coordinates for bottom-left corner', () => {
      const coords = calculatePopupCoordinates('bottom-left', workWidth, workHeight, popupWidth, popupHeight);
      assert.equal(coords.x, 0);
      assert.equal(coords.targetY, 900);
      assert.equal(coords.startY, 1040);
    });

    it('should calculate correct coordinates for top-right corner', () => {
      const coords = calculatePopupCoordinates('top-right', workWidth, workHeight, popupWidth, popupHeight);
      assert.equal(coords.x, 1600);
      assert.equal(coords.targetY, 0);
      assert.equal(coords.startY, -140);
      assert.equal(coords.exitY, -140);
    });

    it('should calculate correct coordinates for top-left corner', () => {
      const coords = calculatePopupCoordinates('top-left', workWidth, workHeight, popupWidth, popupHeight);
      assert.equal(coords.x, 0);
      assert.equal(coords.targetY, 0);
      assert.equal(coords.startY, -140);
      assert.equal(coords.exitY, -140);
    });
  });

  describe('2. WindowManager Interface Contract', () => {
    it('should expose expected deep module interface methods', () => {
      const fakeStore = { get: () => 'bottom-right' };
      const wm = createWindowManager({ store: fakeStore });

      assert.equal(typeof wm.createSettingsWindow, 'function');
      assert.equal(typeof wm.getSettingsWindow, 'function');
      assert.equal(typeof wm.broadcastToSettings, 'function');
      assert.equal(typeof wm.createPopupWindow, 'function');
      assert.equal(typeof wm.animatePopupOut, 'function');
      assert.equal(typeof wm.openInAppPlayer, 'function');
      assert.equal(typeof wm.setQuitting, 'function');
    });
  });
});
