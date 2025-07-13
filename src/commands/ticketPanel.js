const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Create a ticket panel')
    .setDefaultMemberPermissions(0) // Default to no permissions, we'll handle it manually
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of ticket panel to create')
        .setRequired(true)
        .addChoices(
          { name: 'Rank Boosting', value: 'rank' },
  
          { name: 'Trophy Boosting', value: 'trophies' },
          { name: 'Purchase Account', value: 'purchase' },
          { name: 'Help', value: 'help' }
        )
    ),

  async execute(interaction) {
    // Check if user has permission to create ticket panels
    if (!config.TICKET_PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: "You don't have permission to create ticket panels.", 
        ephemeral: true 
      });
    }

    const type = interaction.options.getString('type');
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setColor('#e68df2')
      .setTitle(this.getPanelTitle(type))
      .setDescription(this.getPanelDescription(type));

    // Create buttons based on the panel type
    const button = new ButtonBuilder()
      .setCustomId(`ticket_${type}`)
      .setLabel(this.getButtonLabel(type))
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫');

    const row = new ActionRowBuilder().addComponents(button);

    // Send the panel
    await interaction.channel.send({ 
      embeds: [embed], 
      components: [row] 
    });

    // Reply to the interaction
    await interaction.reply({ 
      content: `Ticket panel for ${type} created!`,
      ephemeral: true 
    });
  },

  getPanelTitle(type) {
    const titles = {
      rank: 'Rank Boosting',
  
      trophies: 'Trophy Boosting',
      purchase: 'Purchase an Account',
      help: 'Help & Support'
    };
    return titles[type] || 'Ticket Panel';
  },

  getPanelDescription(type) {
    const descriptions = {
      rank: 'Click the button below to open a ticket for rank boosting services.',
  
      trophies: 'Click the button below to open a ticket for trophy boosting services.',
      purchase: 'Click the button below to open a ticket to purchase an account.',
      help: 'Click the button below to open a ticket for help and support.'
    };
    return descriptions[type] || 'Click the button below to open a ticket.';
  },

  getButtonLabel(type) {
    const labels = {
      rank: 'Rank Boost',
  
      trophies: 'Trophy Boost',
      purchase: 'Purchase Account',
      help: 'Help & Support'
    };
    return labels[type] || 'Open Ticket';
  }
};
