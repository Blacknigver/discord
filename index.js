/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Uses process.env.TOKEN for the bot token.
 * 
 * This file is the ENTIRE code, containing:
 * 1) A “More Information” button on each listing (ephemeral).
 * 2) A “Mark as Sold” button that just edits the same message.
 * 3) A “Purchase Account” button that opens a ticket and adds a second embed stating:
 *      **Buying account:**
 *      (the short descriptive text the user provided)
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

//////////////////////////////////////////////////////////////////////
// 1) CONFIG + SETUP
//////////////////////////////////////////////////////////////////////
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
  '1292933924116500532',
  '1292933200389083196',
  '1303702944696504441',
  '1322611585281425478'
];
const LIST_COMMAND_ROLE = '1292933200389083196'; // can use /list
const BRAWLSHOP_AD_ROLE = '1351998501982048346'; // presence check

// Ticket categories (for new tickets)
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

// For ?adds
const MATCHERINO_SWAP_CATEGORY = '1351687962907246753';
const ADD_115K_MSG_CHANNEL     = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';

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

const ticketOpeners = new Map(); // store who opened each ticket
const EMBED_COLOR = '#E68DF2';

// Store listing data => used by "More Info" + "Mark as Sold"
const listingDataMap = new Map(); 
// Key: messageId => { text, brawlers, hypercharges, image2, etc. }

//////////////////////////////////////////////////////////////////////
// 2) UTILITY
//////////////////////////////////////////////////////////////////////
function hasAnyRole(member, roleIds=[]) {
  return roleIds.some(r => member.roles.cache.has(r));
}
function hasAllRoles(member, roleIds=[]) {
  return roleIds.every(r => member.roles.cache.has(r));
}

//////////////////////////////////////////////////////////////////////
// 3) BUILD /list Slash Command
//////////////////////////////////////////////////////////////////////
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
  )
  // Additional data for "More Information"
  .addStringOption(opt =>
    opt.setName('brawlers')
      .setDescription('Brawlers info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('legendary')
      .setDescription('Legendary Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('mythic')
      .setDescription('Mythic Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('epic')
      .setDescription('Epic Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('super_rare')
      .setDescription('Super Rare Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('rare')
      .setDescription('Rare Skins info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p9')
      .setDescription('Power 9 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('p10')
      .setDescription('Power 10 info')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('hypercharges')
      .setDescription('Hypercharges info')
      .setRequired(true)
  )
  .addAttachmentOption(opt =>
    opt.setName('image2')
      .setDescription('Additional image (upload a file)')
      .setRequired(true)
  );

//////////////////////////////////////////////////////////////////////
// 4) BOT STARTUP
//////////////////////////////////////////////////////////////////////
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

//////////////////////////////////////////////////////////////////////
// 5) PRESENCE CHECK
//////////////////////////////////////////////////////////////////////
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

//////////////////////////////////////////////////////////////////////
// 6) MESSAGE HANDLER (?ticketpanel, ?move, ?adds, ?friendlist)
//////////////////////////////////////////////////////////////////////
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = '?';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd  = args.shift()?.toLowerCase();

  /*******************************************************
   ?ticketpanel
  ********************************************************/
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

  /*******************************************************
   ?move
  ********************************************************/
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

  /*******************************************************
   ?adds
  ********************************************************/
  if (cmd === 'adds') {
    // restricted to role 1292933200389083196
    if (!message.member.roles.cache.has('1292933200389083196')) {
      return message.reply("You don't have permission to use this command!");
    }

    const embed1 = new EmbedBuilder()
      .setTitle('Matcherino Swap')
      .setColor(EMBED_COLOR)
      .setDescription(
        '**__This requires 2 invites!__**\n\n' +
        'Swap pins with a **Matcherino Winner** in a friendly game.\n\n' +
        'After that you will be able to use the **Matcherino Winner Pin** yourself during that game.'
      );

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

    // first 3 with no buttons
    await message.channel.send({ embeds: [embed1, embed2, embed3] });

    const rowAll = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_swap_matcherino')
        .setLabel('Swap Matcherino')
        .setEmoji('<:winmatcherino:1298703851934711848>')
        .setStyle(ButtonStyle.Danger),
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

  /*******************************************************
   ?friendlist
  ********************************************************/
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

//////////////////////////////////////////////////////////////////////
// 7) SLASH COMMAND HANDLER FOR /list
//////////////////////////////////////////////////////////////////////
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'list') {
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({
        content: "You don't have the required role to use this command.",
        ephemeral: true
      });
    }

    // gather inputs for the main embed
    const pingChoice = interaction.options.getString('ping');
    const text       = interaction.options.getString('text');
    const price      = interaction.options.getString('price');
    const trophies   = interaction.options.getString('trophies');
    const p11        = interaction.options.getString('p11');
    const tierMax    = interaction.options.getString('tier_max');

    const mainImage = interaction.options.getAttachment('image');
    const imageUrl  = mainImage?.url;

    // gather extra info for "More Information"
    const brawlers     = interaction.options.getString('brawlers');
    const legendary    = interaction.options.getString('legendary');
    const mythic       = interaction.options.getString('mythic');
    const epic         = interaction.options.getString('epic');
    const superRare    = interaction.options.getString('super_rare');
    const rare         = interaction.options.getString('rare');
    const p9           = interaction.options.getString('p9');
    const p10          = interaction.options.getString('p10');
    const hypercharges = interaction.options.getString('hypercharges');

    const secondImage = interaction.options.getAttachment('image2');
    const image2Url   = secondImage?.url;

    // determine ping text
    let nonEmbedText;
    if (pingChoice === 'everyone') {
      nonEmbedText = '**||@everyone|| New account added!**';
    } else if (pingChoice === 'here') {
      nonEmbedText = '**||@here|| New account added!**';
    } else {
      nonEmbedText = '**New account added!**';
    }

    // build the main embed
    const mainEmbed = new EmbedBuilder()
      .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Description', value: text, inline: false },

        // Price / Trophies
        { name: 'Price', value: price, inline: true },
        { name: 'Trophies', value: trophies, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }, // blank spacer for layout

        // P11 / Tier Max
        { name: 'P11', value: p11, inline: true },
        { name: 'Tier Max', value: tierMax, inline: true },
        { name: '\u200B', value: '\u200B', inline: true } // blank spacer for layout
      );

    if (imageUrl) {
      mainEmbed.setImage(imageUrl);
    }

    // Buttons: Purchase, More Info, Mark as Sold
    const rowOfButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_account_temp')
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('listing_more_info_temp')
        .setLabel('More Information')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('listing_mark_sold_temp')
        .setLabel('Mark as Sold')
        .setStyle(ButtonStyle.Secondary)
    );

    // Acknowledge slash command
    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    // Send the listing embed to channel
    const listingMessage = await interaction.channel.send({
      content: nonEmbedText,
      embeds: [mainEmbed],
      components: [rowOfButtons]
    });

    // Store the extra info for "More Information"
    listingDataMap.set(listingMessage.id, {
      text,     // short descriptive text
      brawlers, hypercharges, p9, p10,
      rare, superRare, epic, mythic, legendary,
      image2: image2Url
    });

    // finalize custom IDs (purchase, more info, sold)
    const newPurchaseId = `purchase_account_${listingMessage.id}`;
    const newMoreId     = `listing_more_info_${listingMessage.id}`;
    const newSoldId     = `listing_mark_sold_${listingMessage.id}`;

    // Update placeholders
    const updatedRows = [];
    for (const rowComp of listingMessage.components) {
      const rowBuilder = ActionRowBuilder.from(rowComp);
      for (const comp of rowBuilder.components) {
        if (comp.customId === 'purchase_account_temp') {
          comp.setCustomId(newPurchaseId);
        } else if (comp.customId === 'listing_more_info_temp') {
          comp.setCustomId(newMoreId);
        } else if (comp.customId === 'listing_mark_sold_temp') {
          comp.setCustomId(newSoldId);
        }
      }
      updatedRows.push(rowBuilder);
    }
    await listingMessage.edit({ components: updatedRows });
  }
});

//////////////////////////////////////////////////////////////////////
// 8) BUTTON INTERACTIONS
//////////////////////////////////////////////////////////////////////
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
    text: 'LUX | Zoro is an e-sports player for the team LuxAeterna...',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352052664476762296/zoro.webp'
  },
  'Lennox': {
    title: 'Lennox Information',
    text: 'Lennox has 130k peak trophies, 48 legacy r35, and 38 prestige.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352052862766813245/lennox.webp'
  },
  'Melih': {
    title: 'Melih Information',
    text: 'Melih has 150k peak trophies, 70 legacy r35, etc.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352053558337470535/melih.webp'
  },
  'Elox': {
    title: 'Elox Information',
    text: 'Elox is an official content creator with 150k peak trophies.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352053811052544111/elox.webp'
  },
  'Kazu': {
    title: 'Kazu Information',
    text: 'Kazu is an official content creator, top 10 global trophies, etc.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055076448899072/kazu.webp'
  },
  'Izana': {
    title: 'Izana Information',
    text: 'Izana is a content creator, bea world record with 50k trophies, etc.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055480079614074/izana.webp'
  },
  'SKC | Rafiki': {
    title: 'SKC | Rafiki Information',
    text: 'Rafiki tier S NA pro, also a matcherino winner, etc.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352055818165420102/rafiki.webp'
  },
  'HMB | BosS': {
    title: 'HMB | BosS Information',
    text: 'BosS is an e-sport player for Humble, in 2024 he won the world finals.',
    image: 'https://media.discordapp.net/attachments/987753155360079903/1352056193337655356/boss.webp'
  }
};

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild, channel, user } = interaction;

  // Helper: create a modal
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

  /****************************************************
   TICKET Panel Buttons
  ****************************************************/
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
      { customId: 'which_brawler', label: 'Which brawler to boost?' }
    ]);
    return interaction.showModal(modal);
  }

  if (customId === 'ticket_other') {
    const modal = buildModal('modal_ticket_other','Other Ticket', [
      { customId: 'reason', label: 'Why are you opening this ticket?' }
    ]);
    return interaction.showModal(modal);
  }

  /****************************************************
   Purchase Account => open ticket + second embed
  ****************************************************/
  if (customId.startsWith('purchase_account_')) {
    const listingId = customId.replace('purchase_account_', '');
    const listing = listingDataMap.get(listingId);
    if (!listing) {
      return interaction.reply({
        content: 'Could not find listing data for this account.',
        ephemeral: true
      });
    }
    // create a new channel for purchase
    try {
      const channelName = `purchase-${interaction.user.username}-${Math.floor(Math.random()*1000)}`;
      const purchaseChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: PURCHASE_ACCOUNT_CATEGORY,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
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

      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');

      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );
      await purchaseChannel.send({ embeds: [welcomeEmbed], components: [closeBtnRow] });

      // second embed => mention what they're buying
      const buyEmbed = new EmbedBuilder()
        .setDescription(`**Buying account:**\n\`${listing.text}\``);
      await purchaseChannel.send({ embeds: [buyEmbed] });

      ticketOpeners.set(purchaseChannel.id, interaction.user.id);
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

  /****************************************************
   More Information => ephemeral
  ****************************************************/
  if (customId.startsWith('listing_more_info_')) {
    const listingId = customId.replace('listing_more_info_', '');
    const listing = listingDataMap.get(listingId);
    if (!listing) {
      return interaction.reply({
        content: 'No additional information found.',
        ephemeral: true
      });
    }

    // Show everything that wasn't in the main embed
    const {
      brawlers, hypercharges, p9, p10,
      rare, superRare, epic, mythic, legendary,
      image2
    } = listing;

    const descLines = [
      `**Brawlers:**\n${brawlers}`,
      `**Power 9's:**\n${p9}`,
      `**Power 10's:**\n${p10}`,
      `**Hypercharges:**\n${hypercharges}`,
      `**Rare Skins:**\n${rare}`,
      `**Super Rare Skins:**\n${superRare}`,
      `**Epic Skins:**\n${epic}`,
      `**Mythic Skins:**\n${mythic}`,
      `**Legendary Skins:**\n${legendary}`
    ];

    const embed = new EmbedBuilder()
      .setTitle('More Information')
      .setColor(EMBED_COLOR)
      .setDescription(descLines.join('\n\n'));

    if (image2) {
      embed.setImage(image2);
    }

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  /****************************************************
   Mark as Sold => edit the same message
  ****************************************************/
  if (customId.startsWith('listing_mark_sold_')) {
    const listingId = customId.replace('listing_mark_sold_', '');
    if (!listingDataMap.has(listingId)) {
      return interaction.reply({
        content: 'No data for that listing, but we can still try editing the message.',
        ephemeral: true
      });
    }
    const originalMsg = interaction.message;
    if (!originalMsg) {
      return interaction.reply({
        content: 'Could not fetch original message to edit.',
        ephemeral: true
      });
    }

    // Replace components with a single disabled "sold" button
    const soldButton = new ButtonBuilder()
      .setCustomId('sold_button')
      .setLabel('This account has been sold.')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const soldRow = new ActionRowBuilder().addComponents(soldButton);

    try {
      await originalMsg.edit({ components: [soldRow] });
      listingDataMap.delete(listingId);
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

  /****************************************************
   ?adds => 3 Buttons: Swap, 115k, Matcherino
  ****************************************************/
  if (customId === 'btn_swap_matcherino') {
    const channelName = `swap-${interaction.user.username}-${Math.floor(Math.random()*1000)}`;
    try {
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: MATCHERINO_SWAP_CATEGORY,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(r => ({
            id: r,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');

      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await newChan.send({ embeds: [welcomeEmbed], components: [closeBtnRow] });
      ticketOpeners.set(newChan.id, interaction.user.id);

      return interaction.reply({
        content: `Matcherino swap ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to create swap ticket channel.',
        ephemeral: true
      });
    }
  }

  if (customId === 'btn_add_115k') {
    let hasRole = false;
    for (const r of ADD_115K_ROLES) {
      if (member.roles.cache.has(r)) {
        hasRole = true;
        break;
      }
    }
    if (!hasRole) {
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

  if (customId === 'btn_add_matcherino_winner') {
    let haveFirstPair = hasAllRoles(member,[MATCHERINO_WINNER_ROLE_1A,MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(member,[MATCHERINO_WINNER_ROLE_2A,MATCHERINO_WINNER_ROLE_2B]);
    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - Insufficient Invites!')
        ],
        ephemeral: true
      });
    }

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

  /****************************************************
   friendlist => buyAdd, playerinfo
  ****************************************************/
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

  /****************************************************
   friendlist => buy_xxx or info_xxx
  ****************************************************/
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
    // open a ticket in the "add" category
    try {
      const addChannel = await guild.channels.create({
        name: `add-${interaction.user.username}-${Math.floor(Math.random()*1000)}`,
        type: ChannelType.GuildText,
        parent: MOVE_CATEGORIES.add,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
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

      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will be with you shortly.');

      const closeBtnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await addChannel.send({ embeds: [welcomeEmbed], components: [closeBtnRow] });

      const addEmbed = new EmbedBuilder()
        .setDescription(`**Adding Player:**\n${chosenName}`);
      await addChannel.send({ embeds: [addEmbed] });

      ticketOpeners.set(addChannel.id, interaction.user.id);

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

//////////////////////////////////////////////////////////////////////
// 9) MODAL SUBMISSIONS (Tickets + ?adds)
//////////////////////////////////////////////////////////////////////
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  const { customId } = interaction;

  // helper to create a ticket channel
  async function createTicketChannel(interaction, categoryId, answers) {
    const { guild, user } = interaction;

    // check user’s existing tickets to limit spam
    const existingTickets = guild.channels.cache.filter(ch => {
      if (ch.type === ChannelType.GuildText && ch.parentId) {
        const perm = ch.permissionOverwrites.cache.get(user.id);
        if (!perm) return false;
        const isTicketCat = Object.values(TICKET_CATEGORIES).includes(ch.parentId)
          || ch.parentId === MATCHERINO_SWAP_CATEGORY
          || ch.parentId === PURCHASE_ACCOUNT_CATEGORY
          || ch.parentId === MOVE_CATEGORIES.add;
        return isTicketCat && perm.allow.has(PermissionsBitField.Flags.ViewChannel);
      }
      return false;
    });
    if (existingTickets.size >= MAX_TICKETS_PER_USER) {
      return interaction.reply({
        content: `You already have the maximum of ${MAX_TICKETS_PER_USER} open tickets!`,
        ephemeral: true
      });
    }

    // create channel with staff + user perms
    try {
      const channelName = `ticket-${user.username}-${Math.floor(Math.random()*1000)}`;
      const newChan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
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

      const welcomeEmbed = new EmbedBuilder()
        .setDescription('Welcome, thanks for opening a ticket!\n\nSupport will respond soon.');
      
      // put Q&A answers in an embed
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

      await newChan.send({ embeds: [welcomeEmbed, qnaEmbed], components: [closeBtnRow] });
      ticketOpeners.set(newChan.id, user.id);

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
    await createTicketChannel(interaction, TICKET_CATEGORIES.TROPHIES, answers);
  }

  // Ranked
  if (customId === 'modal_ticket_ranked') {
    const currentRank = interaction.fields.getTextInputValue('current_rank');
    const desiredRank = interaction.fields.getTextInputValue('desired_rank');
    const answers = [
      ['Current rank?', currentRank],
      ['Desired rank?', desiredRank]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.RANKED, answers);
  }

  // Bulk
  if (customId === 'modal_ticket_bulk') {
    const currentTotal  = interaction.fields.getTextInputValue('current_total');
    const desiredTotal  = interaction.fields.getTextInputValue('desired_total');
    const answers = [
      ['Current total trophies?', currentTotal],
      ['Desired total trophies?', desiredTotal]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.BULK, answers);
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
    await createTicketChannel(interaction, TICKET_CATEGORIES.MASTERY, answers);
  }

  // Other
  if (customId === 'modal_ticket_other') {
    const reason = interaction.fields.getTextInputValue('reason');
    const answers = [['Reason for opening this ticket?', reason]];
    await createTicketChannel(interaction, TICKET_CATEGORIES.OTHER, answers);
  }

  // ?adds => 115k
  if (customId === 'modal_add_115k') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    let foundRole = null;
    for (const r of ADD_115K_ROLES) {
      if (interaction.member.roles.cache.has(r)) {
        foundRole = r; 
        break;
      }
    }
    if (!foundRole) {
      return interaction.reply({
        content: 'Insufficient Invites; you no longer have the required role.',
        ephemeral: true
      });
    }
    try {
      await interaction.member.roles.remove(foundRole);
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Error removing your invite role. Please contact staff.',
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
    let haveFirstPair = hasAllRoles(interaction.member,[MATCHERINO_WINNER_ROLE_1A,MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair= hasAllRoles(interaction.member,[MATCHERINO_WINNER_ROLE_2A,MATCHERINO_WINNER_ROLE_2B]);
    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder().setDescription('<:cross:1351689463453061130> - **Insufficient Invites**')
        ],
        ephemeral: true
      });
    }
    try {
      if (haveFirstPair) {
        await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_1A);
        await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_1B);
      } else {
        await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_2A);
        await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_2B);
      }
    } catch(err) {
      console.error(err);
      return interaction.reply({
        content: 'Error removing your invite roles. Please contact staff.',
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

//////////////////////////////////////////////////////////////////////
// 10) TICKET CLOSE / REOPEN / DELETE
//////////////////////////////////////////////////////////////////////
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, channel, guild, user, member } = interaction;
  // close_ticket => ephemeral confirm
  if (customId === 'close_ticket') {
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

  if (customId === 'confirm_close_ticket') {
    try {
      await channel.permissionOverwrites.set([
        {
          id: guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: '1292933924116500532', // staff role
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
    return channel.delete().catch(console.error);
  }

  if (customId === 'reopen_ticket') {
    if (!hasAnyRole(member, STAFF_ROLES)) {
      return interaction.reply({
        content: 'Only staff can re-open tickets.',
        ephemeral: true
      });
    }
    const openerId = ticketOpeners.get(channel.id);
    if (!openerId) {
      return interaction.reply({
        content: 'Could not find the user who opened this ticket.',
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

//////////////////////////////////////////////////////////////////////
// 11) LOG IN
//////////////////////////////////////////////////////////////////////
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
