/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token.
 *
 * Includes:
 * - Auto-close logic (0 messages => close at 24h, 6h/12h reminders, etc.)
 * - If a user has >=2 open tickets, new tickets are created with no category
 *   (i.e., parent: null) but still function normally.
 * - Purchase tickets close immediately on “Close Ticket.”
 * - “Mark as Sold” restricted to role 1292933200389083196.
 * - 115k add fix: remove *all* roles from ADD_115K_ROLES, not just the first.
 * - Matcherino winner add fix: remove all 4 roles if user has them, ensuring 100% removal.
 * - Removed “matcherino swap” button, kept 115k add, matcherino winner add.
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

// 1) CONFIG + SETUP
const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Channel]
});

// Roles / IDs
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659','986164993080836096']; // for ?ticketpanel
const STAFF_ROLES = [
  '1292933924116500532', // staff
  '1292933200389083196', // staff
  '1303702944696504441', // staff
  '1322611585281425478'  // staff
];
const LIST_COMMAND_ROLE = '1292933200389083196'; // can use /list
const BRAWLSHOP_AD_ROLE = '1351998501982048346'; // presence check

// Ticket categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK:   '1351659422484791306',
  MASTERY:'1351659903621791805',
  OTHER:  '1322947859561320550'
};
const MAX_TICKETS_PER_USER = 2;

// ?move categories
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// For ?adds (we removed the matcherino swap, but kept 115k + winner)
const ADD_115K_MSG_CHANNEL     = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';

// **Note**: We'll remove *all* roles in the arrays below if the user has them
// for 115k add & matcherino winner add
const ADD_115K_ROLES = [
  '1351281086134747298',
  '1351687292200423484'
];

// Roles for "Add Matcherino Winner" (5 invites)
const MATCHERINO_WINNER_ROLE_1A = '1351281117445099631';
const MATCHERINO_WINNER_ROLE_1B = '1351281086134747298';
const MATCHERINO_WINNER_ROLE_2A = '1351687292200423484';
const MATCHERINO_WINNER_ROLE_2B = '1351281117445099631';

// Purchase Account category
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// Channel to log auto-closes
const AUTO_CLOSE_LOG_CHANNEL = '1354587880382795836';

// For the embed color
const EMBED_COLOR = '#E68DF2';

// For auto-close logic
class TicketData {
  constructor(openerId, channelId, channelName, openTime) {
    this.openerId = openerId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.openTime = openTime; 
    this.msgCount = 0; 
    this.lastOpenerMsgTime = openTime; 
    // reminders
    this.reminder6hSent = false;
    this.reminder12hSent = false;
    this.reminder24hSent = false;
  }
}

// Store data for each open ticket
const ticketDataMap = new Map();

// check every 5 minutes
setInterval(() => {
  checkTicketTimeouts();
}, 5 * 60 * 1000);

// Auto-close checks
async function checkTicketTimeouts() {
  const now = Date.now();

  for (const [channelId, data] of ticketDataMap.entries()) {
    const { openerId, channelName, openTime, msgCount, lastOpenerMsgTime } = data;
    const guild = client.guilds.cache.first();
    if (!guild) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      ticketDataMap.delete(channelId);
      continue;
    }

    // user left?
    const openerMember = guild.members.cache.get(openerId);
    if (!openerMember) {
      await autoCloseDeleteChannel(
        channel, 
        `User Name: ${await fetchUsername(openerId) || 'Unable to find this'}\nTicket Name: ${channelName}\nClosed Because:\nUser left the server.`
      );
      ticketDataMap.delete(channelId);
      continue;
    }

    if (msgCount === 0) {
      const hoursSinceOpen = (now - openTime) / (1000*60*60);
      if (hoursSinceOpen >= 6 && !data.reminder6hSent) {
        data.reminder6hSent = true;
        await sendNoMsgReminder(channel, openerId, 6, 18); 
      }
      if (hoursSinceOpen >= 12 && !data.reminder12hSent) {
        data.reminder12hSent = true;
        await sendNoMsgReminder(channel, openerId, 12, 12); 
      }
      if (hoursSinceOpen >= 24) {
        // close
        await autoCloseLog(channel, openerId, channelName, '24 hours');
        await channel.delete().catch(()=>{});
        ticketDataMap.delete(channelId);
      }
    } else {
      // 1+ messages
      const hoursInactive = (now - lastOpenerMsgTime) / (1000*60*60);
      if (hoursInactive >= 24 && hoursInactive < 48 && !data.reminder24hSent) {
        data.reminder24hSent = true;
        await sendInactivityReminder(channel, openerId);
      }
      if (hoursInactive >= 48) {
        // close
        await autoCloseLog(channel, openerId, channelName, '48 hours');
        await channel.delete().catch(()=>{});
        ticketDataMap.delete(channelId);
      }
    }
  }
}

// Helper for user left
async function autoCloseDeleteChannel(channel, logText) {
  try {
    const closeEmbed = new EmbedBuilder().setDescription('Ticket closed because user left the server.');
    await channel.send({ embeds: [closeEmbed] }).catch(()=>{});
    await channel.delete().catch(()=>{});
    const guild = client.guilds.cache.first();
    if (guild) {
      const logChannel = guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
      if (logChannel) {
        await logChannel.send({
          content: `**Ticket Closed**\n${logText}`
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// fetch user
async function fetchUsername(userId) {
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch {
    return null;
  }
}

// auto-close log
async function autoCloseLog(channel, openerId, channelName, afterLabel) {
  const guild = channel.guild;
  if (!guild) return;
  const logChannel = guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
  if (!logChannel) return;

  await logChannel.send({
    content: `**Ticket Closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed After: ${afterLabel}`
  });
}

// no message reminders
async function sendNoMsgReminder(channel, openerId, hoursSoFar, hoursLeft) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} - You have not sent a single message for **${hoursSoFar} hours**, please send a message within the next **${hoursLeft} hours** or your ticket will be closed.`);
  await channel.send({ 
    content: mention, 
    embeds: [embed]
  }).catch(()=>{});
}

// inactivity reminder
async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} - You have not sent a message for 24 hours, please send a message within the next 24 hours or your ticket will be closed.`);
  await channel.send({
    content: mention,
    embeds: [embed]
  }).catch(()=>{});
}

// track messages from the ticket opener
client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const data = ticketDataMap.get(message.channel.id);
  if (!data) return; 
  if (message.author.id === data.openerId) {
    data.msgCount += 1;
    data.lastOpenerMsgTime = Date.now();
  }
});

// helper
function hasAnyRole(member, roleIds=[]) {
  return roleIds.some(r => member.roles.cache.has(r));
}

// slash /list
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

// start
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

// presence check
client.on('presenceUpdate', async (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.member) return;
  const member = newPresence.member;
  if (!member.manageable) return;

  const hasAdRole = member.roles.cache.has(BRAWLSHOP_AD_ROLE);
  let foundLink = false;

  if (newPresence.activities) {
    for (const act of newPresence.activities) {
      if (act.state && act.state.toLowerCase().includes('discord.gg/brawlshop')) {
        foundLink = true;
        break;
      }
    }
  }

  if (foundLink && !hasAdRole) {
    await member.roles.add(BRAWLSHOP_AD_ROLE).catch(() => {});
  } else if (!foundLink && hasAdRole) {
    await member.roles.remove(BRAWLSHOP_AD_ROLE).catch(() => {});
  }
});

// ? commands
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = '?';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd  = args.shift()?.toLowerCase();

  // ?ticketpanel
  if (cmd === 'ticketpanel') {
    if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
      return message.reply("You don't have permission to use this command!");
    }

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle('Order a Boost')
      .setDescription('Looking to Purchase a Boost? Please select what kind of boost you want below.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_trophies')
        .setLabel('Trophies')
        .setEmoji('<:trophy:1301901071471345664>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ticket_ranked')
        .setLabel('Ranked')
        .setEmoji('<:Masters:1293283897618075728>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_bulk')
        .setLabel('Bulk Trophies')
        .setEmoji('<:gold_trophy:1351658932434768025>')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_mastery')
        .setLabel('Mastery')
        .setEmoji('<:mastery:1351659726991134832>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_other')
        .setLabel('Other')
        .setEmoji('<:winmatcherino:1298703851934711848>')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row, row2] });
    await message.reply('Ticket panel created!');
  }

  // ?move
  if (cmd === 'move') {
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("You don't have permission to use this command!");
    }
    const sub = args[0];
    if (!sub || !MOVE_CATEGORIES[sub]) {
      return message.reply('Invalid syntax. Usage: ?move [paid|add|sell|finished]');
    }
    const targetCat = MOVE_CATEGORIES[sub];
    try {
      await message.channel.setParent(targetCat, { lockPermissions: false });
      await message.reply(`Channel moved to category: ${sub}`);
    } catch (err) {
      console.error(err);
      message.reply('Could not move the channel. Check permissions or category ID.');
    }
  }

  // ?adds
  if (cmd === 'adds') {
    if (!message.member.roles.cache.has('1292933200389083196')) {
      return message.reply("You don't have permission to use this command!");
    }

    // Only 115k & matcherino winner
    const embed2 = new EmbedBuilder()
      .setTitle('115k Trophies & 71 R35 Add')
      .setColor(EMBED_COLOR)
      .setDescription(
        '**__This requires 3 invites!__**\n\n' +
        'Add a 115k Trophy and 71 legacy R35 Player.'
      )
      .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997791425007656/IMG_2580.png');

    const embed3 = new EmbedBuilder()
      .setTitle('Matcherino Winner Add')
      .setColor(EMBED_COLOR)
      .setDescription(
        '**__This requires 5 invites!__**\n\n' +
        'Add a **Matcherino Winner!**'
      )
      .setImage('https://media.discordapp.net/attachments/1351687016433193051/1351997783028142170/IMG_2581.png');

    const embed4 = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(
        '**Once you have enough invites, claim your reward using the buttons below.**\n\n' +
        'Make sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233'
      );

    await message.channel.send({ embeds: [embed2, embed3] });

    const rowAll = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_add_115k')
        .setLabel('Add 115k')
        .setEmoji('<:gold_trophy:1351658932434768025>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_add_matcherino_winner')
        .setLabel('Add Matcherino Winner')
        .setEmoji('<:pro:1351687685328208003>')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({
      embeds: [embed4],
      components: [rowAll]
    });
  }

  // ?friendlist
  if (cmd === 'friendlist') {
    if (!message.member.roles.cache.has('1292933200389083196')) {
      return message.reply("You don't have permission to use this command!");
    }

    const embedRowLeft =
      '🥈| **LUX | Zoro** - €10\n' +
      '🥈| **Lennox** - €15\n' +
      '🥈| **Melih** - €15\n' +
      '🥈| **Elox** - €15';

    const embedRowRight =
      '🥈| **Kazu** - €15\n' +
      '🥇| **Izana** - €25\n' +
      '🥇| **SKC | Rafiki** - €25\n' +
      '🥇| **HMB | BosS** - €60';

    const friendEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .addFields(
        { name: '\u200b', value: embedRowLeft, inline: true },
        { name: '\u200b', value: embedRowRight, inline: true }
      );

    const friendEmbed2 = new EmbedBuilder()
      .setDescription('# ⬆️ ALL ADDS ARE LIFETIME');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('friendlist_buyadd')
        .setLabel('Buy Add')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('friendlist_playerinfo')
        .setLabel('Player Information')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
      embeds: [friendEmbed, friendEmbed2],
      components: [row]
    });
  }
});

// 7) /list
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'list') {
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({
        content: "You don't have the required role to use this command.",
        ephemeral: true
      });
    }

    const pingChoice = interaction.options.getString('ping');
    const text       = interaction.options.getString('text');
    const price      = interaction.options.getString('price');
    const trophies   = interaction.options.getString('trophies');
    const p11        = interaction.options.getString('p11');
    const tierMax    = interaction.options.getString('tier_max');

    const mainImage = interaction.options.getAttachment('image');
    const imageUrl  = mainImage?.url;

    let nonEmbedText;
    if (pingChoice === 'everyone') {
      nonEmbedText = '**||@everyone|| New account added!**';
    } else if (pingChoice === 'here') {
      nonEmbedText = '**||@here|| New account added!**';
    } else {
      nonEmbedText = '**New account added!**';
    }

    const mainEmbed = new EmbedBuilder()
      .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Description', value: text, inline: false },
        { name: '<:Money:1351665747641766022> Price', value: price, inline: true },
        { name: '<:gold_trophy:1351658932434768025> Trophies', value: trophies, inline: true },
        { name: '<:P11:1351683038127591529> P11', value: p11, inline: true },
        { name: '<:tiermax:1301899953320497243> Tier Max', value: tierMax, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      );

    if (imageUrl) {
      mainEmbed.setImage(imageUrl);
    }

    const rowOfButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_account_temp')
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('listing_mark_sold_temp')
        .setLabel('Mark as Sold')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    const listingMessage = await interaction.channel.send({
      content: nonEmbedText,
      embeds: [mainEmbed],
      components: [rowOfButtons]
    });

    const newPurchaseId = `purchase_account_${listingMessage.id}`;
    const newSoldId     = `listing_mark_sold_${listingMessage.id}`;

    const updatedRows = [];
    for (const rowComp of listingMessage.components) {
      const rowBuilder = ActionRowBuilder.from(rowComp);
      for (const comp of rowBuilder.components) {
        if (comp.customId === 'purchase_account_temp') {
          comp.setCustomId(newPurchaseId);
        } else if (comp.customId === 'listing_mark_sold_temp') {
          comp.setCustomId(newSoldId);
        }
      }
      updatedRows.push(rowBuilder);
    }
    await listingMessage.edit({ components: updatedRows });
  }
});

// 8) BUTTON INTERACTIONS
const friendlistPlayers = [
  'LUX | Zoro',
  'Lennox',
  'Melih',
  'Elox',
  'Kazu',
  'Izana',
  'SKC | Rafiki',
  'HMB | BosS'
];
const playerInfoMap = {
  'LUX | Zoro': {
    title: 'LUX | Zoro Information',
    text: 'LUX | Zoro is an e-sports player for the team LuxAeterna.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352052664476762296/zoro.webp'
  },
  'Lennox': {
    title: 'Lennox Information',
    text: 'Lennox has 130k peak trophies, 48 legacy r35, and 38 prestige.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352052862766813245/lennox.webp'
  },
  'Melih': {
    title: 'Melih Information',
    text: 'Melih has 150k peak trophies, 70 legacy r35.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352053558337470535/melih.webp'
  },
  'Elox': {
    title: 'Elox Information',
    text: 'Elox is an official content creator with 150k peak trophies.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352053811052544111/elox.webp'
  },
  'Kazu': {
    title: 'Kazu Information',
    text: 'Kazu is an official content creator, top 10 global trophies.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055076448899072/kazu.webp'
  },
  'Izana': {
    title: 'Izana Information',
    text: 'Izana is a content creator, bea world record with 50k trophies.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055480079614074/izana.webp'
  },
  'SKC | Rafiki': {
    title: 'SKC | Rafiki Information',
    text: 'Rafiki is a tier S NA pro, also a matcherino winner.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055818165420102/rafiki.webp'
  },
  'HMB | BosS': {
    title: 'HMB | BosS Information',
    text: 'BosS is an e-sport player for Humble, 2024 world finals winner.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352056193337655356/boss.webp'
  }
};

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild, channel, user } = interaction;

  // create a modal
  function buildModal(modalId, title, questions) {
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(title);
    for (const q of questions) {
      const input = new TextInputBuilder()
        .setCustomId(q.customId)
        .setLabel(q.label)
        .setStyle(q.style || TextInputStyle.Short)
        .setRequired(true);
      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);
    }
    return modal;
  }

  // TICKET Panel
  if (customId === 'ticket_trophies') {
    const modal = buildModal('modal_ticket_trophies','Trophies Ticket', [
      { customId: 'current_brawler_trophies', label: 'How many trophies does your brawler have?' },
      { customId: 'desired_brawler_trophies', label: 'Desired brawler trophies?' },
      { customId: 'which_brawler', label: 'Which brawler do you want boosted?' }
    ]);
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_ranked') {
    const modal = buildModal('modal_ticket_ranked','Ranked Ticket', [
      { customId: 'current_rank', label: 'What rank are you now?' },
      { customId: 'desired_rank', label: 'Desired rank?' }
    ]);
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_bulk') {
    const modal = buildModal('modal_ticket_bulk','Bulk Trophies Ticket', [
      { customId: 'current_total', label: 'How many total trophies do you have?' },
      { customId: 'desired_total', label: 'What is your desired total trophies?' }
    ]);
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_mastery') {
    const modal = buildModal('modal_ticket_mastery','Mastery Ticket', [
      { customId: 'current_mastery_rank', label: 'What is your current mastery rank?' },
      { customId: 'desired_mastery_rank', label: 'Desired mastery rank?' },
      { customId: 'which_brawler', label: 'Which brawler do you want boosted?' }
    ]);
    return interaction.showModal(modal);
  }
  if (customId === 'ticket_other') {
    const modal = buildModal('modal_ticket_other','Other Ticket', [
      { customId: 'reason', label: 'Why are you opening this ticket?' }
    ]);
    return interaction.showModal(modal);
  }

  // purchase_account
  if (customId.startsWith('purchase_account_')) {
    // open a "purchase" ticket
    try {
      const existingTickets = guild.channels.cache.filter(ch => {
        if (ch.type === ChannelType.GuildText) {
          const perm = ch.permissionOverwrites.cache.get(user.id);
          return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
        }
        return false;
      });
      const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);

      const channelName = `purchase-${user.username}-${Math.floor(Math.random()*1000)}`;
      const purchaseChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: hasOverflow ? null : PURCHASE_ACCOUNT_CATEGORY,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(rid => ({
            id: rid,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');

      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await purchaseChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });

      ticketDataMap.set(purchaseChannel.id, new TicketData(user.id, purchaseChannel.id, channelName, Date.now()));

      return interaction.reply({
        content: `Ticket created: <#${purchaseChannel.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to create purchase ticket channel.',
        ephemeral: true
      });
    }
  }

  // listing_mark_sold
  if (customId.startsWith('listing_mark_sold_')) {
    if (!member.roles.cache.has('1292933200389083196')) {
      return interaction.reply({
        content: 'Only members with role 1292933200389083196 can mark this as sold.',
        ephemeral: true
      });
    }

    const originalMsg = interaction.message;
    if (!originalMsg) {
      return interaction.reply({
        content: 'Could not fetch the original message to edit.',
        ephemeral: true
      });
    }

    const soldButton = new ButtonBuilder()
      .setCustomId('sold_button')
      .setLabel('This account has been sold.')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true);

    const soldRow = new ActionRowBuilder().addComponents(soldButton);

    try {
      await originalMsg.edit({ components: [soldRow] });
      return interaction.reply({
        content: 'Listing marked as sold!',
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to mark as sold. Check permissions.',
        ephemeral: true
      });
    }
  }

  // btn_add_115k
  if (customId === 'btn_add_115k') {
    let hasAtLeastOneRole = false;
    for (const r of ADD_115K_ROLES) {
      if (member.roles.cache.has(r)) {
        hasAtLeastOneRole = true;
        break;
      }
    }
    if (!hasAtLeastOneRole) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('Insufficient Invites, come back when you have enough!')
        ],
        ephemeral: true
      });
    }

    // show modal
    const modal = new ModalBuilder()
      .setCustomId('modal_add_115k')
      .setTitle('Supercell ID');

    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);
    return interaction.showModal(modal);
  }

  // btn_add_matcherino_winner
  if (customId === 'btn_add_matcherino_winner') {
    // We'll remove all 4 roles if they have them
    const rolesHas = [
      member.roles.cache.has(MATCHERINO_WINNER_ROLE_1A),
      member.roles.cache.has(MATCHERINO_WINNER_ROLE_1B),
      member.roles.cache.has(MATCHERINO_WINNER_ROLE_2A),
      member.roles.cache.has(MATCHERINO_WINNER_ROLE_2B)
    ];
    const hasAny = rolesHas.some(r => r === true);
    if (!hasAny) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - Insufficient Invites!')
        ],
        ephemeral: true
      });
    }

    // show modal
    const modal = new ModalBuilder()
      .setCustomId('modal_matcherino_winner')
      .setTitle('Supercell ID');

    const input = new TextInputBuilder()
      .setCustomId('supercell_id_input')
      .setLabel('Supercell ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  // friendlist => buyAdd
  if (customId === 'friendlist_buyadd') {
    const buyTitle = 'Buy an Add';
    const buyDesc  = 'Please select the player you would like to add.';

    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    const customIds = [
      'buy_luxzoro','buy_lennox','buy_melih','buy_elox','buy_kazu',
      'buy_izana','buy_rafiki','buy_boss'
    ];
    for (let i=0; i<5; i++){
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(customIds[i])
          .setLabel(friendlistPlayers[i])
          .setStyle(ButtonStyle.Success)
      );
    }
    for (let i=5; i<8; i++){
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(customIds[i])
          .setLabel(friendlistPlayers[i])
          .setStyle(ButtonStyle.Success)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(buyTitle)
      .setDescription(buyDesc)
      .setColor(EMBED_COLOR);

    return interaction.reply({
      embeds: [embed],
      components: [row1,row2],
      ephemeral: true
    });
  }

  // friendlist => playerinfo
  if (customId === 'friendlist_playerinfo') {
    const infoTitle = 'Player Information';
    const infoDesc  = 'Get more information about the player you would like to add!';

    const row1 = new ActionRowBuilder(), row2 = new ActionRowBuilder();
    const customIds = [
      'info_luxzoro','info_lennox','info_melih','info_elox','info_kazu',
      'info_izana','info_rafiki','info_boss'
    ];
    for (let i=0; i<5; i++){
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(customIds[i])
          .setLabel(friendlistPlayers[i])
          .setStyle(ButtonStyle.Primary)
      );
    }
    for (let i=5; i<8; i++){
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(customIds[i])
          .setLabel(friendlistPlayers[i])
          .setStyle(ButtonStyle.Primary)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(infoTitle)
      .setDescription(infoDesc)
      .setColor(EMBED_COLOR);

    return interaction.reply({
      embeds: [embed],
      components: [row1,row2],
      ephemeral: true
    });
  }

  // friendlist => buy_xxx or info_xxx
  const buyMap = {
    'buy_luxzoro':'LUX | Zoro',
    'buy_lennox':'Lennox',
    'buy_melih':'Melih',
    'buy_elox':'Elox',
    'buy_kazu':'Kazu',
    'buy_izana':'Izana',
    'buy_rafiki':'SKC | Rafiki',
    'buy_boss':'HMB | BosS'
  };
  const infoMap = {
    'info_luxzoro':'LUX | Zoro',
    'info_lennox':'Lennox',
    'info_melih':'Melih',
    'info_elox':'Elox',
    'info_kazu':'Kazu',
    'info_izana':'Izana',
    'info_rafiki':'SKC | Rafiki',
    'info_boss':'HMB | BosS'
  };

  if (Object.keys(buyMap).includes(customId)) {
    const chosenName = buyMap[customId];
    try {
      const existingTickets = guild.channels.cache.filter(ch => {
        if (ch.type === ChannelType.GuildText) {
          const perm = ch.permissionOverwrites.cache.get(user.id);
          return perm?.allow.has(PermissionsBitField.Flags.ViewChannel);
        }
        return false;
      });
      const hasOverflow = (existingTickets.size >= MAX_TICKETS_PER_USER);

      const channelName = `add-${user.username}-${Math.floor(Math.random()*1000)}`;
      const addChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: hasOverflow ? null : MOVE_CATEGORIES.add, 
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(rid => ({
            id: rid,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder().setDescription(
        'Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.'
      );
      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await addChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });

      const addEmbed = new EmbedBuilder()
        .setDescription(`**Adding Player:**\n${chosenName}`);
      await addChannel.send({ embeds: [addEmbed] });

      ticketDataMap.set(addChannel.id, new TicketData(user.id, addChannel.id, addChannel.name, Date.now()));

      return interaction.reply({
        content: `Ticket created: <#${addChannel.id}>`,
        ephemeral: true
      });
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to create add ticket channel.',
        ephemeral: true
      });
    }
  }

  if (Object.keys(infoMap).includes(customId)) {
    const chosenName = infoMap[customId];
    const p = playerInfoMap[chosenName];
    if (!p) {
      return interaction.reply({
        content: 'No player info found.',
        ephemeral: true
      });
    }
    const embed = new EmbedBuilder()
      .setTitle(p.title)
      .setDescription(p.text)
      .setColor(EMBED_COLOR);
    if (p.image) embed.setImage(p.image);

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
});

// 9) MODAL SUBMISSIONS
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId } = interaction;

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

    try {
      const channelName = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: hasOverflow ? null : categoryId, 
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(rid => ({
            id: rid,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const mentionText = `<@${user.id}>`;
      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will respond soon.');
      
      let desc = '';
      for (const [q,ans] of answers) {
        desc += `**${q}:**\n\`${ans}\`\n\n`;
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

      return interaction.reply({
        content: `Ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch(err){
      console.error(err);
      return interaction.reply({
        content: 'Failed to create ticket channel. Check permissions.',
        ephemeral: true
      });
    }
  }

  // Trophies
  if (customId === 'modal_ticket_trophies') {
    const current = interaction.fields.getTextInputValue('current_brawler_trophies');
    const desired = interaction.fields.getTextInputValue('desired_brawler_trophies');
    const which   = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['How many trophies does your brawler have?', current],
      ['Desired brawler trophies?', desired],
      ['Which brawler?', which]
    ];
    await createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.TROPHIES, answers);
  }

  // Ranked
  if (customId === 'modal_ticket_ranked') {
    const currentRank = interaction.fields.getTextInputValue('current_rank');
    const desiredRank = interaction.fields.getTextInputValue('desired_rank');
    const answers = [
      ['Current rank?', currentRank],
      ['Desired rank?', desiredRank]
    ];
    await createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.RANKED, answers);
  }

  // Bulk
  if (customId === 'modal_ticket_bulk') {
    const currentTotal  = interaction.fields.getTextInputValue('current_total');
    const desiredTotal  = interaction.fields.getTextInputValue('desired_total');
    const answers = [
      ['Current total trophies?', currentTotal],
      ['Desired total trophies?', desiredTotal]
    ];
    await createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.BULK, answers);
  }

  // Mastery
  if (customId === 'modal_ticket_mastery') {
    const currentMastery = interaction.fields.getTextInputValue('current_mastery_rank');
    const desiredMastery = interaction.fields.getTextInputValue('desired_mastery_rank');
    const whichBrawler   = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['Current mastery rank?', currentMastery],
      ['Desired mastery rank?', desiredMastery],
      ['Which brawler?', whichBrawler]
    ];
    await createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.MASTERY, answers);
  }

  // Other
  if (customId === 'modal_ticket_other') {
    const reason = interaction.fields.getTextInputValue('reason');
    const answers = [
      ['Why are you opening this ticket?', reason]
    ];
    await createTicketChannelWithOverflow(interaction, TICKET_CATEGORIES.OTHER, answers);
  }

  // ?adds => 115k
  if (customId === 'modal_add_115k') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    // Remove *all* ADD_115K_ROLES from user
    let hadAtLeastOne = false;
    for (const roleId of ADD_115K_ROLES) {
      if (interaction.member.roles.cache.has(roleId)) {
        hadAtLeastOne = true;
        try {
          await interaction.member.roles.remove(roleId);
        } catch(err) {
          console.error(`Error removing role ${roleId}:`, err);
        }
      }
    }
    if (!hadAtLeastOne) {
      return interaction.reply({
        content: 'Insufficient Invites; you no longer have the required role.',
        ephemeral: true
      });
    }
    const targetChannel = interaction.guild.channels.cache.get(ADD_115K_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }
    await targetChannel.send({
      content: `**New 115k Add**\nUser: <@${interaction.user.id}>\nSupercell ID: \`${supercellId}\``
    });
    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    return interaction.reply({
      embeds: [successEmbed],
      ephemeral: true
    });
  }

  // ?adds => Add Matcherino Winner
  if (customId === 'modal_matcherino_winner') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');

    // Remove all 4 roles if present
    const rolesToRemove = [
      MATCHERINO_WINNER_ROLE_1A,
      MATCHERINO_WINNER_ROLE_1B,
      MATCHERINO_WINNER_ROLE_2A,
      MATCHERINO_WINNER_ROLE_2B
    ];
    let hadAny = false;
    for (const rId of rolesToRemove) {
      if (interaction.member.roles.cache.has(rId)) {
        hadAny = true;
        try {
          await interaction.member.roles.remove(rId);
        } catch(err) {
          console.error(`Error removing role ${rId}:`, err);
        }
      }
    }
    if (!hadAny) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - **Insufficient Invites**')
        ],
        ephemeral: true
      });
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_MATCHERINO_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }
    await targetChannel.send({
      content: `**New Matcherino Winner Add**\nUser: <@${interaction.user.id}>\nSupercell ID: \`${supercellId}\``
    });
    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    return interaction.reply({
      embeds: [successEmbed],
      ephemeral: true
    });
  }
});

// 10) TICKET CLOSE / REOPEN / DELETE
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, guild, user, member } = interaction;
  if (customId === 'close_ticket') {
    // purchase => immediate
    if (channel.parentId === PURCHASE_ACCOUNT_CATEGORY) {
      try {
        await channel.permissionOverwrites.set([
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: '1292933924116500532',
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ]);
        const closeEmbed = new EmbedBuilder()
          .setTitle('Ticket Closed')
          .setDescription(`This ticket has been closed by <@${user.id}>.`);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('delete_ticket')
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('reopen_ticket')
            .setLabel('Re-Open')
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [closeEmbed], components: [row] });
        return interaction.reply({
          content: 'Ticket closed (purchase ticket immediate).',
          ephemeral: true
        });
      } catch(err) {
        console.error(err);
        return interaction.reply({
          content: 'Failed to close the ticket. Check permissions.',
          ephemeral: true
        });
      }
    } else {
      // normal confirm
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_close_ticket')
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_close_ticket')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('Are you sure you want to close this ticket?')
        ],
        components: [confirmRow],
        ephemeral: true
      });
    }
  }

  if (customId === 'confirm_close_ticket') {
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: '1292933924116500532', // staff
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]);

      const closeEmbed = new EmbedBuilder()
        .setTitle('Ticket Closed')
        .setDescription(`This ticket has been closed by <@${user.id}>.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('reopen_ticket')
          .setLabel('Re-Open')
          .setStyle(ButtonStyle.Success)
      );

      await channel.send({ embeds: [closeEmbed], components: [row] });
      return interaction.reply({
        content: 'Ticket closed. Only staff can see it now.',
        ephemeral: true
      });
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to close the ticket. Check permissions.',
        ephemeral: true
      });
    }
  }

  if (customId === 'cancel_close_ticket') {
    return interaction.reply({
      content: 'Ticket close canceled.',
      ephemeral: true
    });
  }

  if (customId === 'delete_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({
        content: 'Only staff can delete tickets.',
        ephemeral: true
      });
    }
    await interaction.reply({ content: 'Deleting channel...', ephemeral: true });
    await channel.delete().catch(console.error);
    ticketDataMap.delete(channel.id);
  }

  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({
        content: 'Only staff can re-open tickets.',
        ephemeral: true
      });
    }
    const data = ticketDataMap.get(channel.id);
    const openerId = data?.openerId;
    if (!openerId) {
      return interaction.reply({
        content: 'Could not find who opened this ticket originally.',
        ephemeral: true
      });
    }
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: openerId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        ...STAFF_ROLES.map(rid => ({
          id: rid,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }))
      ]);
      await interaction.reply({
        content: 'Ticket re-opened!',
        ephemeral: true
      });
      const reopenEmbed = new EmbedBuilder()
        .setDescription('Ticket has been re-opened. Original user and staff can now see it again.');
      await channel.send({ embeds: [reopenEmbed] });
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to re-open ticket.',
        ephemeral: true
      });
    }
  }
});

// If user leaves => close tickets
client.on('guildMemberRemove', async (member) => {
  const userId = member.id;
  for (const [channelId, data] of ticketDataMap.entries()) {
    if (data.openerId === userId) {
      const guild = member.guild;
      const channel = guild.channels.cache.get(channelId);
      if (channel) {
        await autoCloseDeleteChannel(
          channel,
          `User Name: ${member.user.username}\nTicket Name: ${data.channelName}\nClosed Because:\nUser left the server.`
        );
      }
      ticketDataMap.delete(channelId);
    }
  }
});

// 11) LOG IN
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
