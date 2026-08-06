import assert from 'node:assert/strict';
import { __test } from '../server/lib/sportybet-browser.mjs';

const expectedToday = __test.coerceKickoff('Today 18:30')?.toISOString();
const expectedTomorrow = __test.coerceKickoff('Tomorrow 20:00')?.toISOString();

const payload = {
  data: {
    booking: {
      bookingCode: 'AB12CD',
      events: [
        {
          eventName: 'Accra Lions vs Hearts of Oak',
          estimateStartTime: 'Today 18:30',
          tournamentName: 'Ghana Premier League',
          markets: [
            {
              marketName: 'Match Result',
              selections: [
                { selectionName: 'Home', odd: '1.85' },
              ],
            },
          ],
        },
      ],
    },
  },
};

const tips = __test.scanTips(payload);
assert.equal(tips.length, 1);
assert.equal(tips[0].fixture, 'Accra Lions vs Hearts of Oak');
assert.equal(tips[0].market, 'Match Result');
assert.equal(tips[0].pick, 'Home');
assert.equal(tips[0].odds, 1.85);
assert.equal(tips[0].league, 'Ghana Premier League');
assert.equal(tips[0].kickoff, expectedToday);

const tomorrowPayload = {
  eventName: 'Kotoko vs Medeama',
  eventDate: 'Tomorrow 20:00',
  leagueName: 'Ghana Premier League',
  marketGroups: [
    {
      name: 'Total Goals',
      outcomes: [
        { name: 'Over 1.5', price: 1.24 },
      ],
    },
  ],
};
const tomorrow = __test.scanTips(tomorrowPayload);
assert.equal(tomorrow.length, 1);
assert.equal(tomorrow[0].market, 'Total Goals');
assert.equal(tomorrow[0].pick, 'Over 1.5');
assert.equal(tomorrow[0].kickoff, expectedTomorrow);

console.log('nested kickoff inheritance v21.7.3 test passed');
