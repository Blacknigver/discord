/**
 * /invites Slash Command
 * Displays detailed invite statistics for users
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatInviteNumber } = require('../utils/altDetection');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Check your or another user\'s invite statistics')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to check invites for (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            // Get target user (command user if no user specified)
            const targetUser = interaction.options.getUser('user') || interaction.user;

            // Get invite tracker instance from the bot
            const inviteHandler = interaction.client.inviteHandler;
            
            if (!inviteHandler) {
                return await interaction.reply({
                    content: 'Invite tracking system is not available.',
                    ephemeral: true
                });
            }

            const inviteTracker = inviteHandler.getInviteTracker();

            // Get user invite statistics
            const stats = inviteTracker.getInviterStats(targetUser.id);

            // Format numbers
            const formattedTotal = formatInviteNumber(stats.total);
            const formattedLeavesDeduction = formatInviteNumber(stats.leavesDeduction);

            // Create embed
            const title = targetUser.id === interaction.user.id 
                ? "📊 Your Invite Stats" 
                : `📊 ${targetUser.username}'s Invite Stats`;

            const description = [
                `# Total Invites: ${formattedTotal}`,
                `> <:checkmark:1376998831098691805> Regular: \`${stats.regular}\``,
                `> <:cross:1376998892100386827> Fake: \`${stats.fake}\``,
                `> <:x_:1376999630440497194> Leaves: \`${formattedLeavesDeduction}\``,
                `> <:sparkle:1376977907855130626> Bonus: \`${stats.bonus}\``
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(0x0C00B6) // RGB(12, 0, 182)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ 
                    text: 'Invite Statistics', 
                    iconURL: interaction.client.user.displayAvatarURL() 
                });

            // Add additional info if user has significant stats
            if (stats.total >= 10) {
                embed.addFields({
                    name: '🎉 Great Inviter!',
                    value: 'Thank you for growing our community!',
                    inline: false
                });
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

        } catch (error) {
            console.error('[INVITES COMMAND] Error executing command:', error);
            
            const errorMessage = 'There was an error retrieving invite statistics. Please try again later.';
            
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