const { SlashCommandBuilder } = require('discord.js');
const { runGather } = require('../../lib/gather');

const TABLE = [
    { name: 'Đá thường', emoji: '🪨', weight: 30, min: 10, max: 50 },
    { name: 'Than đá', emoji: '⚫', weight: 25, min: 40, max: 120 },
    { name: 'Quặng sắt', emoji: '⛏️', weight: 20, min: 80, max: 200 },
    { name: 'Quặng đồng', emoji: '🟤', weight: 12, min: 150, max: 350 },
    { name: 'Bạc', emoji: '⚪', weight: 8, min: 300, max: 600 },
    { name: 'Vàng', emoji: '🟡', weight: 4, min: 600, max: 1500 },
    { name: 'Kim cương', emoji: '💎', weight: 1, min: 2000, max: 6000 },
];

module.exports = {
    data: new SlashCommandBuilder().setName('mine').setDescription('Đi đào mỏ kiếm tiền (tốn năng lượng) ⛏️'),
    execute: (interaction) => runGather(interaction, { title: '⛏️ Đi đào mỏ', table: TABLE }),
};
