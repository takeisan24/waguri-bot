const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const playlist = require('../src/data/hvl_playlist.json');
const hvlPlayer = require('../src/lib/hvlPlayer');

describe('🎵 Easter Egg Album HVL - MCK Expanded Test Suite', () => {
    it('1. Playlist metadata phải có đúng 30 bài hát theo thứ tự 1..30', () => {
        assert.equal(playlist.length, 30, 'Phải có đúng 30 bài hát');

        playlist.forEach((track, index) => {
            assert.equal(track.id, index + 1, `Track ID phải là ${index + 1}`);
            assert.ok(track.title && track.title.length > 0, `Bài hát #${track.id} phải có tiêu đề`);
            assert.ok(track.fileName && track.fileName.endsWith('.mp3'), `Bài hát #${track.id} phải có fileName .mp3`);
            assert.ok(['INTRO', 'MELLOW', 'HYPE', 'EMOTIONAL', 'FUN'].includes(track.group), `Bài hát #${track.id} phải có nhóm cảm xúc hợp lệ`);
        });
    });

    it('2. Đơn vị phát nhạc hvlPlayer phải xuất đủ các hàm cốt lõi', () => {
        assert.equal(typeof hvlPlayer.startHvlPlayer, 'function', 'Phải có hàm startHvlPlayer');
        assert.equal(typeof hvlPlayer.handleHvlButton, 'function', 'Phải có hàm handleHvlButton');
        assert.equal(typeof hvlPlayer.destroyPlayer, 'function', 'Phải có hàm destroyPlayer');
        assert.ok(hvlPlayer.players instanceof Map, 'players phải là Map');
    });

    it('3. Đơn vị đĩa cứng local phải có đủ 30 tệp MP3', () => {
        const localDir = process.env.HVL_AUDIO_DIR || 'C:\\Users\\LAPTOP\\Downloads\\SoundLoadMate.com - H.V.L album RPT MCK - Haziel';
        if (fs.existsSync(localDir)) {
            let foundCount = 0;
            playlist.forEach(track => {
                const filePath = path.join(localDir, track.fileName);
                if (fs.existsSync(filePath)) {
                    foundCount++;
                }
            });
            assert.equal(foundCount, 30, `Phải tìm thấy 30/30 file MP3 trong thư mục local downloads (Tìm thấy: ${foundCount})`);
        } else {
            console.log('Thư mục local không tồn tại ở môi trường CI/Prod, bỏ qua check đĩa cứng local');
        }
    });

    it('4. Phải gán nhóm cảm xúc chính xác cho 5 nhóm bài hát', () => {
        const elegie = playlist.find(t => t.id === 1);
        const idk = playlist.find(t => t.id === 2);
        const baby = playlist.find(t => t.id === 5);
        const yeuAnh = playlist.find(t => t.id === 6);
        const thitLon = playlist.find(t => t.id === 30);

        assert.equal(elegie.group, 'INTRO', 'Elegie thuộc nhóm INTRO');
        assert.equal(idk.group, 'HYPE', 'IDK thuộc nhóm HYPE');
        assert.equal(baby.group, 'MELLOW', 'Baby thuộc nhóm MELLOW');
        assert.equal(yeuAnh.group, 'EMOTIONAL', 'Yêu Anh Giết Anh thuộc nhóm EMOTIONAL');
        assert.equal(thitLon.group, 'FUN', 'Thịt Lợn thuộc nhóm FUN');
    });

    it('5. handleHvlButton phải bỏ qua các customId không bắt đầu bằng hvl_', async () => {
        const dummyInteraction = { customId: 'other_button' };
        const handled = await hvlPlayer.handleHvlButton(dummyInteraction);
        assert.equal(handled, false, 'Không xử lý các button khác');
    });
});
