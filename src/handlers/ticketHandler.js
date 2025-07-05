const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');

class TicketHandler {
  constructor(client) {
    this.client = client;
    this.paypalEmail = config.PAYPAL_EMAIL || 'mathiasbenedetto@gmail.com';
  }

  async handleTicketButton(interaction) {
    const [_, type] = interaction.customId.split('_');
    
    // Create a ticket in the database or get existing one
    const ticketData = {
      type,
      userId: interaction.user.id,
      status: 'open',
      createdAt: new Date()
    };

    // Show payment method selection
    await this.showPaymentMethodSelection(interaction, ticketData);
  }

  async showPaymentMethodSelection(interaction, ticketData) {
    const embed = new EmbedBuilder()
      .setTitle('Select Payment Method')
      .setDescription('Please select your preferred payment method:')
      .setColor(0xe68df2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pay_method_paypal_${ticketData.type}`)
        .setLabel('PayPal')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💳')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }

  async handlePayPalPayment(interaction) {
    const [_, __, type] = interaction.customId.split('_');
    
    // Show confirmation embed
    const embed = new EmbedBuilder()
      .setTitle('Confirmation')
      .setDescription('Please confirm all information below is correct\n\n' +
        '`Current Rank` > `Desired Rank`\n\n' +
        '**Final Price:**\n`€XX.XX`')
      .setColor(0xe68df2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_ticket')
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('cancel_ticket')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await interaction.update({
      embeds: [embed],
      components: [row]
    });
  }

  async handleTicketConfirmation(interaction) {
    // Disable buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(btn => btn.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Create ticket channel
    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 0, // Text channel
      parent: config.TICKET_CATEGORIES.help, // Default to help category
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          id: config.ROLES.OWNER,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          id: config.ROLES.ADMIN,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    // Send welcome message
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0xe68df2)
      .setDescription('Welcome, thanks for opening a ticket! \n\n**Support will be with you shortly.**\n\nIf there is any more details or information you would like to share, feel free to do so!');

    const detailsEmbed = new EmbedBuilder()
      .setColor(0xe68df2)
      .addFields(
        { name: 'Current Rank:', value: '`Current Rank`', inline: true },
        { name: 'Desired Rank:', value: '`Desired Rank`', inline: true },
        { name: 'Final Price:', value: '`€XX.XX`', inline: false }
      );

    await channel.send({ 
      content: `${interaction.user} <@${config.ROLES.OWNER}> <@&${config.ROLES.ADMIN}>`,
      embeds: [welcomeEmbed, detailsEmbed] 
    });

    // Send PayPal terms
    await this.sendPayPalTerms(channel, interaction.user);

    // Send success message
    await interaction.followUp({
      content: `Ticket created: ${channel}`,
      ephemeral: true
    });
  }

  async sendPayPalTerms(channel, user) {
    const embed = new EmbedBuilder()
      .setTitle('PayPal Terms of Services')
      .setColor(0xe68df2)
      .setDescription([
        '> <:shield:1371879600560541756>[+] If our PayPal Account gets locked, you will have to wait for us to unlock it, if we fail to unlock it no product or refund will be given.',
        '> <:shield:1371879600560541756>[+] We will not be covering any transaction fees.',
        '> <:shield:1371879600560541756>[+] Send **Friends and Family** ONLY - Goods and Services is __Strictly Forbidden__',
        '> <:shield:1371879600560541756>[+] Send from **PayPal Balance** ONLY - Card/Bank Payments are __Strictly Forbidden__',
        '> <:shield:1371879600560541756>[+] Send **Euro Currency** Only.',
        '> <:shield:1371879600560541756>[+] Do **NOT add a note** to the payment.',
        '> <:shield:1371879600560541756>[+] Must send a Summary Screenshot after sending.'
      ].join('\n'));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('paypal_accept')
        .setLabel('I Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('paypal_deny')
        .setLabel('I Deny')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    return channel.send({ 
      content: `${user}`, 
      embeds: [embed], 
      components: [row] 
    });
  }

  async handlePayPalAccept(interaction) {
    // Only the ticket creator can accept
    if (!interaction.channel.name.startsWith('ticket-')) return;
    
    // Disable buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(btn => btn.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Send payment information
    const embed = new EmbedBuilder()
      .setTitle('PayPal Payment Information')
      .setColor(0xe68df2)
      .setDescription(`**PayPal E-Mail:**\n\`${this.paypalEmail}\`\n\nOnce you have sent the payment, click on the 'Payment Completed' button.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('copy_email')
        .setLabel('Copy E-Mail')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📋'),
      new ButtonBuilder()
        .setCustomId('payment_completed')
        .setLabel('Payment Completed')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    await interaction.followUp({ 
      content: `${interaction.user} has accepted the Terms of Services.`,
      embeds: [embed],
      components: [row]
    });
  }

  async handlePaymentCompleted(interaction) {
    // Only the ticket creator can mark as completed
    if (!interaction.channel.name.startsWith('ticket-')) return;
    
    // Disable buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(btn => btn.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Notify staff
    const embed = new EmbedBuilder()
      .setTitle('Payment Completed')
      .setColor(0xe68df2)
      .setDescription(`${interaction.user} has marked the Payment as completed.\n\nPlease confirm the payment has been received.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('payment_received')
        .setLabel('Payment Received')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('payment_not_received')
        .setLabel('Not Received')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await interaction.followUp({ 
      content: `<@${config.ROLES.OWNER}>`,
      embeds: [embed],
      components: [row]
    });
  }

  async handlePaymentReceived(interaction) {
    // Only owner can confirm
    if (interaction.user.id !== config.ROLES.OWNER) {
      return interaction.reply({ 
        content: 'Only the owner can confirm payment received.', 
        ephemeral: true 
      });
    }

    // Disable buttons
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components.forEach(btn => btn.setDisabled(true));
    
    await interaction.update({ components: [disabledRow] });

    // Add booster role permissions
    await interaction.channel.permissionOverwrites.edit(config.ROLES.BOOSTER, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    // Send boost available message
    const embed = new EmbedBuilder()
      .setTitle('Boost Available')
      .setColor(0xe68df2)
      .setDescription(`<@&${config.ROLES.BOOSTER}> This boost has been paid for and is available.\n\nClaim this boost by clicking the 'Claim Boost' button below.`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_boost')
        .setLabel('Claim Boost')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    await interaction.followUp({ embeds: [embed], components: [row] });
  }

  async handleClaimBoost(interaction) {
    // Only boosters can claim
    if (!interaction.member.roles.cache.has(config.ROLES.BOOSTER)) {
      return interaction.reply({ 
        content: 'Only boosters can claim boosts.', 
        ephemeral: true 
      });
    }

    // Disable the button
    const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
    disabledRow.components[0]
      .setLabel(`${interaction.user.username} claimed this boost`)
      .setDisabled(true)
      .setStyle(ButtonStyle.Secondary);
    
    await interaction.update({ components: [disabledRow] });
  }
}

module.exports = TicketHandler;
