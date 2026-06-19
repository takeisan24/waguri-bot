require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const { genCard, hasBingo, activeBingoGames, hasActiveBingoGame } = require('../src/lib/bingoPrefix');
const { activeLotoGames, hasActiveGame: hasActiveLotoGame } = require('../src/lib/loto');

test('Bingo: genCard format and center cell', () => {
    const card = genCard();
    assert.strictEqual(card.length, 5, 'Card must have 5 rows');
    for (let r = 0; r < 5; r++) {
        assert.strictEqual(card[r].length, 5, `Row ${r} must have 5 columns`);
    }
    assert.strictEqual(card[2][2], null, 'Center cell [2][2] must be null (FREE slot)');
});

test('Bingo: hasBingo horizontal line detection', () => {
    // 5x5 grid
    const grid = [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, null, 48, 63],
        [4, 19, 34, 49, 64],
        [5, 20, 35, 50, 65]
    ];
    
    // Line 0 marked
    let marked = new Set([1, 16, 31, 46, 61]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed Row 0');

    // Line 2 marked (includes null)
    marked = new Set([3, 18, 48, 63]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed Row 2 (with FREE cell)');

    // Incomplete line
    marked = new Set([3, 18, 48]);
    assert.strictEqual(hasBingo(grid, marked), false, 'Bingo should not detect incomplete row');
});

test('Bingo: hasBingo vertical line detection', () => {
    const grid = [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, null, 48, 63],
        [4, 19, 34, 49, 64],
        [5, 20, 35, 50, 65]
    ];

    // Col 0 marked
    let marked = new Set([1, 2, 3, 4, 5]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed Column 0');

    // Col 2 marked (includes null)
    marked = new Set([31, 32, 34, 35]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed Column 2 (with FREE cell)');
});

test('Bingo: hasBingo diagonal line detection', () => {
    const grid = [
        [1, 16, 31, 46, 61],
        [2, 17, 32, 47, 62],
        [3, 18, null, 48, 63],
        [4, 19, 34, 49, 64],
        [5, 20, 35, 50, 65]
    ];

    // Main diagonal: (0,0), (1,1), (2,2)=null, (3,3), (4,4)
    let marked = new Set([1, 17, 49, 65]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed main diagonal');

    // Anti-diagonal: (0,4), (1,3), (2,2)=null, (3,1), (4,0)
    marked = new Set([61, 47, 19, 5]);
    assert.strictEqual(hasBingo(grid, marked), true, 'Bingo should detect completed anti-diagonal');
});

test('Game maps and active game status check', () => {
    const testChannelId = 'test_channel_123';
    
    // Initial state
    assert.strictEqual(hasActiveLotoGame(testChannelId), false);
    assert.strictEqual(hasActiveBingoGame(testChannelId), false);

    // Mock Loto Game
    activeLotoGames.set(testChannelId, { status: 'lobby' });
    assert.strictEqual(hasActiveLotoGame(testChannelId), true);
    assert.strictEqual(hasActiveBingoGame(testChannelId), false);
    
    // Clear
    activeLotoGames.delete(testChannelId);
    assert.strictEqual(hasActiveLotoGame(testChannelId), false);

    // Mock Bingo Game
    activeBingoGames.set(testChannelId, { status: 'lobby' });
    assert.strictEqual(hasActiveBingoGame(testChannelId), true);
    assert.strictEqual(hasActiveLotoGame(testChannelId), false);

    // Clear
    activeBingoGames.delete(testChannelId);
    assert.strictEqual(hasActiveBingoGame(testChannelId), false);
});
