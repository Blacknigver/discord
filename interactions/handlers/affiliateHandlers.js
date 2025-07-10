const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ContainerBuilder, SeparatorBuilder } = require('@discordjs/builders');

// Helper function for crypto withdrawal modal
function showCryptoModal(interaction, coin) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder().setCustomId(`withdraw_crypto_modal_${coin.toLowerCase()}`).setTitle(`${coin} Withdrawal`);
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('wallet').setLabel(`${coin} Address`).setStyle(TextInputStyle.Short).setPlaceholder(`Enter your ${coin} address`).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('withdraw_amount').setLabel('Amount to Withdraw (€)').setStyle(TextInputStyle.Short).setPlaceholder('Leave blank = All').setRequired(false)
        )
    );
    return interaction.showModal(modal);
}

const affiliateHandlers = {
    // =======================
    // Affiliate Program Buttons
    // =======================
    affiliate_info: async (interaction) => {
        try {
            const { MessageFlags } = require('discord.js');

            const infoContainer = new ContainerBuilder()
                .setAccentColor(0x4a90e2)
                .addTextDisplayComponents(txt => txt.setContent('# Affiliate Program Information'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                // Withdrawal Information
                .addTextDisplayComponents(txt => txt.setContent('## Withdrawal Information'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('- Withdrawals are done through PayPal, Crypto, or IBAN Bank Transfer.\n- The minimum withdrawal is €1.\n- The maximum withdrawal per day is 1.'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(2))
                // Commission Information
                .addTextDisplayComponents(txt => txt.setContent('## Commission Information'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('- You earn **5% commission** on all boost purchases made using your invite link.\n- Commissions are automatically added to your affiliate balance.\n- You can track your earnings and referrals in real-time.'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(2))
                // How to Start
                .addTextDisplayComponents(txt => txt.setContent('## How to Start'))
                .addSeparatorComponents(sep => sep.setDivider(false).setSpacing(1))
                .addTextDisplayComponents(txt => txt.setContent('1. Share your unique invite link with friends\n2. When they join using your link and make purchases, you earn commission\n3. Withdraw your earnings when you reach the minimum amount'))
                .addSeparatorComponents(sep => sep.setDivider(true).setSpacing(2))
                .addTextDisplayComponents(txt => txt.setContent('*Ready to start earning? Use the buttons below to get started!*'));

            await interaction.reply({
                content: '',
                components: [infoContainer],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('[AFFILIATE_INFO] Error:', error);
            await interaction.reply({
                content: 'An error occurred while showing affiliate information.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    affiliate_balance: async (interaction) => {
        try {
            const database = require('../../database.js');
            const userId = interaction.user.id;
            
            // Get user's affiliate balance
            const result = await database.query(`
                SELECT affiliate_balance, total_referrals, total_commission_earned 
                FROM users 
                WHERE user_id = ?
            `, [userId]);
            
            const userData = result[0] || { 
                affiliate_balance: 0, 
                total_referrals: 0, 
                total_commission_earned: 0 
            };
            
            const balanceEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('💰 Your Affiliate Balance')
                .addFields(
                    { name: '💵 Current Balance', value: `€${userData.affiliate_balance.toFixed(2)}`, inline: true },
                    { name: '👥 Total Referrals', value: userData.total_referrals.toString(), inline: true },
                    { name: '💎 Total Earned', value: `€${userData.total_commission_earned.toFixed(2)}`, inline: true }
                )
                .setFooter({ text: 'Minimum withdrawal: €1.00' })
                .setTimestamp();
            
            const withdrawButton = new ButtonBuilder()
                .setCustomId('affiliate_withdraw')
                .setLabel('💸 Withdraw')
                .setStyle(ButtonStyle.Success)
                .setDisabled(userData.affiliate_balance < 1);
            
            const row = new ActionRowBuilder().addComponents(withdrawButton);
            
            await interaction.reply({
                embeds: [balanceEmbed],
                components: [row],
                ephemeral: true
            });
        } catch (error) {
            console.error('[AFFILIATE_BALANCE] Error:', error);
            await interaction.reply({
                content: 'An error occurred while fetching your balance.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    affiliate_withdraw: async (interaction) => {
        try {
            const database = require('../../database.js');
            const userId = interaction.user.id;
            
            // Check user's balance
            const result = await database.query(`
                SELECT affiliate_balance FROM users WHERE user_id = ?
            `, [userId]);
            
            const balance = result[0]?.affiliate_balance || 0;
            
            if (balance < 1) {
                return await interaction.reply({
                    content: '❌ You need at least €1.00 to make a withdrawal.',
                    ephemeral: true
                });
            }
            
            // Show withdrawal method selection
            const withdrawEmbed = new EmbedBuilder()
                .setColor(0x4a90e2)
                .setTitle('💸 Withdrawal Method')
                .setDescription(`**Available Balance:** €${balance.toFixed(2)}\n\nPlease select your preferred withdrawal method:`)
                .setFooter({ text: 'You can only make 1 withdrawal per day' });
            
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('withdraw_paypal')
                    .setLabel('💳 PayPal')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('withdraw_iban')
                    .setLabel('🏦 IBAN Bank Transfer')
                    .setStyle(ButtonStyle.Primary)
            );
            
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_sol')
                    .setLabel('🪙 Solana (SOL)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_btc')
                    .setLabel('₿ Bitcoin (BTC)')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_ltc')
                    .setLabel('Ł Litecoin (LTC)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('withdraw_crypto_usdt')
                    .setLabel('₮ Tether (USDT)')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            await interaction.reply({
                embeds: [withdrawEmbed],
                components: [row1, row2, row3],
                ephemeral: true
            });
        } catch (error) {
            console.error('[AFFILIATE_WITHDRAW] Error:', error);
            await interaction.reply({
                content: 'An error occurred while processing your withdrawal request.',
                ephemeral: true
            }).catch(console.error);
        }
    },

    // Withdrawal method handlers
    withdraw_paypal: async (interaction) => {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('withdraw_paypal_modal')
            .setTitle('PayPal Withdrawal');
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('paypal_email')
                    .setLabel('PayPal Email Address')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your PayPal email address')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('withdraw_amount')
                    .setLabel('Amount to Withdraw (€)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Leave blank to withdraw all')
                    .setRequired(false)
            )
        );
        
        await interaction.showModal(modal);
    },

    withdraw_iban: async (interaction) => {
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
        const modal = new ModalBuilder()
            .setCustomId('withdraw_iban_modal')
            .setTitle('IBAN Bank Transfer');
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('iban_number')
                    .setLabel('IBAN Number')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your IBAN number')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('bank_name')
                    .setLabel('Bank Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your bank name')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('account_holder')
                    .setLabel('Account Holder Name')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the account holder name')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('withdraw_amount')
                    .setLabel('Amount to Withdraw (€)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Leave blank to withdraw all')
                    .setRequired(false)
            )
        );
        
        await interaction.showModal(modal);
    },

    // Crypto withdrawal handlers
    withdraw_crypto_sol: async (interaction) => {
        return showCryptoModal(interaction, 'SOL');
    },

    withdraw_crypto_btc: async (interaction) => {
        return showCryptoModal(interaction, 'BTC');
    },

    withdraw_crypto_ltc: async (interaction) => {
        return showCryptoModal(interaction, 'LTC');
    },

    withdraw_crypto_usdt: async (interaction) => {
        return showCryptoModal(interaction, 'USDT');
    },

    // Dynamic withdrawal management handlers (with user IDs in customId)
    'withdraw_complete_': async (interaction) => {
        // Handle all withdrawal completion buttons (withdraw_complete_123456789, etc.)
        const { staffOperationsHandlers } = require('../../src/handlers/staffOperationsHandlers.js');
        return staffOperationsHandlers.handleWithdrawalComplete(interaction);
    }
};

module.exports = affiliateHandlers; 