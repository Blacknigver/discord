const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const { EMOJIS } = require('../constants');

class PayPalHandler {
  constructor(client) {
    this.client = client;
    this.paypalEmail = config.PAYPAL_EMAIL;
  }

  /**
   * Sends the PayPal Terms of Service embed
   * @param {TextChannel} channel - The channel to send the embed to
   * @param {User} user - The user who opened the ticket
   * @returns {Promise<Message>}
   */
  async sendPayPalTerms(channel, user) {
    const embed = new EmbedBuilder()
      .setColor(0xe68df2)
      .setTitle('PayPal Terms of Services')
      .setDescription([
        `> ${EMOJIS.SHIELD}[+] If our PayPal Account gets locked, you will have to wait for us to unlock it, if we fail to unlock it no product or refund will be given.`,
        `> ${EMOJIS.SHIELD}[+] We will not be covering any transaction fees.`,
        `> ${EMOJIS.SHIELD}[+] Send **Friends and Family** ONLY - Goods and Services is __Strictly Forbidden__`,
        `> ${EMOJIS.SHIELD}[+] Send from **PayPal Balance** ONLY - Card/Bank Payments are __Strictly Forbidden__`,
        `> ${EMOJIS.SHIELD}[+] Send **Euro Currency** Only.`,
        `> ${EMOJIS.SHIELD}[+] Do **NOT add a note** to the payment.`,
        `> ${EMOJIS.SHIELD}[+] Must send a Summary Screenshot after sending.`
      ].join('\n'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('paypal_accept')
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:checkmark:1357478063616688304>'),
      new ButtonBuilder()
        .setCustomId('paypal_deny')
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('<:cross:1351689463453061130>')
    );

    return channel.send({ 
      content: `${user}`, 
      embeds: [embed], 
      components: [row] 
    });
  }

  /**
   * Handles the accept button click for PayPal terms
   * @param {ButtonInteraction} interaction - The button interaction
   * @param {Object} ticketData - Data about the ticket
   */
  async handleAccept(interaction, ticketData) {
    // Only the ticket creator can accept the terms
    if (interaction.user.id !== ticketData.creatorId) {
      return interaction.reply({ 
        content: 'Only the ticket creator can accept the terms.', 
        ephemeral: true 
      });
    }

    // Disable the buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(button => button.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Send payment information
    const embed = new EmbedBuilder()
      .setColor(0xe68df2)
      .setTitle('PayPal Payment Information:')
      .setDescription(`**PayPal E-Mail:**\n\`${this.paypalEmail}\``);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('copy_email')
        .setLabel('Copy E-Mail')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('<:copy:1372240644013035671>'),
      new ButtonBuilder()
        .setCustomId('payment_completed')
        .setLabel('Payment Completed')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:checkmark:1357478063616688304>')
    );

    await interaction.channel.send({ 
      content: `${interaction.user} has accepted the Terms of Services.`,
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Handles the deny button click for PayPal terms
   * @param {ButtonInteraction} interaction - The button interaction
   * @param {Object} ticketData - Data about the ticket
   */
  async handleDeny(interaction, ticketData) {
    // Only the ticket creator can deny the terms
    if (interaction.user.id !== ticketData.creatorId) {
      return interaction.reply({ 
        content: 'Only the ticket creator can deny the terms.', 
        ephemeral: true 
      });
    }

    // Send confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Are you sure?')
      .setDescription('Please confirm if you are sure you would like to deny the Terms of Services.\n\nThis means we **can not continue** with your order.')
      .setColor(0xe68df2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_deny')
        .setLabel('Continue')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('<:cross:1351689463453061130>'),
      new ButtonBuilder()
        .setCustomId('cancel_deny')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:checkmark:1357478063616688304>')
    );

    await interaction.reply({ 
      embeds: [embed], 
      components: [row],
      ephemeral: true 
    });
  }

  /**
   * Handles the confirm deny button click
   * @param {ButtonInteraction} interaction - The button interaction
   */
  async handleConfirmDeny(interaction) {
    // Disable the buttons on the original message
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(button => button.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });
    
    // Send message that terms were denied
    await interaction.channel.send({
      content: `${interaction.user} has denied the Terms of Services.\n\nPlease explain why you denied the Terms of Services.\n\nIf no other solution can be found, this order will have to be cancelled.`
    });
  }

  /**
   * Handles the payment completed button click
   * @param {ButtonInteraction} interaction - The button interaction
   * @param {Object} ticketData - Data about the ticket
   */
  async handlePaymentCompleted(interaction, ticketData) {
    // Only the ticket creator can mark payment as completed
    if (interaction.user.id !== ticketData.creatorId) {
      return interaction.reply({ 
        content: 'Only the ticket creator can mark the payment as completed.', 
        ephemeral: true 
      });
    }

    // Disable the buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(button => button.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Send payment received embed for staff confirmation
    const embed = new EmbedBuilder()
      .setTitle('Payment Completed')
      .setDescription(`${interaction.user} has marked the Payment as completed.\n\nPlease confirm the payment has been received.`)
      .setColor(0xe68df2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('payment_received')
        .setLabel('Payment Received')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:checkmark:1357478063616688304>'),
      new ButtonBuilder()
        .setCustomId('payment_not_received')
        .setLabel('Not Received')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('<:cross:1351689463453061130>')
    );

    await interaction.channel.send({ 
      content: `<@${config.ROLES.OWNER}>`,
      embeds: [embed],
      components: [row]
    });
  }

  /**
   * Handles the payment received button click (for staff)
   * @param {ButtonInteraction} interaction - The button interaction
   * @param {Object} ticketData - Data about the ticket
   */
  async handlePaymentReceived(interaction, ticketData) {
    // Only owner can confirm payment received
    if (interaction.user.id !== config.ROLES.OWNER) {
      return interaction.reply({ 
        content: 'Only the owner can confirm payment received.', 
        ephemeral: true 
      });
    }

    // Disable the buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(button => button.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Add booster role to the channel
    const channel = interaction.channel;
    const boosterRole = interaction.guild.roles.cache.get(config.ROLES.BOOSTER);
    
    if (!boosterRole) {
      console.error('Booster role not found');
      return interaction.followUp('Error: Booster role not found. Please contact an admin.');
    }

    // Set permissions for the booster role
    await channel.permissionOverwrites.edit(boosterRole, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AddReactions: true,
      EmbedLinks: true,
      AttachFiles: true
    });

    // Send boost available message
    const embed = new EmbedBuilder()
      .setTitle('Boost Available')
      .setDescription(`<@&${config.ROLES.BOOSTER}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.`)
      .setColor(0xe68df2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_boost')
        .setLabel('Claim Boost')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:checkmark:1357478063616688304>')
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    
    // Clean up payment method messages AFTER boost available is sent
    const { cleanupMessages } = require('../utils/messageCleanup.js');
    await cleanupMessages(interaction.channel, null, 'payment_confirmed');
  }

  /**
   * Handles the claim boost button click
   * @param {ButtonInteraction} interaction - The button interaction
   */
  async handleClaimBoost(interaction) {
    // Only boosters can claim boosts
    const member = interaction.member;
    if (!member.roles.cache.has(config.ROLES.BOOSTER)) {
      return interaction.reply({ 
        content: 'Only boosters can claim boosts.', 
        ephemeral: true 
      });
    }

    // Disable the button and update the message
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components[0]
      .setDisabled(true)
      .setLabel(`${interaction.user.username} claimed this boost`)
      .setEmoji(null);
    
    await interaction.update({ components: [disabledRow] });
  }
}

module.exports = PayPalHandler;
