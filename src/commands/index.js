const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');
const { 
  LIST_COMMAND_ROLE, 
  STAFF_ROLES, 
  EMBED_COLOR,
  TICKET_CATEGORIES,
  MOVE_CATEGORIES,
  ADD_115K_ROLE,
  MATCHERINO_WINNER_ROLE,
  PURCHASE_ACCOUNT_CATEGORY,
  AUTO_CLOSE_LOG_CHANNEL
} = require('../constants');
const { 
  calculateTrophyPrice, 
  calculateBulkPrice, 
  calculateRankedPrice
} = require('../utils/priceCalculator');
const { 
  createTicketChannelWithOverflow,
  ticketDataMap,
  isCategoryFull,
  autoCloseLog,
  autoCloseLogAndDelete
} = require('../utils/ticketManager');
const { 
  handleRankedFlow,
  handleBulkFlow,
  handleRankedRankSelection,
  showPaymentMethodSelection,
  showPriceEmbed,
  flowState,
  getChannelNameByType,
  getCategoryIdByType
} = require('../modules/ticketFlow');

// Import payment button handlers
const {
  handlePayPalAcceptToS,
  handlePayPalDenyToS,
  handlePayPalDenyConfirm,
  handlePayPalDenyCancel
} = require('../handlers/paymentButtonHandlers');

// /list command
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')
  .addStringOption(opt =>
    opt.setName('ping')
      .setDescription('Who to ping?')
      .setRequired(true)
      .addChoices(
        { name: 'Everyone', value: 'everyone' },
        { name: 'Here', value: 'here' },
        { name: 'None', value: 'none' }
      )
  )
  .addStringOption(opt =>
    opt.setName('text')
      .setDescription('Short descriptive text to include')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('price')
      .setDescription('Price of the account')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('trophies')
      .setDescription('Trophies value')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p11')
      .setDescription('Power 11 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('tier_max')
      .setDescription('Tier Max info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('rare_skins')
      .setDescription('Rare skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('super_rare_skins')
      .setDescription('Super rare skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('epic_skins')
      .setDescription('Epic skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('mythic_skins')
      .setDescription('Mythic skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('legendary_skins')
      .setDescription('Legendary skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('titles')
      .setDescription('Titles info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('hypercharges')
      .setDescription('Hypercharges info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('power_10s')
      .setDescription('Power 10s info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('power_9s')
      .setDescription('Power 9s info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('old_ranked_rank')
      .setDescription('Old ranked rank info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('new_ranked_rank')
      .setDescription('New ranked rank info')
      .setRequired(true)
  )
  .addAttachmentOption(opt =>
    opt.setName('image')
      .setDescription('Main image (upload a file)')
      .setRequired(true)
  )
  .addAttachmentOption(opt =>
    opt.setName('image2')
      .setDescription('Additional image for more information (optional)')
      .setRequired(false)
  );

// Message commands
const messageCommands = {
  ticketpanel: async (message) => {
    if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission!");
    }
    const embed = new EmbedBuilder()
      .setColor('#e68df2')
      .setTitle('Order a Boost')
      .setDescription('Get Boosted to your Dream Rank/Tier now!\n\nThe bot will automatically calculate the price of the boost if you select what type of boost you want.\n\nSelect the type of boost you want below.')
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://media.discordapp.net/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&=&format=webp'
      });
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row1, row2] });
    await message.reply('Ticket panel created!');
  },

  move: async (message, args) => {
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("No permission!");
    }
    const target = MOVE_CATEGORIES[args[0]];
    if (!target) {
      return message.reply('Usage: ?move [paid|add|sell|finished]');
    }
    try {
      await message.channel.setParent(target);
      await message.reply(`Moved to ${args[0]}`);
    } catch {
      message.reply('Could not move channel.');
    }
  },

  adds: async (message) => {
    if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return message.reply("No permission!");
    }
    const embed1 = new EmbedBuilder()
      .setTitle('115k Trophies & 71 R35 Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 3 invites!**\nAdd a 115k trophy & R35 player.')
      .setImage('https://media.discordapp.net/.../IMG_2580.png');
    const embed2 = new EmbedBuilder()
      .setTitle('Matcherino Winner Add')
      .setColor(EMBED_COLOR)
      .setDescription('**Requires 5 invites!**\nAdd a Matcherino Winner.')
      .setImage('https://media.discordapp.net/.../IMG_2581.png');
    await message.channel.send({ embeds: [embed1, embed2] });
    const action = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_add_115k').setLabel('Add 115k').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_add_matcherino_winner').setLabel('Add Matcherino Winner').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [new EmbedBuilder().setDescription('Claim with buttons below.')], components: [action] });
  },

  friendlist: async (message) => {
    if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return message.reply("No permission!");
    }
    const left = '🥈 LUX | Zoro - €10\n🥈 Lennox - €15\n🥈 Melih - €15\n🥈 Elox - €15';
    const right = '🥈 Kazu - €15\n🥇 Izana - €25\n🥇 SKC | Rafiki - €25\n🥇 HMB | BosS - €60';
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .addFields(
        { name: '\u200b', value: left, inline: true },
        { name: '\u200b', value: right, inline: true }
      );
    const actions = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('friendlist_buyadd').setLabel('Buy Add').setEmoji('<:Shopping_Cart:1351686041559367752>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('friendlist_playerinfo').setLabel('Player Information').setStyle(ButtonStyle.Primary)
    );
    await message.channel.send({ embeds: [embed, new EmbedBuilder().setDescription('# ⬆️ ALL ADDS ARE LIFETIME')], components: [actions] });
  }
};

// Helper function to check if a member has any of the specified roles
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(r => member.roles.cache.has(r));
}

// Button interaction dispatcher (replace the old handler logic)
async function handleButtonInteraction(interaction) {
  console.log('[DEBUG] handleButtonInteraction called with customId:', interaction.customId);
  const customId = interaction.customId;
  
  // Check for exact match first
  if (buttonHandlers[customId]) {
    return buttonHandlers[customId](interaction);
  }
  
  // Handle dynamic buttons for ranked selection
  if (customId.startsWith('ranked_')) {
    console.log(`[DEBUG] handleRankedRankSelection: rankInput=${customId.substring(7)}, step=${interaction.customId.includes('_') ? 'current_rank_specific' : 'current_rank'}`);
    const rankName = customId.substring(7); // Remove 'ranked_' prefix
    return handleRankedRankSelection(interaction, rankName);
  }
  
  // Dynamic confirm/cancel ticket buttons
  if (customId.startsWith('confirm_ticket_')) {
    const { handleTicketConfirm } = require('../modules/ticketFlow');
    return handleTicketConfirm(interaction);
  }
  
  if (customId.startsWith('cancel_ticket_')) {
    const { handleTicketCancel } = require('../modules/ticketFlow');
    return handleTicketCancel(interaction);
  }
  
  // Add more dynamic handlers as needed
  console.warn(`Unhandled button interaction: ${customId}`);
}

// Button interaction handlers
const buttonHandlers = {
  // PayPal ToS buttons
  'paypal_accept_tos': handlePayPalAcceptToS,
  'paypal_deny_tos': handlePayPalDenyToS,
  'paypal_deny_confirm': handlePayPalDenyConfirm,
  'paypal_deny_cancel': handlePayPalDenyCancel,

  // Ticket panel buttons
  'ticket_ranked': async (interaction) => {
    return handleRankedFlow(interaction);
  },

  'ticket_bulk': async (interaction) => {
    return handleBulkFlow(interaction);
  },

  // Ranked buttons
  'ranked_masters': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Masters');
  },
  'ranked_legendary': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Legendary');
  },
  'ranked_mythic': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Mythic');
  },
  'ranked_diamond': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Diamond');
  },
  'ranked_gold': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Gold');
  },
  'ranked_silver': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Silver');
  },
  'ranked_bronze': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Bronze');
  },
  'ranked_pro': async (interaction) => {
    return handleRankedRankSelection(interaction, 'Pro');
  },

  // Payment method buttons
  'payment_paypal': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'PayPal';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_crypto': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_iban': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'IBAN Bank Transfer';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },

  // Ticket confirmation buttons
  'confirm_ticket': async (interaction) => {
    const { handleTicketConfirm } = require('../modules/ticketFlow');
    return handleTicketConfirm(interaction);
  },
  
  'cancel_ticket': async (interaction) => {
    const { handleTicketCancel } = require('../modules/ticketFlow');
    return handleTicketCancel(interaction);
  },

  // Purchase/Cancel buttons
  'purchase_boost': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (!userData) return;
    const type = userData.type;
    const username = interaction.user.username;
    const channelName = getChannelNameByType(type, userData, username);
    const categoryId = getCategoryIdByType(type);
    const channel = await createTicketChannelWithOverflow(
      interaction.guild,
      interaction.user.id,
      categoryId,
      channelName
    );

    if (channel) {
      // Send order information embed
      const orderFields = [];
      
      if (type === 'ranked') {
        orderFields.push(
          { name: '**Current Rank:**', value: `\`${userData.currentRank} ${userData.currentRankSpecific}\`` },
          { name: '**Desired Rank:**', value: `\`${userData.desiredRank} ${userData.desiredRankSpecific}\`` }
        );
      } else if (type === 'bulk') {
        orderFields.push(
          { name: '**Current Trophies:**', value: `\`${userData.currentTrophies}\`` },
          { name: '**Desired Trophies:**', value: `\`${userData.desiredTrophies}\`` }
        );
      }

      orderFields.push(
        { name: '**Payment Method:**', value: `\`${userData.paymentMethod}\`` }
      );

      const orderEmbed = new EmbedBuilder()
        .setTitle('Order Information')
        .setColor(EMBED_COLOR)
        .addFields(orderFields);

      await channel.send({ embeds: [orderEmbed] });

      // Clear flow state
      flowState.delete(interaction.user.id);

      return interaction.update({ 
        content: `Ticket created: <#${channel.id}>`, 
        embeds: [], 
        components: [] 
      });
    } else {
      return interaction.update({ 
        content: 'Failed to create ticket. Please try again later.', 
        embeds: [], 
        components: [] 
      });
    }
  },

  'cancel_boost': async (interaction) => {
    // Clear flow state
    flowState.delete(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('Boost Cancelled')
      .setDescription('Your boost request has been cancelled.')
      .setColor(EMBED_COLOR);

    return interaction.update({ 
      embeds: [embed], 
      components: [] 
    });
  },

  // Ticket panel buttons
  'ticket_trophies': async (interaction) => {
    const modal = new ModalBuilder().setCustomId('modal_trophies_start').setTitle('Trophies Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_name').setLabel('Which Brawler?').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_current').setLabel('Current Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_desired').setLabel('Desired Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  },

  'ticket_other': async (interaction) => {
    const modal = new ModalBuilder().setCustomId('modal_ticket_other').setTitle('Other Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('other_purchase').setLabel('What Are You Purchasing?').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  },

  // 115k Add
  'btn_add_115k': async (interaction) => {
    if (!interaction.member.roles.cache.has(ADD_115K_ROLE)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You need the 115k role.')],
        ephemeral: true
      });
    }
    const modal = new ModalBuilder().setCustomId('modal_add_115k').setTitle('Supercell ID');
    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  },

  // Matcherino Winner Add
  'btn_add_matcherino_winner': async (interaction) => {
    if (!interaction.member.roles.cache.has(MATCHERINO_WINNER_ROLE)) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Insufficient Invites: You need the Matcherino Winner role.')],
        ephemeral: true
      });
    }
    const modal = new ModalBuilder().setCustomId('modal_matcherino_winner').setTitle('Supercell ID');
    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  },

  // Friendlist buy add
  'friendlist_buyadd': async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('Buy an Add')
      .setDescription('Please select the player you would like to add:')
      .setColor(EMBED_COLOR);
    const players = ['LUX | Zoro','Lennox','Melih','Elox','Kazu','Izana','SKC | Rafiki','HMB | BosS'];
    const ids = ['buy_luxzoro','buy_lennox','buy_melih','buy_elox','buy_kazu','buy_izana','buy_rafiki','buy_boss'];
    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    for (let i = 0; i < 5; i++) row1.addComponents(new ButtonBuilder().setCustomId(ids[i]).setLabel(players[i]).setStyle(ButtonStyle.Success));
    for (let i = 5; i < 8; i++) row2.addComponents(new ButtonBuilder().setCustomId(ids[i]).setLabel(players[i]).setStyle(ButtonStyle.Success));
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  },

  // Friendlist player info
  'friendlist_playerinfo': async (interaction) => {
    const embed = new EmbedBuilder()
      .setTitle('Player Information')
      .setDescription('Select the player to view info:')
      .setColor(EMBED_COLOR);
    const players = ['LUX | Zoro','Lennox','Melih','Elox','Kazu','Izana','SKC | Rafiki','HMB | BosS'];
    const ids = ['info_luxzoro','info_lennox','info_melih','info_elox','info_kazu','info_izana','info_rafiki','info_boss'];
    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    for (let i = 0; i < 5; i++) row1.addComponents(new ButtonBuilder().setCustomId(ids[i]).setLabel(players[i]).setStyle(ButtonStyle.Primary));
    for (let i = 5; i < 8; i++) row2.addComponents(new ButtonBuilder().setCustomId(ids[i]).setLabel(players[i]).setStyle(ButtonStyle.Primary));
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  },

  // Buy ticket channels for adds
  'buy_': async (interaction) => {
    const buyMap = {
      'buy_luxzoro': 'LUX | Zoro',
      'buy_lennox': 'Lennox',
      'buy_melih': 'Melih',
      'buy_elox': 'Elox',
      'buy_kazu': 'Kazu',
      'buy_izana': 'Izana',
      'buy_rafiki': 'SKC | Rafiki',
      'buy_boss': 'HMB | BosS'
    };
    const playerName = buyMap[interaction.customId];
    if (!playerName) return;

    try {
      const { guild, user } = interaction;
      const existing = guild.channels.cache.filter(ch =>
        ch.type === ChannelType.GuildText &&
        ch.permissionOverwrites.cache.get(user.id)?.allow.has(PermissionsBitField.Flags.ViewChannel)
      );
      const overflow = existing.size >= MAX_TICKETS_PER_USER;
      const categoryFull = isCategoryFull(MOVE_CATEGORIES.add, guild);
      const parentToUse = (overflow || categoryFull) ? null : MOVE_CATEGORIES.add;
      const channelName = `add-${user.username}-${Math.floor(Math.random() * 1000)}`;
      const addChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentToUse,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
          ...STAFF_ROLES.map(rid => ({
            id: rid,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          }))
        ]
      });
      const mention = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
      const closeBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('<:Lock:1349157009244557384>').setStyle(ButtonStyle.Danger)
      );
      await addChannel.send({ content: mention, embeds: [welcomeEmbed], components: [closeBtn] });
      ticketDataMap.set(addChannel.id, new TicketData(user.id, addChannel.id, addChannel.name, Date.now()));
      return interaction.reply({ content: `Ticket created: <#${addChannel.id}>`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to create add ticket channel.', ephemeral: true });
    }
  },

  // Info ticket channels (player info)
  'info_': async (interaction) => {
    const infoMap = {
      'info_luxzoro': 'LUX | Zoro',
      'info_lennox': 'Lennox',
      'info_melih': 'Melih',
      'info_elox': 'Elox',
      'info_kazu': 'Kazu',
      'info_izana': 'Izana',
      'info_rafiki': 'SKC | Rafiki',
      'info_boss': 'HMB | BosS'
    };
    const playerName = infoMap[interaction.customId];
    if (playerName) {
      return interaction.reply({ content: `Information about **${playerName}**: ...`, ephemeral: true });
    }
  },

  // Ticket panel buttons
  'ticket_trophies': async (interaction) => {
    const modal = new ModalBuilder().setCustomId('modal_trophies_start').setTitle('Trophies Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_name').setLabel('Which Brawler?').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_current').setLabel('Current Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('brawler_desired').setLabel('Desired Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  },

  'ticket_other': async (interaction) => {
    const modal = new ModalBuilder().setCustomId('modal_ticket_other').setTitle('Other Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('other_purchase').setLabel('What Are You Purchasing?').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  },

  // Payment method selection for ticket panel
  'payment_paypal': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'PayPal';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_crypto': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_iban': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'IBAN Bank Transfer';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_paypal_giftcard': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'PayPal Giftcard';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_dutch': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Dutch Payment Methods';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'payment_apple_giftcard': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {

      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  
  // Crypto selection
  'crypto_litecoin': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Litecoin';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'crypto_solana': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Solana';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'crypto_bitcoin': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Bitcoin';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'crypto_other': async (interaction) => {
    const modal = new ModalBuilder()
      .setCustomId('modal_crypto_other')
      .setTitle('Other Crypto');
      
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('crypto_coin')
          .setLabel('What coin will you be sending')
          .setPlaceholder('Enter the Crypto Coin you will be sending')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    
    return interaction.showModal(modal);
  },
  
  // Dutch payment methods
  'dutch_tikkie': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Dutch Payment Methods';
      userData.dutchPaymentType = 'Tikkie';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  'dutch_bolcom': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Dutch Payment Methods';
      userData.dutchPaymentType = 'Bol.com Giftcard';
      flowState.set(interaction.user.id, userData);
      return showPriceEmbed(interaction);
    }
  },
  
  // Purchase account payment methods
  'purchase_payment_iban': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'IBAN Bank Transfer';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_payment_crypto': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_payment_paypal': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'PayPal';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_payment_paypal_giftcard': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'PayPal Giftcard';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_payment_dutch': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    const price = extractPrice(interaction.message);
    return showDutchPaymentSelection(interaction, true, price);
  },
  
  // Purchase crypto selections
  'purchase_crypto_litecoin': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Litecoin';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_crypto_solana': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Solana';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_crypto_bitcoin': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Crypto';
      userData.cryptoCoin = 'Bitcoin';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_crypto_other': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    userData.isPurchaseAccount = true;
    flowState.set(interaction.user.id, userData);
    
    const modal = new ModalBuilder()
      .setCustomId('modal_crypto_other')
      .setTitle('Other Crypto');
      
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('crypto_coin')
          .setLabel('What coin will you be sending')
          .setPlaceholder('Enter the Crypto Coin you will be sending')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    
    return interaction.showModal(modal);
  },
  
  // Purchase Dutch payment methods
  'purchase_dutch_tikkie': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Dutch Payment Methods';
      userData.dutchPaymentType = 'Tikkie';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
  'purchase_dutch_bolcom': async (interaction) => {
    const userData = flowState.get(interaction.user.id);
    if (userData) {
      userData.paymentMethod = 'Dutch Payment Methods';
      userData.dutchPaymentType = 'Bol.com Giftcard';
      flowState.set(interaction.user.id, userData);
      return createPurchaseTicket(interaction, userData);
    }
  },
};

// Modal submission handlers
const modalHandlers = {
  'modal_trophies_start': async (interaction) => {
    const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
    const current = parseInt(interaction.fields.getTextInputValue('brawler_current').trim(), 10);
    const desired = parseInt(interaction.fields.getTextInputValue('brawler_desired').trim(), 10);
    if (isNaN(current) || isNaN(desired) || current >= desired) {
      return interaction.reply({ content: 'Invalid trophy amounts.', ephemeral: true });
    }
    
    // Get brawler level if provided
    let brawlerLevel = null;
    try {
      const levelText = interaction.fields.getTextInputValue('brawler_level')?.trim();
      if (levelText) {
        brawlerLevel = parseInt(levelText);
        if (isNaN(brawlerLevel) || brawlerLevel < 1) {
          return interaction.reply({ content: 'Please enter a valid power level (1-11).', ephemeral: true });
        }
      }
    } catch (e) {
      // Level field not found, continue without it
    }
    
    const price = calculateTrophyPrice(current, desired, brawlerLevel);
    
    // Store the data but show payment method selection first
    flowState.set(interaction.user.id, { 
      panelType: 'trophies', 
      brawlerName, 
      current, 
      desired, 
      price,
      brawlerLevel,
      powerLevel: brawlerLevel,
      step: 'payment_method'
    });
    
    // Show payment method selection
    return showPaymentMethodSelection(interaction);
  },

  'modal_bulk_start': async (interaction) => {
    const current = parseInt(interaction.fields.getTextInputValue('bulk_current').trim(), 10);
    const desired = parseInt(interaction.fields.getTextInputValue('bulk_desired').trim(), 10);
    if (isNaN(current) || isNaN(desired) || current >= desired) {
      return interaction.reply({ content: 'Invalid trophy amounts.', ephemeral: true });
    }
    const price = calculateBulkPrice(current, desired);
    
    // Store the data but show payment method selection first
    flowState.set(interaction.user.id, { 
      panelType: 'bulk', 
      current, 
      desired, 
      price,
      step: 'payment_method'
    });
    
    // Show payment method selection
    return showPaymentMethodSelection(interaction);
  },

  'modal_ticket_other': async (interaction) => {
    const what = interaction.fields.getTextInputValue('other_purchase').trim();
    
    // Store data for payment selection
    flowState.set(interaction.user.id, {
      panelType: 'other',
      purchase: what,
      step: 'payment_method'
    });
    
    // Show payment method selection
    return showPaymentMethodSelection(interaction);
  },
  
  'modal_crypto_other': async (interaction) => {
    const cryptoCoin = interaction.fields.getTextInputValue('crypto_coin').trim();
    const userData = flowState.get(interaction.user.id);
    
    if (userData) {
      userData.cryptoCoin = cryptoCoin;
      flowState.set(interaction.user.id, userData);
      
      if (userData.panelType) {
        return showPriceEmbed(interaction);
      } else if (userData.isPurchaseAccount) {
        return createPurchaseTicket(interaction, userData);
      }
    }
    
    return interaction.reply({ content: 'Error: Session data lost. Please try again.', ephemeral: true });
  }
};

// Helper function to extract price from message
function extractPrice(message) {
  if (!message || !message.embeds || message.embeds.length === 0) return null;
  
  const embed = message.embeds[0];
  const description = embed.description || '';
  
  // Try to extract price from description
  const priceRegex = /(\d+)€|€(\d+)|(\d+)/;
  const match = description.match(priceRegex);
  
  if (match) {
    const price = parseInt(match[1] || match[2] || match[3], 10);
    return isNaN(price) ? null : price;
  }
  
  // Check fields if description doesn't have a price
  if (embed.fields) {
    for (const field of embed.fields) {
      if (field.value) {
        const fieldMatch = field.value.match(priceRegex);
        if (fieldMatch) {
          const price = parseInt(fieldMatch[1] || fieldMatch[2] || fieldMatch[3], 10);
          return isNaN(price) ? null : price;
        }
      }
    }
  }
  
  return null;
}

module.exports = {
  listCommand,
  messageCommands,
  buttonHandlers,
  modalHandlers,
  hasAnyRole,
  handleButtonInteraction
}; 