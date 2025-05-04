/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token.
 *
 * FEATURES INCLUDED:
 * - Auto-close logic with reminders:
 *    • If a ticket has 0 messages from the opener:
 *         - Sends a 6-hour reminder and a 12-hour reminder;
 *         - Auto-closes the ticket at 24 hours.
 *    • If a ticket has ≥1 message:
 *         - Sends a 24-hour inactivity reminder;
 *         - Auto-closes the ticket at 48 hours of inactivity.
 *    In both cases, a log is sent in channel 1354587880382795836.
 *
 * - Ticket Overflow: When a target category is full (≥25 channels),
 *   the ticket is created without a category (parent: null).
 *
 * - Purchase tickets close immediately on "Close Ticket" (no confirm).
 *
 * - "Mark as Sold" button is restricted to role 1292933200389083196.
 *
 * - 115k Add:
 *    • Requires role 1351281086134747298.
 *    • Upon successful claim, removes that role from the user and logs 
 *      "!removeinvites <@user> 3" in channel 1354587880382795836.
 *
 * - Matcherino Winner Add:
 *    • Requires role 1351281117445099631.
 *    • Upon successful claim, removes that role from the user and logs 
 *      "!removeinvites <@user> 5" in channel 1354587880382795836.
 *
 * - Removed "matcherino swap" completely.
 *
 * - Presence Update:
 *    • If a member's status includes "discord.gg/brawlshop" (case-insensitive),
 *      the role 1351998501982048346 is added and never removed.
 *
 * - All other original features (ticket panel, /list, ?move, ?friendlist, etc.)
 *   remain intact.
 ********************************************************************/

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');

// load .env so process.env.DATABASE_URL (and TOKEN) is populated
require('dotenv').config();
// our Postgres helper
const db = require('./database');
// review command
const reviewCommand = require('./review');
if (interaction.isModalSubmit())  await reviewCommand.handleModal(interaction);
if (interaction.isButton())       await reviewCommand.handleButton(interaction);


// Constants & Setup
const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';
const CATEGORY_LIMIT = 50; // Max channels per category


//───────────────────────────────────────────────────────────────────────────────
// Auto-close log helper (needed by autoCloseLogAndDelete and manual close)
async function autoCloseLog(channel, openerId, channelName, afterLabel) {
  const logChannel = channel.guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
  if (!logChannel || !logChannel.isTextBased()) return;
  await logChannel.send({
    content: `**Ticket Closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed After: ${afterLabel}`
  });
}
//───────────────────────────────────────────────────────────────────────────────

// PRICE CALC UTILS
function calculateTrophyPrice(current, desired) {
  let totalCents = 0;
  let trophiesLeft = desired - current;
  let start = current;
  function costPer5(trophyCount) {
    if (trophyCount < 500) return 5;
    if (trophyCount < 750) return 7.5;
    if (trophyCount < 1000) return 10;
    if (trophyCount < 1100) return 20;
    if (trophyCount < 1200) return 25;
    if (trophyCount < 1300) return 30;
    if (trophyCount < 1400) return 35;
    if (trophyCount < 1500) return 40;
    if (trophyCount < 1600) return 45;
    if (trophyCount < 1700) return 50;
    if (trophyCount < 1800) return 55;
    if (trophyCount < 1900) return 65;
    if (trophyCount < 2000) return 75;
    return 75;
  }
  while (trophiesLeft > 0) {
    const thisBlock = Math.min(trophiesLeft, 5);
    const costSegment = costPer5(start);
    totalCents += costSegment;
    trophiesLeft -= thisBlock;
    start += 5;
  }
  const totalEuros = totalCents / 100;
  return Math.round(totalEuros * 100) / 100;
}

function calculateBulkPrice(current, desired) {
  let totalCents = 0;
  let trophiesLeft = desired - current;
  let start = current;
  function costPer10(trophyCount) {
    if (trophyCount < 10000) return 5;
    if (trophyCount < 20000) return 7.5;
    if (trophyCount < 30000) return 10;
    if (trophyCount < 40000) return 11;
    if (trophyCount < 50000) return 12.5;
    if (trophyCount < 60000) return 15;
    if (trophyCount < 70000) return 17.5;
    if (trophyCount < 80000) return 20;
    if (trophyCount < 90000) return 25;
    if (trophyCount < 100000) return 30;
    if (trophyCount < 110000) return 45;
    if (trophyCount < 120000) return 60;
    if (trophyCount < 130000) return 75;
    if (trophyCount < 140000) return 100;
    if (trophyCount < 150000) return 150;
    return 150;
  }
  while (trophiesLeft > 0) {
    const thisBlock = Math.min(trophiesLeft, 10);
    const costSegment = costPer10(start);
    totalCents += costSegment;
    trophiesLeft -= thisBlock;
    start += 10;
  }
  const totalEuros = totalCents / 100;
  return Math.round(totalEuros * 100) / 100;
}

// Rank / Mastery arrays
const RANKED_ORDER = [
  'Bronze1','Bronze2','Bronze3',
  'Silver1','Silver2','Silver3',
  'Gold1','Gold2','Gold3',
  'Diamond1','Diamond2','Diamond3',
  'Mythic1','Mythic2','Mythic3',
  'Legendary1','Legendary2','Legendary3',
  'Masters1','Masters2','Masters3',
  'Pro'
];

const RANKED_STEPS_COST = {
  'Bronze1->Bronze2': 0.25,
  'Bronze2->Bronze3': 0.35,
  'Bronze3->Silver1': 0.40,
  'Silver1->Silver2': 0.50,
  'Silver2->Silver3': 0.50,
  'Silver3->Gold1': 0.50,
  'Gold1->Gold2': 0.70,
  'Gold2->Gold3': 0.70,
  'Gold3->Diamond1': 0.70,
  'Diamond1->Diamond2': 1.50,
  'Diamond2->Diamond3': 1.50,
  'Diamond3->Mythic1': 1.50,
  'Mythic1->Mythic2': 2.50,
  'Mythic2->Mythic3': 3.00,
  'Mythic3->Legendary1': 3.50,
  'Legendary1->Legendary2': 7.00,
  'Legendary2->Legendary3': 10.00,
  'Legendary3->Masters1': 13.00,
  'Masters1->Masters2': 50.00,
  'Masters2->Masters3': 80.00,
  'Masters3->Pro': 120.00
};

function calculateRankedPrice(currentRank, desiredRank) {
  const idxStart = RANKED_ORDER.indexOf(currentRank);
  const idxEnd = RANKED_ORDER.indexOf(desiredRank);
  if (idxStart < 0 || idxEnd < 0 || idxStart >= idxEnd) {
    return null;
  }
  let total = 0;
  for (let i = idxStart; i < idxEnd; i++) {
    const stepKey = `${RANKED_ORDER[i]}->${RANKED_ORDER[i+1]}`;
    const stepCost = RANKED_STEPS_COST[stepKey] || 0;
    total += stepCost;
  }
  return Math.round(total * 100) / 100;
}

// Mastery
const MASTERY_ORDER = [
  'Bronze1','Bronze2','Bronze3',
  'Silver1','Silver2','Silver3',
  'Gold1','Gold2','Gold3'
];

const MASTERY_STEPS_COST = {
  'Bronze1->Bronze2': 2.00,
  'Bronze2->Bronze3': 3.00,
  'Bronze3->Silver1': 2.00,
  'Silver1->Silver2': 6.00,
  'Silver2->Silver3': 8.00,
  'Silver3->Gold1': 15.00,
  'Gold1->Gold2': 20.00,
  'Gold2->Gold3': 30.00
};

function calculateMasteryPrice(currentRank, desiredRank) {
  const idxStart = MASTERY_ORDER.indexOf(currentRank);
  const idxEnd = MASTERY_ORDER.indexOf(desiredRank);
  if (idxStart < 0 || idxEnd < 0 || idxStart >= idxEnd) {
    return null;
  }
  let total = 0;
  for (let i = idxStart; i < idxEnd; i++) {
    const stepKey = `${MASTERY_ORDER[i]}->${MASTERY_ORDER[i+1]}`;
    const stepCost = MASTERY_STEPS_COST[stepKey] || 0;
    total += stepCost;
  }
  return Math.round(total * 100) / 100;
}

// Create ticket channel helper
async function createTicketChannelWithOverflow(interaction, categoryId, answers) {
  const { guild, user } = interaction;
  const existingTickets = guild.channels.cache.filter(ch => {
    if (ch.type === ChannelType.GuildText) {
      const perm = ch.permissionOverwrites.cache.get(user.id);
      return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
    }
    return false;
  });
  const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);
  const categoryFull = isCategoryFull(categoryId, guild);
  const parentToUse = (hasOverflow || categoryFull) ? null : categoryId;
  try {
    const channelName = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
    const newChan = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentToUse,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ...STAFF_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
      ]
    });
    const mentionText = `<@${user.id}>`;
    const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will respond soon.');
    let desc = '';
    for (const [q, ans] of answers) {
      desc += `**${q}:**\n${ans}\n\n`;
    }
    const qnaEmbed = new EmbedBuilder().setDescription(desc.trim());
    const closeBtnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setEmoji('<:Lock:1349157009244557384>')
        .setStyle(ButtonStyle.Danger)
    );
    await newChan.send({ content: mentionText, embeds: [welcomeEmbed, qnaEmbed], components: [closeBtnRow] });
    ticketDataMap.set(newChan.id, new TicketData(user.id, newChan.id, newChan.name, Date.now()));
    return interaction.reply({ content: `Ticket created: <#${newChan.id}>`, ephemeral: true });
  } catch (err) {
    console.error(err);
    return interaction.reply({ content: 'Failed to create ticket channel. Check permissions.', ephemeral: true });
  }
}

// Client setup with intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,

  GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel]
});

// Roles & IDs
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659', '986164993080836096'];
const STAFF_ROLES = [
  '1292933924116500532',
  '1292933200389083196',
  '1303702944696504441',
  '1322611585281425478'
];
const LIST_COMMAND_ROLE = '1292933200389083196';
const BRAWLSHOP_AD_ROLE = '1351998501982048346';

// Ticket Categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK: '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER: '1322947859561320550'
};
const MAX_TICKETS_PER_USER = 2;

// ?move Categories
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// Adds channels & roles
const ADD_115K_MSG_CHANNEL = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';
const ADD_115K_ROLE = '1351281086134747298';
const MATCHERINO_WINNER_ROLE = '1351281117445099631';

// Purchase account category
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// Auto-close log channel
const AUTO_CLOSE_LOG_CHANNEL = '1354587880382795836';

// Embed color
const EMBED_COLOR = '#E68DF2';

// TicketData class
class TicketData {
  constructor(openerId, channelId, channelName, openTime) {
    this.openerId = openerId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.openTime = openTime;
    this.msgCount = 0;
    this.lastOpenerMsgTime = openTime;
    this.reminder6hSent = false;
    this.reminder12hSent = false;
    this.reminder24hSent = false;
  }
}

const ticketDataMap = new Map();
const ephemeralFlowState = new Map();

/**
 * Check if a category is full (≥ CATEGORY_LIMIT channels)
 */
function isCategoryFull(categoryId, guild) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return false;
  return category.children.cache.size >= CATEGORY_LIMIT;
}

/** Checks if a member has at least one of the specified roles. */
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(r => member.roles.cache.has(r));
}

// /list slash command registration
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
  .addAttachmentOption(opt =>
    opt.setName('image')
      .setDescription('Main image (upload a file)')
      .setRequired(true)
  );

// Handle slash commands & buttons
client.on('interactionCreate', async interaction => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'review') {
      return reviewCommand.execute(interaction);
    }
    if (interaction.commandName === 'list') {
      if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
        return interaction.reply({ content: "You don't have permission to use this.", ephemeral: true });
      }
      const pingChoice = interaction.options.getString('ping');
      const text = interaction.options.getString('text');
      const price = interaction.options.getString('price');
      const trophies = interaction.options.getString('trophies');
      const p11 = interaction.options.getString('p11');
      const tierMax = interaction.options.getString('tier_max');
      const image = interaction.options.getAttachment('image')?.url;
      let mention = '**New account added!**';
      if (pingChoice === 'everyone') mention = '**||@everyone|| New account added!**';
      if (pingChoice === 'here') mention = '**||@here|| New account added!**';
      const embed = new EmbedBuilder()
        .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
        .setColor(EMBED_COLOR)
        .addFields(
          { name: 'Description', value: text },
          { name: '<:Money:1351665747641766022> Price', value: price, inline: true },
          { name: '<:gold_trophy:1351658932434768025> Trophies', value: trophies, inline: true },
          { name: '<:P11:1351683038127591529> P11', value: p11, inline: true },
          { name: '<:tiermax:1301899953320497243> Tier Max', value: tierMax, inline: true }
        );
      if (image) embed.setImage(image);
      await interaction.reply({ content: 'Listing posted!', ephemeral: true });
      const msg = await interaction.channel.send({
        content: mention,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('purchase_account_temp')
            .setLabel('Purchase Account')
            .setEmoji('<:Shopping_Cart:1351686041559367752>')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('listing_mark_sold_temp')
            .setLabel('Mark as Sold')
            .setStyle(ButtonStyle.Danger)
        )]
      });
      // update IDs
      const purchaseId = `purchase_account_${msg.id}`;
      const soldId = `listing_mark_sold_${msg.id}`;
      const rows = msg.components.map(row => {
        const builder = ActionRowBuilder.from(row);
        builder.components.forEach(c => {
          if (c.customId === 'purchase_account_temp') c.setCustomId(purchaseId);
          if (c.customId === 'listing_mark_sold_temp') c.setCustomId(soldId);
        });
        return builder;
      });
      await msg.edit({ components: rows });
    }
  }
});

// Message commands: ?ticketpanel, ?move, ?adds, ?friendlist
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const prefix = '?';
  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'ticketpanel') {
    if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission!");
    }
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Order a Boost')
      .setDescription('Select the boost you want:');
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trophies').setLabel('Trophies').setEmoji('<:trophy:1301901071471345664>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_ranked').setLabel('Ranked').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_bulk').setLabel('Bulk Trophies').setEmoji('<:gold_trophy:1351658932434768025>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_mastery').setLabel('Mastery').setEmoji('<:mastery:1351659726991134832>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_other').setLabel('Other').setEmoji('<:winmatcherino:1298703851934711848>').setStyle(ButtonStyle.Success)
    );
    await message.channel.send({ embeds: [embed], components: [row1, row2] });
    await message.reply('Ticket panel created!');
  }

  if (cmd === 'move') {
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
  }

  if (cmd === 'adds') {
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
  }

  if (cmd === 'friendlist') {
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
});

// 8) Button Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, member, guild, channel, user } = interaction;

  // Purchase listing
  if (customId.startsWith('purchase_account_')) {
    try {
      const existingTickets = guild.channels.cache.filter(ch =>
        ch.type === ChannelType.GuildText && ch.name.startsWith(`purchase-${user.username}-`)
      );
      const hasOverflowUser = existingTickets.size >= MAX_TICKETS_PER_USER;
      const categoryFull = isCategoryFull(PURCHASE_ACCOUNT_CATEGORY, guild);
      const parentToUse = (hasOverflowUser || categoryFull) ? null : PURCHASE_ACCOUNT_CATEGORY;
      const channelName = `purchase-${user.username}-${Math.floor(Math.random() * 1000)}`;
      const purchaseChannel = await guild.channels.create({
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
      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');
      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await purchaseChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });
      ticketDataMap.set(purchaseChannel.id, new TicketData(user.id, purchaseChannel.id, channelName, Date.now()));
      return interaction.reply({ content: `Ticket created: <#${purchaseChannel.id}>`, ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to create purchase ticket channel.', ephemeral: true });
    }
  }

  // Mark listing as sold
  if (customId.startsWith('listing_mark_sold_')) {
    if (!member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({ content: 'Only authorized users can mark as sold.', ephemeral: true });
    }
    const originalMsg = interaction.message;
    const soldButton = new ButtonBuilder()
      .setCustomId('sold_button')
      .setLabel('This account has been sold.')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);
    const soldRow = new ActionRowBuilder().addComponents(soldButton);
    try {
      await originalMsg.edit({ components: [soldRow] });
      return interaction.reply({ content: 'Listing marked as sold!', ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to mark as sold.', ephemeral: true });
    }
  }

  // 115k Add
  if (customId === 'btn_add_115k') {
    if (!member.roles.cache.has(ADD_115K_ROLE)) {
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
  }

  // Matcherino Winner Add
  if (customId === 'btn_add_matcherino_winner') {
    if (!member.roles.cache.has(MATCHERINO_WINNER_ROLE)) {
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
  }

  // Friendlist buy add
  if (customId === 'friendlist_buyadd') {
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
  }

  // Friendlist player info
  if (customId === 'friendlist_playerinfo') {
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
  }

  // Buy ticket channels for adds
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
  if (buyMap[customId]) {
    try {
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
  }

  // Info ticket channels (player info)
  const infoMap = buyMap; // same mapping
  if (infoMap[customId]) {
    return interaction.reply({ content: `Information about **${infoMap[customId]}**: ...`, ephemeral: true });
  }

  // Ticket panel buttons
  if (customId === 'ticket_trophies') {
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
  }

  if (customId === 'ticket_bulk') {
    const modal = new ModalBuilder().setCustomId('modal_bulk_start').setTitle('Bulk Trophies');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bulk_current').setLabel('Current Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bulk_desired').setLabel('Desired Total Trophies').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'ticket_other') {
    const modal = new ModalBuilder().setCustomId('modal_ticket_other').setTitle('Other Request');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('other_purchase').setLabel('What Are You Purchasing?').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (customId === 'ticket_ranked') {
    ephemeralFlowState.set(user.id, { step: 'ranked_current_main' });
    const embed = new EmbedBuilder().setTitle('Current Rank').setDescription('Select your current rank:').setColor(EMBED_COLOR);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Mythic').setLabel('Mythic').setEmoji('<:mythic:1357482343555666181>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_current_Diamond').setLabel('Diamond').setEmoji('<:diamond:1357482488506613920>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_current_Gold').setLabel('Gold').setEmoji('<:gold:1357482374048256131>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_current_Silver').setLabel('Silver').setEmoji('<:silver:1357482400333955132>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ranked_current_Bronze').setLabel('Bronze').setEmoji('<:bronze:1357482418654937332>').setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }

  if (customId === 'ticket_mastery') {
    const modal = new ModalBuilder().setCustomId('modal_mastery_brawler').setTitle('Mastery Boost');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('mastery_brawler').setLabel('Which Brawler?').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }
});

// 9) Modal Submissions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId, user } = interaction;

  // Trophies modal
  if (customId === 'modal_trophies_start') {
    const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
    const current = parseInt(interaction.fields.getTextInputValue('brawler_current').trim(), 10);
    const desired = parseInt(interaction.fields.getTextInputValue('brawler_desired').trim(), 10);
    if (isNaN(current) || isNaN(desired) || current >= desired) {
      return interaction.reply({ content: 'Invalid trophy amounts.', ephemeral: true });
    }
    const price = calculateTrophyPrice(current, desired);
    const embed = new EmbedBuilder()
      .setTitle('Your Price')
      .setDescription(`\`€${price}\``)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trophies_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('trophies_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, { panelType: 'trophies', brawlerName, current, desired, price });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Bulk modal
  if (customId === 'modal_bulk_start') {
    const current = parseInt(interaction.fields.getTextInputValue('bulk_current').trim(), 10);
    const desired = parseInt(interaction.fields.getTextInputValue('bulk_desired').trim(), 10);
    if (isNaN(current) || isNaN(desired) || current >= desired) {
      return interaction.reply({ content: 'Invalid trophy amounts.', ephemeral: true });
    }
    const price = calculateBulkPrice(current, desired);
    const embed = new EmbedBuilder()
      .setTitle('Your Price')
      .setDescription(`\`€${price}\``)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bulk_purchase_boost').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bulk_cancel').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    ephemeralFlowState.set(user.id, { panelType: 'bulk', current, desired, price });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Other modal
  if (customId === 'modal_ticket_other') {
    const what = interaction.fields.getTextInputValue('other_purchase').trim();
    const lines = [['What Are You Purchasing?', what]];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.OTHER, lines);
  }

  // Mastery brawler modal
  if (customId === 'modal_mastery_brawler') {
    const brawlerName = interaction.fields.getTextInputValue('mastery_brawler').trim();
    ephemeralFlowState.set(user.id, { step: 'mastery_current_main', brawlerName });
    const embed = new EmbedBuilder().setTitle('Current Mastery').setDescription('Select your current mastery level:').setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_current_Bronze').setLabel('Bronze').setEmoji('<:mastery_bronze:1357487786394914847>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mastery_current_Silver').setLabel('Silver').setEmoji('<:mastery_silver:1357487832481923153>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mastery_current_Gold').setLabel('Gold').setEmoji('<:mastery_gold:1357487865029722254>').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
});

// 10) Trophies/Bulk purchase buttons
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;

  // Cancel
  if (customId === 'trophies_cancel' || customId === 'bulk_cancel') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }

  // Purchase
  if (customId === 'trophies_purchase_boost' || customId === 'bulk_purchase_boost') {
    const data = ephemeralFlowState.get(user.id);
    if (!data) return interaction.reply({ content: 'No data found.', ephemeral: true });
    ephemeralFlowState.delete(user.id);
    if (data.panelType === 'trophies') {
      const lines = [
        ['Which Brawler?', data.brawlerName],
        ['Current Trophies?', data.current],
        ['Desired Trophies?', data.desired],
        ['Price', `€${data.price}`]
      ];
      return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.TROPHIES, lines);
    } else {
      const lines = [
        ['Current Trophies?', data.current],
        ['Desired Trophies?', data.desired],
        ['Price', `€${data.price}`]
      ];
      return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.BULK, lines);
    }
  }
});

// 11) Ranked flow
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;
  const data = ephemeralFlowState.get(user.id);

  // Current rank selection
  if (customId.startsWith('ranked_current_')) {
    const rankBase = customId.replace('ranked_current_', '');
    ephemeralFlowState.set(user.id, { step: 'ranked_current_sub', currentRank: null, rankBase });
    const emojis = {
      Masters: '<:Masters:1293283897618075728>',
      Legendary: '<:Legendary:1264709440561483818>',
      Mythic: '<:mythic:1357482343555666181>',
      Diamond: '<:diamond:1357482488506613920>',
      Gold: '<:gold:1357482374048256131>',
      Silver: '<:silver:1357482400333955132>',
      Bronze: '<:bronze:1357482418654937332>'
    };
    const styles = {
      Masters: ButtonStyle.Success,
      Legendary: ButtonStyle.Danger,
      Mythic: ButtonStyle.Danger,
      Diamond: ButtonStyle.Primary,
      Gold: ButtonStyle.Success,
      Silver: ButtonStyle.Primary,
      Bronze: ButtonStyle.Secondary
    };
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${rankBase} rank:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}1`).setLabel(`${rankBase} 1`).setEmoji(emojis[rankBase]).setStyle(styles[rankBase]),
      new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}2`).setLabel(`${rankBase} 2`).setEmoji(emojis[rankBase]).setStyle(styles[rankBase]),
      new ButtonBuilder().setCustomId(`ranked_curr_sub_${rankBase}3`).setLabel(`${rankBase} 3`).setEmoji(emojis[rankBase]).setStyle(styles[rankBase])
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Current rank sub-selection
  if (customId.startsWith('ranked_curr_sub_')) {
    const selected = customId.replace('ranked_curr_sub_', '');
    ephemeralFlowState.set(user.id, { step: 'ranked_desired_main', currentRank: selected });
    const embed = new EmbedBuilder().setTitle('Desired Rank').setDescription('Select your desired rank:').setColor(EMBED_COLOR);
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_desired_Masters').setLabel('Masters').setEmoji('<:Masters:1293283897618075728>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_desired_Legendary').setLabel('Legendary').setEmoji('<:Legendary:1264709440561483818>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_desired_Mythic').setLabel('Mythic').setEmoji('<:mythic:1357482343555666181>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ranked_desired_Diamond').setLabel('Diamond').setEmoji('<:diamond:1357482488506613920>').setStyle(ButtonStyle.Primary)
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_desired_Gold').setLabel('Gold').setEmoji('<:gold:1357482374048256131>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_desired_Silver').setLabel('Silver').setEmoji('<:silver:1357482400333955132>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ranked_desired_Bronze').setLabel('Bronze').setEmoji('<:bronze:1357482418654937332>').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ranked_desired_Pro').setLabel('Pro').setEmoji('<:pro:1351687685328208003>').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
  }

  // Desired rank selection or sub-selection
  if (customId.startsWith('ranked_desired_')) {
    const base = customId.replace('ranked_desired_', '');
    const state = ephemeralFlowState.get(user.id);
    if (base === 'Pro') {
      const cost = calculateRankedPrice(state.currentRank, 'Pro');
      ephemeralFlowState.set(user.id, { step: 'ranked_final', currentRank: state.currentRank, desiredRank: 'Pro', price: cost });
      const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } else {
      // sub-rank selection
      const emojis = {
        Masters: '<:Masters:1293283897618075728>',
        Legendary: '<:Legendary:1264709440561483818>',
        Mythic: '<:mythic:1357482343555666181>',
        Diamond: '<:diamond:1357482488506613920>',
        Gold: '<:gold:1357482374048256131>',
        Silver: '<:silver:1357482400333955132>',
        Bronze: '<:bronze:1357482418654937332>'
      };
      const styles = {
        Masters: ButtonStyle.Success,
        Legendary: ButtonStyle.Danger,
        Mythic: ButtonStyle.Danger,
        Diamond: ButtonStyle.Primary,
        Gold: ButtonStyle.Success,
        Silver: ButtonStyle.Primary,
        Bronze: ButtonStyle.Secondary
      };
      ephemeralFlowState.set(user.id, { step: 'ranked_desired_sub', currentRank: state.currentRank, baseDesired: base });
      const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} rank:`).setColor(EMBED_COLOR);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ranked_dsub_${base}1`).setLabel(`${base} 1`).setEmoji(emojis[base]).setStyle(styles[base]),
        new ButtonBuilder().setCustomId(`ranked_dsub_${base}2`).setLabel(`${base} 2`).setEmoji(emojis[base]).setStyle(styles[base]),
        new ButtonBuilder().setCustomId(`ranked_dsub_${base}3`).setLabel(`${base} 3`).setEmoji(emojis[base]).setStyle(styles[base])
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  }

  // Desired sub-rank selection
  if (customId.startsWith('ranked_dsub_')) {
    const desiredRank = customId.replace('ranked_dsub_', '');
    const state = ephemeralFlowState.get(user.id);
    const cost = calculateRankedPrice(state.currentRank, desiredRank);
    ephemeralFlowState.set(user.id, { step: 'ranked_final', currentRank: state.currentRank, desiredRank, price: cost });
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ranked_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ranked_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Cancel and finalize ranked
  if (customId === 'ranked_cancel_final') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }
  if (customId === 'ranked_purchase_final') {
    const state = ephemeralFlowState.get(user.id);
    ephemeralFlowState.delete(user.id);
    const lines = [
      ['Current Rank', state.currentRank],
      ['Desired Rank', state.desiredRank],
      ['Price', `€${state.price}`]
    ];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.RANKED, lines);
  }
});

// 12) Mastery flow
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;
  const state = ephemeralFlowState.get(user.id);

  // Current mastery
  if (customId.startsWith('mastery_current_')) {
    const base = customId.replace('mastery_current_', '');
    ephemeralFlowState.set(user.id, { ...state, step: 'mastery_current_sub', baseMastery: base });
    const emojis = { Bronze: '<:mastery_bronze:1357487786394914847>', Silver: '<:mastery_silver:1357487832481923153>', Gold: '<:mastery_gold:1357487865029722254>' };
    const styles = { Bronze: ButtonStyle.Danger, Silver: ButtonStyle.Primary, Gold: ButtonStyle.Success };
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} mastery:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mastery_csub_${base}1`).setLabel(`${base} 1`).setEmoji(emojis[base]).setStyle(styles[base]),
      new ButtonBuilder().setCustomId(`mastery_csub_${base}2`).setLabel(`${base} 2`).setEmoji(emojis[base]).setStyle(styles[base]),
      new ButtonBuilder().setCustomId(`mastery_csub_${base}3`).setLabel(`${base} 3`).setEmoji(emojis[base]).setStyle(styles[base])
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Current mastery sub-selection
  if (customId.startsWith('mastery_csub_')) {
    const pick = customId.replace('mastery_csub_', '');
    ephemeralFlowState.set(user.id, { ...state, step: 'mastery_desired_main', currentMastery: pick });
    const embed = new EmbedBuilder().setTitle('Desired Mastery').setDescription('Select desired mastery level:').setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_desired_Bronze').setLabel('Bronze').setEmoji('<:mastery_bronze:1357487786394914847>').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mastery_desired_Silver').setLabel('Silver').setEmoji('<:mastery_silver:1357487832481923153>').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mastery_desired_Gold').setLabel('Gold').setEmoji('<:mastery_gold:1357487865029722254>').setStyle(ButtonStyle.Success)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Desired mastery selection
  if (customId.startsWith('mastery_desired_')) {
    const base = customId.replace('mastery_desired_', '');
    ephemeralFlowState.set(user.id, { ...state, step: 'mastery_desired_sub', baseDesired: base });
    const emojis = { Bronze: '<:mastery_bronze:1357487786394914847>', Silver: '<:mastery_silver:1357487832481923153>', Gold: '<:mastery_gold:1357487865029722254>' };
    const styles = { Bronze: ButtonStyle.Danger, Silver: ButtonStyle.Primary, Gold: ButtonStyle.Success };
    const embed = new EmbedBuilder().setDescription(`Specify your exact ${base} mastery:`).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mastery_dsub_${base}1`).setLabel(`${base} 1`).setEmoji(emojis[base]).setStyle(styles[base]),
      new ButtonBuilder().setCustomId(`mastery_dsub_${base}2`).setLabel(`${base} 2`).setEmoji(emojis[base]).setStyle(styles[base]),
      new ButtonBuilder().setCustomId(`mastery_dsub_${base}3`).setLabel(`${base} 3`).setEmoji(emojis[base]).setStyle(styles[base])
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Desired mastery sub-selection
  if (customId.startsWith('mastery_dsub_')) {
    const pick = customId.replace('mastery_dsub_', '');
    const cost = calculateMasteryPrice(state.currentMastery, pick);
    ephemeralFlowState.set(user.id, { ...state, desiredMastery: pick, price: cost, step: 'mastery_price' });
    const embed = new EmbedBuilder().setTitle('Your Price').setDescription(`\`€${cost}\``).setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mastery_purchase_final').setLabel('Purchase Boost').setEmoji('<:checkmark:1357478063616688304>').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('mastery_cancel_final').setLabel('Cancel').setEmoji('<:cross:1351689463453061130>').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
});

// Mastery finalize
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, user } = interaction;
  const state = ephemeralFlowState.get(user.id);
  if (customId === 'mastery_cancel_final') {
    ephemeralFlowState.delete(user.id);
    return interaction.update({ content: 'Cancelled.', embeds: [], components: [] });
  }
  if (customId === 'mastery_purchase_final') {
    ephemeralFlowState.delete(user.id);
    const lines = [
      ['Which Brawler?', state.brawlerName],
      ['Current Mastery?', state.currentMastery],
      ['Desired Mastery?', state.desiredMastery],
      ['Price', `€${state.price}`]
    ];
    return createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.MASTERY, lines);
  }
});

// Ticket close / delete / reopen
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId, channel, guild, user, member } = interaction;

  // Close ticket
  if (customId === 'close_ticket') {
    try {
      await channel.permissionOverwrites.set([
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: STAFF_ROLES[0], allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ]);
      const closeEmbed = new EmbedBuilder().setTitle('Ticket Closed').setDescription(`Closed by <@${user.id}>.`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('delete_ticket').setLabel('Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reopen_ticket').setLabel('Re-Open').setStyle(ButtonStyle.Success)
      );
      await channel.send({ embeds: [closeEmbed], components: [row] });
      const data = ticketDataMap.get(channel.id);
      await autoCloseLog(channel, data?.openerId || user.id, channel.name, 'Manually closed');
      await db.query('DELETE FROM tickets WHERE channel_id = $1', [channel.id]);
      return interaction.reply({ content: 'Ticket closed.', ephemeral: true });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to close ticket.', ephemeral: true });
    }
  }

  // Delete ticket
  if (customId === 'delete_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can delete tickets.', ephemeral: true });
    }
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(console.error);
    ticketDataMap.delete(channel.id);
  }

  // Reopen ticket
  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({ content: 'Only staff can re-open tickets.', ephemeral: true });
    }
    const data = ticketDataMap.get(channel.id);
    const openerId = data?.openerId;
    try {
      await channel.permissionOverwrites.set([
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: openerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ...STAFF_ROLES.map(rid => ({
          id: rid,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        }))
      ]);
      await interaction.reply({ content: 'Ticket re-opened!', ephemeral: true });
      await channel.send({ embeds: [new EmbedBuilder().setDescription('Ticket has been re-opened.')] });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: 'Failed to re-open ticket.', ephemeral: true });
    }
  }
});

// Presence update
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence?.member || newPresence.status === 'offline') return;
  const member = newPresence.member;
  if (!member.manageable) return;
  const hasLink = newPresence.activities?.some(act =>
    act.state?.toLowerCase().includes('discord.gg/brawlshop')
  );
  if (hasLink && !member.roles.cache.has(BRAWLSHOP_AD_ROLE)) {
    await member.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
  }
});

// Auto-close check every minute
setInterval(() => checkTicketTimeouts(), 60 * 1000);

async function checkTicketTimeouts() {
  const now = Date.now();
  const guild = client.guilds.cache.first();
  if (!guild) return;
  for (const [channelId, data] of ticketDataMap.entries()) {
    const { openerId, channelName, openTime, msgCount, lastOpenerMsgTime } = data;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) { ticketDataMap.delete(channelId); continue; }
    const member = guild.members.cache.get(openerId);
    if (!member) {
      const username = await fetchUsername(openerId) || 'Unknown';
      await autoCloseLogAndDelete(channel, openerId, channelName, `User left (was ${username})`);
      ticketDataMap.delete(channelId);
      continue;
    }
    if (msgCount === 0) {
      const hours = (now - openTime) / 36e5;
      if (hours >= 6 && !data.reminder6hSent) {
        data.reminder6hSent = true;
        await db.query('UPDATE tickets SET reminder_6h = TRUE WHERE channel_id = $1', [channelId]);
        await sendNoMsgReminder(channel, openerId, 6, 18);
      }
      if (hours >= 12 && !data.reminder12hSent) {
        data.reminder12hSent = true;
        await db.query('UPDATE tickets SET reminder_12h = TRUE WHERE channel_id = $1', [channelId]);
        await sendNoMsgReminder(channel, openerId, 12, 12);
      }
      if (hours >= 24) {
        await autoCloseLogAndDelete(channel, openerId, channelName, '24h no response');
        ticketDataMap.delete(channelId);
      }
    } else {
      const inactive = (now - lastOpenerMsgTime) / 36e5;
      if (inactive >= 24 && inactive < 48 && !data.reminder24hSent) {
        data.reminder24hSent = true;
        await db.query('UPDATE tickets SET reminder_24h = TRUE WHERE channel_id = $1', [channelId]);
        await sendInactivityReminder(channel, openerId);
      }
      if (inactive >= 48) {
        await autoCloseLogAndDelete(channel, openerId, channelName, '48h inactivity');
        ticketDataMap.delete(channelId);
      }
    }
  }
}

async function sendNoMsgReminder(channel, openerId, soFar, left) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No messages for **${soFar}h**, please respond within **${left}h**.`);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No activity for 24h, please respond within 24h.`);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

// Count messages in ticket channels
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const data = ticketDataMap.get(message.channel.id);
  if (!data || message.author.id !== data.openerId) return;
  data.msgCount += 1;
  data.lastOpenerMsgTime = Date.now();
  await db.query(`
    INSERT INTO tickets(channel_id, opener_id, channel_name, open_time, msg_count, last_msg_time, reminder_6h, reminder_12h, reminder_24h)
    VALUES($1,$2,$3,to_timestamp($4/1000),$5,to_timestamp($6/1000),$7,$8,$9)
    ON CONFLICT (channel_id) DO UPDATE SET
      msg_count = EXCLUDED.msg_count,
      last_msg_time = EXCLUDED.last_msg_time,
      reminder_6h = EXCLUDED.reminder_6h,
      reminder_12h = EXCLUDED.reminder_12h,
      reminder_24h = EXCLUDED.reminder_24h;
  `, [
    message.channel.id,
    data.openerId,
    data.channelName,
    data.openTime,
    data.msgCount,
    data.lastOpenerMsgTime,
    data.reminder6hSent,
    data.reminder12hSent,
    data.reminder24hSent
  ]).catch(console.error);
});

// 13) Bot startup
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    const res = await db.query(`
      SELECT channel_id, opener_id, channel_name,
        EXTRACT(EPOCH FROM open_time)*1000 AS open_time,
        msg_count,
        EXTRACT(EPOCH FROM last_msg_time)*1000 AS last_msg_time,
        reminder_6h, reminder_12h, reminder_24h
      FROM tickets;
    `);
    for (const row of res.rows) {
      const data = new TicketData(row.opener_id, row.channel_id, row.channel_name, Number(row.open_time));
      data.msgCount = row.msg_count;
      data.lastOpenerMsgTime = Number(row.last_msg_time);
      data.reminder6hSent = row.reminder_6h;
      data.reminder12hSent = row.reminder_12h;
      data.reminder24hSent = row.reminder_24h;
      ticketDataMap.set(row.channel_id, data);
    }
    console.log(`Loaded ${res.rows.length} tickets`);
  } catch (err) {
    console.error('Error loading tickets:', err);
  }
  try {
    await client.application.commands.create(listCommand);
    console.log('/list registered');
    await client.application.commands.create(reviewCommand.data);
    console.log('/review registered');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
});

// Auto-close if opener leaves
client.on('guildMemberRemove', async (member) => {
  for (const [channelId, data] of ticketDataMap.entries()) {
    if (data.openerId === member.id) {
      const channel = member.guild.channels.cache.get(channelId);
      if (channel) {
        await autoCloseLogAndDelete(channel, member.id, data.channelName, 'User left server');
      }
      ticketDataMap.delete(channelId);
    }
  }
});

// Log in
client.login(BOT_TOKEN).catch(err => console.error('[Login Error]', err));
