const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { 
  LIST_COMMAND_ROLE, 
  STAFF_ROLES, 
  MOVE_CATEGORIES, 
  TICKET_PANEL_ALLOWED_USERS,
  EMBED_COLOR
} = require('./config.js');
const { hasAnyRole } = require('./utils.js');

const messageCommands = {
  ticketpanel: async (message) => {
    if (!TICKET_PANEL_ALLOWED_USERS || !Array.isArray(TICKET_PANEL_ALLOWED_USERS) || !TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
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
  },

  testpanel: async (message) => {
    if (!TICKET_PANEL_ALLOWED_USERS || !Array.isArray(TICKET_PANEL_ALLOWED_USERS) || !TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission!");
    }

    const mainEmbed = new EmbedBuilder()
      .setImage('attachment://bs.png')
      .setTitle('Welcome to Brawl Shop')
      .setDescription(
        'Brawl Shop provides quick delivery Boosts, Account Sales, Carries, and more. We prioritize speed and fair pricing, all of our Boosting & Carry orders are handled by one of the members of our top-tier team. Our team is made up of experienced players who will deliver you with fast and reliable results.\n\n' +
        'Start out by selecting the type of Boost or Carry you want by using one of the buttons attached.\n\n' +
        '[⭐ Our Reviews](https://discord.com/channels/1292895164595175444/1293288484487954512)\n\n' +
        '────────────────────────────────────\n\n' +
        '• Purchasing an account? Check out the Accounts category instead.\n' +
        '• Our prices are shown at <#1364565680371929220>, <#1364565488260223057> & <#1364565759698927636>.'
      )
      .setColor('#4a90e2');

    const ticketButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary)
    );

    const ticketButtons2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
    );

    try {
      await message.channel.send({ 
        embeds: [mainEmbed], 
        components: [ticketButtons, ticketButtons2],
        files: [{ attachment: 'bs.png', name: 'bs.png' }]
      });
      await message.reply('Test panel created!');
    } catch (error) {
      console.error('Error creating test panel:', error);
      await message.reply('Error creating test panel. Make sure bs.png exists in the root directory.');
    }
  }
};

module.exports = { messageCommands }; 