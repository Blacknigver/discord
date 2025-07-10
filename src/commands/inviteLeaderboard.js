/**
 * /invite-leaderboard Slash Command
 * Displays the top inviters on the server
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatInviteNumber } = require('../utils/altDetection');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-leaderboard')
        .setDescription('Show the top inviters on the server')
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('Number of top inviters to show (1-25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),

    async execute(interaction) {
        try {
            const limit = interaction.options.getInteger('limit') || 10;

            // Get invite tracker instance from the bot
            const inviteHandler = interaction.client.inviteHandler;
            
            if (!inviteHandler) {
                return await interaction.reply({
                    content: 'Invite tracking system is not available.',
                    ephemeral: true
                });
            }

            const inviteTracker = inviteHandler.getInviteTracker();

            // Get all inviter data and sort by total invites
            const inviters = Object.entries(inviteTracker.data.inviters)
                .map(([userId, data]) => ({
                    userId,
                    stats: inviteTracker.getInviterStats(userId)
                }))
                .filter(inviter => inviter.stats.total > 0) // Only show users with invites
                .sort((a, b) => b.stats.total - a.stats.total)
                .slice(0, limit);

            if (inviters.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Invite Leaderboard')
                    .setDescription('No invite data available yet. Start inviting members to appear on the leaderboard!')
                    .setColor(0x0C00B6)
                    .setTimestamp()
                    .setFooter({ 
                        text: 'Invite Leaderboard', 
                        iconURL: interaction.client.user.displayAvatarURL() 
                    });

                return await interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });
            }

            // Create leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 Invite Leaderboard')
                .setColor(0x0C00B6)
                .setTimestamp()
                .setFooter({ 
                    text: `Top ${inviters.length} Inviters`, 
                    iconURL: interaction.client.user.displayAvatarURL() 
                });

            // Add description with server stats
            const totalInvites = inviters.reduce((sum, inviter) => sum + inviter.stats.total, 0);
            embed.setDescription(`**Total Server Invites:** ${formatInviteNumber(totalInvites)}\n\u200b`);

            // Generate leaderboard entries
            let leaderboardText = '';
            const medals = ['🥇', '🥈', '🥉'];
            
            for (let i = 0; i < inviters.length; i++) {
                const inviter = inviters[i];
                const position = i + 1;
                
                // Get user info
                let username = 'Unknown User';
                try {
                    const user = await interaction.client.users.fetch(inviter.userId);
                    username = user.username;
                } catch (error) {
                    console.log(`Could not fetch user ${inviter.userId}: ${error.message}`);
                }

                // Format position with medal or number
                const positionIcon = i < 3 ? medals[i] : `**${position}.**`;
                const totalInvites = formatInviteNumber(inviter.stats.total);
                
                // Create detailed breakdown
                const breakdown = `(${inviter.stats.regular}r, ${inviter.stats.fake}f, ${inviter.stats.bonus}b, ${formatInviteNumber(inviter.stats.leavesDeduction)}l)`;
                
                leaderboardText += `${positionIcon} **${username}** - ${totalInvites} invites ${breakdown}\n`;
            }

            embed.addFields({
                name: '📋 Rankings',
                value: leaderboardText || 'No data available',
                inline: false
            });

            // Add legend
            embed.addFields({
                name: '📖 Legend',
                value: '`r` = Regular, `f` = Fake/Alt, `b` = Bonus, `l` = Leaves (×1.0)',
                inline: false
            });

            await interaction.reply({
                embeds: [embed],
                ephemeral: false // Public leaderboard
            });

        } catch (error) {
            console.error('[INVITE LEADERBOARD] Error executing command:', error);
            
            const errorMessage = 'There was an error generating the invite leaderboard. Please try again later.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    }
}; 