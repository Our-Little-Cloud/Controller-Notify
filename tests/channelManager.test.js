const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeChannel,
  parseSubscriptionsCsv,
  addChannelToList,
  removeChannelFromList,
  toggleChannelEnabled,
  migrateChannelsStore
} = require('../src/main/channelManager');

describe('Channel Manager & CSV Importer Tests', () => {
  describe('1. Google Takeout CSV Parsing', () => {
    it('should parse standard Google Takeout subscriptions.csv correctly', () => {
      const sampleCsv = `Channel Id,Channel Url,Channel Title
UC_x5XG1OV2P6uZZ5FSM9Ttw,http://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw,Google Developers
UC-lHJZR3Gqxm24_Vd_AJ5Yw,http://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw,PewDiePie
UC1234567890abcdef,https://www.youtube.com/@streamer,"Awesome Gamer, Live"`;

      const result = parseSubscriptionsCsv(sampleCsv);

      assert.equal(result.length, 3);
      assert.equal(result[0].id, 'UC_x5XG1OV2P6uZZ5FSM9Ttw');
      assert.equal(result[0].title, 'Google Developers');
      assert.equal(result[0].enabled, true);

      assert.equal(result[1].id, 'UC-lHJZR3Gqxm24_Vd_AJ5Yw');
      assert.equal(result[1].title, 'PewDiePie');

      assert.equal(result[2].id, 'UC1234567890abcdef');
      assert.equal(result[2].handle, '@streamer');
      assert.equal(result[2].title, 'Awesome Gamer, Live');
    });

    it('should handle empty or invalid CSV content gracefully', () => {
      assert.deepEqual(parseSubscriptionsCsv(''), []);
      assert.deepEqual(parseSubscriptionsCsv(null), []);
      assert.deepEqual(parseSubscriptionsCsv('   \n\n  '), []);
    });
  });

  describe('2. Channel Normalization', () => {
    it('should extract handle from URL with /@', () => {
      const channel = normalizeChannel({
        url: 'https://youtube.com/@VanTung'
      });

      assert.equal(channel.handle, '@VanTung');
      assert.equal(channel.title, 'VanTung');
      assert.equal(channel.enabled, true);
    });

    it('should handle standalone @handle inputs', () => {
      const channel = normalizeChannel({
        handle: '@prostreamer'
      });

      assert.equal(channel.handle, '@prostreamer');
      assert.equal(channel.url, 'https://www.youtube.com/@prostreamer');
      assert.equal(channel.title, 'prostreamer');
    });
  });

  describe('3. Channel List Operations (Add, Remove, Toggle)', () => {
    it('should add new channels and prevent duplicate channel IDs', () => {
      let list = [];
      list = addChannelToList(list, { id: 'UC1', handle: '@channel1', title: 'Channel One' });
      list = addChannelToList(list, { id: 'UC2', handle: '@channel2', title: 'Channel Two' });
      assert.equal(list.length, 2);

      // Add duplicate with updated title
      list = addChannelToList(list, { id: 'UC1', handle: '@channel1', title: 'Channel One Updated' });
      assert.equal(list.length, 2);
      assert.equal(list[0].title, 'Channel One Updated');
    });

    it('should toggle channel notification enabled status', () => {
      const list = [
        { id: 'UC1', title: 'Channel 1', enabled: true },
        { id: 'UC2', title: 'Channel 2', enabled: true }
      ];

      const updated = toggleChannelEnabled(list, 'UC1', false);
      assert.equal(updated[0].enabled, false);
      assert.equal(updated[1].enabled, true);

      const toggledBack = toggleChannelEnabled(updated, 'UC1');
      assert.equal(toggledBack[0].enabled, true);
    });

    it('should remove a channel by identifier', () => {
      const list = [
        { id: 'UC1', handle: '@channel1', title: 'Channel 1' },
        { id: 'UC2', handle: '@channel2', title: 'Channel 2' }
      ];

      const filtered = removeChannelFromList(list, '@channel1');
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].id, 'UC2');
    });
  });

  describe('4. Store Migration', () => {
    it('should migrate legacy single-channel store to channels list', () => {
      const legacyStore = {
        channelId: 'UC_legacy_123',
        channelUrl: 'https://youtube.com/@oldStreamer',
        channels: []
      };

      const channels = migrateChannelsStore(legacyStore);

      assert.equal(channels.length, 1);
      assert.equal(channels[0].id, 'UC_legacy_123');
      assert.equal(channels[0].handle, '@oldStreamer');
    });

    it('should not overwrite existing channels array during migration', () => {
      const existingStore = {
        channelId: 'UC_legacy',
        channels: [{ id: 'UC_new_1', title: 'New Channel' }]
      };

      const channels = migrateChannelsStore(existingStore);
      assert.equal(channels.length, 1);
      assert.equal(channels[0].id, 'UC_new_1');
    });
  });
});
