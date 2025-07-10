/**
 * /invite-admin Slash Command
 * Admin commands for managing invite statistics
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { formatInviteNumber } = require('../utils/altDetection');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite-admin')
        .setDescription('Admin commands for managing invite statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-bonus')
                .setDescription('Add bonus invites to a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to give bonus invites to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Number of bonus invites to add')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for giving bonus invites')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-invites')
                .setDescription('Remove invites from a user (adds fake invites)')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to remove invites from')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Number of invites to remove')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for removing invites')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-user')
                .setDescription('Reset all invite statistics for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to reset statistics for')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason for resetting statistics')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view-details')
                .setDescription('View detailed invite information for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to view details for')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        try {
            // Check if user has admin permissions
            if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.reply({
                    content: 'You need Administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            // Get invite tracker instance from the bot
            const inviteHandler = interaction.client.inviteHandler;
            
            if (!inviteHandler) {
                return await interaction.reply({
                    content: 'Invite tracking system is not available.',
                    ephemeral: true
                });
            }

            const inviteTracker = inviteHandler.getInviteTracker();
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'add-bonus':
                    await handleAddBonus(interaction, inviteTracker);
                    break;
                case 'remove-invites':
                    await handleRemoveInvites(interaction, inviteTracker);
                    break;
                case 'reset-user':
                    await handleResetUser(interaction, inviteTracker);
                    break;
                case 'view-details':
                    await handleViewDetails(interaction, inviteTracker);
                    break;
                default:
                    await interaction.reply({
                        content: 'Unknown subcommand.',
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('[INVITE ADMIN] Error executing command:', error);
            
            const errorMessage = 'There was an error processing the admin command. Please try again later.';
            
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

async function handleAddBonus(interaction, inviteTracker) {
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Get current stats
    const beforeStats = inviteTracker.getInviterStats(user.id);
    
    // Add bonus invites
    await inviteTracker.addBonusInvites(user.id, amount);
    
    // Get updated stats
    const afterStats = inviteTracker.getInviterStats(user.id);

    const embed = new EmbedBuilder()
        .setTitle('✅ Bonus Invites Added')
        .setColor(0x00FF00)
        .addFields(
            { name: 'User', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Amount Added', value: `+${amount} bonus invites`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { 
                name: 'Before', 
                value: `Total: ${formatInviteNumber(beforeStats.total)} | Bonus: ${beforeStats.bonus}`, 
                inline: true 
            },
            { 
                name: 'After', 
                value: `Total: ${formatInviteNumber(afterStats.total)} | Bonus: ${afterStats.bonus}`, 
                inline: true 
            }
        )
        .setTimestamp()
        .setFooter({ 
            text: `Action by ${interaction.user.username}`, 
            iconURL: interaction.user.displayAvatarURL() 
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRemoveInvites(interaction, inviteTracker) {
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Get current stats
    const beforeStats = inviteTracker.getInviterStats(user.id);
    
    // Remove invites (adds fake invites)
    await inviteTracker.removeInvites(user.id, amount);
    
    // Get updated stats
    const afterStats = inviteTracker.getInviterStats(user.id);

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Invites Removed')
        .setColor(0xFF0000)
        .addFields(
            { name: 'User', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Amount Removed', value: `-${amount} invites`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { 
                name: 'Before', 
                value: `Total: ${formatInviteNumber(beforeStats.total)} | Fake: ${beforeStats.fake}`, 
                inline: true 
            },
            { 
                name: 'After', 
                value: `Total: ${formatInviteNumber(afterStats.total)} | Fake: ${afterStats.fake}`, 
                inline: true 
            }
        )
        .setTimestamp()
        .setFooter({ 
            text: `Action by ${interaction.user.username}`, 
            iconURL: interaction.user.displayAvatarURL() 
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleResetUser(interaction, inviteTracker) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    // Get current stats for logging
    const beforeStats = inviteTracker.getInviterStats(user.id);
    
    // Reset user statistics
    const userIdStr = user.id.toString();
    inviteTracker.data.inviters[userIdStr] = {
        regular: 0,
        fake: 0,
        bonus: 0,
        leaves: 0
    };
    
    // Clear member data for this user's invites
    for (const [memberId, memberData] of Object.entries(inviteTracker.data.members)) {
        if (memberData.inviter === userIdStr) {
            delete inviteTracker.data.members[memberId];
        }
    }
    
    await inviteTracker.saveInvites();

    const embed = new EmbedBuilder()
        .setTitle('🔄 User Statistics Reset')
        .setColor(0xFF8C00)
        .addFields(
            { name: 'User', value: `${user.username} (${user.id})`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { 
                name: 'Previous Stats', 
                value: `Total: ${formatInviteNumber(beforeStats.total)}\nRegular: ${beforeStats.regular} | Fake: ${beforeStats.fake}\nBonus: ${beforeStats.bonus} | Leaves: ${beforeStats.leaves}`, 
                inline: false 
            },
            { name: 'Current Stats', value: 'All statistics reset to 0', inline: false }
        )
        .setTimestamp()
        .setFooter({ 
            text: `Action by ${interaction.user.username}`, 
            iconURL: interaction.user.displayAvatarURL() 
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleViewDetails(interaction, inviteTracker) {
    const user = interaction.options.getUser('user');
    const stats = inviteTracker.getInviterStats(user.id);
    const memberData = inviteTracker.getMemberData(user.id);

    // Get invited members by this user
    const invitedMembers = Object.entries(inviteTracker.data.members)
        .filter(([memberId, data]) => data.inviter === user.id.toString())
        .map(([memberId, data]) => ({ memberId, ...data }));

    const embed = new EmbedBuilder()
        .setTitle(`📊 Detailed Invite Information: ${user.username}`)
        .setColor(0x0C00B6)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { 
                name: '📈 Statistics', 
                value: `**Total:** ${formatInviteNumber(stats.total)}\n**Regular:** ${stats.regular}\n**Fake/Alt:** ${stats.fake}\n**Bonus:** ${stats.bonus}\n**Leaves:** ${stats.leaves} (${formatInviteNumber(stats.leavesDeduction)} penalty)`, 
                inline: true 
            },
            { 
                name: '👥 Members Invited', 
                value: `**Total Members:** ${invitedMembers.length}\n**Currently in Server:** ${invitedMembers.filter(m => !m.left_at).length}\n**Left Server:** ${invitedMembers.filter(m => m.left_at).length}`, 
                inline: true 
            }
        );

    // Add member join info if this user was invited by someone
    if (memberData) {
        let inviterInfo = 'Unknown';
        if (memberData.inviter_name) {
            inviterInfo = memberData.inviter_name;
        }
        
        embed.addFields({
            name: '🎯 Join Information',
            value: `**Invited By:** ${inviterInfo}\n**Joined:** ${new Date(memberData.joined_at).toLocaleDateString()}\n**Status:** ${memberData.left_at ? 'Left' : 'Active'}`,
            inline: false
        });
    }

    // Add recent invites (last 5)
    const recentInvites = invitedMembers
        .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at))
        .slice(0, 5);

    if (recentInvites.length > 0) {
        const recentText = recentInvites.map(member => {
            const joinDate = new Date(member.joined_at).toLocaleDateString();
            const status = member.left_at ? '❌ Left' : '✅ Active';
            const altFlag = member.is_alt ? ' 🔴 Alt' : '';
            return `<@${member.memberId}> - ${joinDate} ${status}${altFlag}`;
        }).join('\n');

        embed.addFields({
            name: '🕒 Recent Invites',
            value: recentText,
            inline: false
        });
    }

    embed.setTimestamp()
        .setFooter({ 
            text: 'Detailed Invite Information', 
            iconURL: interaction.client.user.displayAvatarURL() 
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });
} 