const { SlashCommandBuilder } = require('discord.js');
const { runGather } = require('../../lib/gather');

const TABLE = [
    { name: 'Củi khô', emoji: '🪵', weight: 35, min: 10, max: 40 },
    { name: 'Gỗ thường', emoji: '🌲', weight: 30, min: 40, max: 120 },
    { name: 'Gỗ lim', emoji: '🪟', weight: 20, min: 120, max: 300 },
    { name: 'Gỗ hương', emoji: '🌳', weight: 10, min: 300, max: 700 },
    { name: 'Trầm hương', emoji: '🪔', weight: 4, min: 800, max: 2000 },
    { name: 'Gỗ sưa đỏ', emoji: '✨', weight: 1, min: 3000, max: 8000 },
];

module.exports = {
    data: new SlashCommandBuilder().setName('chop').setDescription('Đi chặt gỗ kiếm tiền (tốn năng lượng) 🪓'),
    execute: (interaction) => runGather(interaction, { title: '🪓 Đi chặt gỗ', table: TABLE }),
};
