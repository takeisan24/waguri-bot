const test = require('node:test');
const assert = require('node:assert/strict');
const { renderProgressBar, formatTime } = require('../src/lib/study');

test('renderProgressBar correct percentages', () => {
    assert.equal(renderProgressBar(0, 10), '[░░░░░░░░░░] 0%');
    assert.equal(renderProgressBar(50, 10), '[▓▓▓▓▓░░░░░] 50%');
    assert.equal(renderProgressBar(100, 10), '[▓▓▓▓▓▓▓▓▓▓] 100%');
});

test('formatTime mm:ss formatting', () => {
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(60_000), '01:00');
    assert.equal(formatTime(25 * 60 * 1000), '25:00');
});
