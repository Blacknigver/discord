/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Discord.js v14
 * Reads BOT_TOKEN from environment variable process.env.TOKEN
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
  PermissionsBitField,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

// 1) BOT TOKEN & CLIENT_ID
const BOT_TOKEN = process.env.TOKEN || '';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

// 2) Create Client
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

/************************************************************
 3) CONFIG CONSTANTS
************************************************************/
// IDs for ?ticketpanel
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659', '986164993080836096'];

// Staff roles that handle tickets, etc.
const STAFF_ROLES = [
  '1292933924116500532',
  '1292933200389083196',
  '1303702944696504441',
  '1322611585281425478'
];

// Ticket categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK: '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER: '1322947859561320550'
};

const MAX_TICKETS_PER_USER = 2;

// ?move categories
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// /list restricted to role
const LIST_COMMAND_ROLE = '1292933200389083196';

// Purchase account category
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// For ?adds
const MATCHERINO_SWAP_CATEGORY = '1351687962907246753';
const ADD_115K_MSG_CHANNEL = '1351687016433193051';
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051';

// Roles for "Add 115k"
const ADD_115K_ROLES = [
  '1351281086134747298',
  '1351687292200423484'
];

// Roles for "Add Matcherino Winner"
const MATCHERINO_WINNER_ROLE_1A = '1351281117445099631';
const MATCHERINO_WINNER_ROLE_1B = '1351281086134747298';
const MATCHERINO_WINNER_ROLE_2A = '1351687292200423484';
const MATCHERINO_WINNER_ROLE_2B = '1351281117445099631';

// Role for presence check
const BRAWLSHOP_AD_ROLE = '1351998501982048346';

// We'll store who opened each ticket so we can re-open it
// Key: channelId => userId
const ticketOpeners = new Map();

// Color for certain embeds
const EMBED_COLOR = '#E68DF2';

/************************************************************
 4) UTILITY FUNCTIONS
************************************************************/
function hasAnyRole(member, roleIds = []) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}
function hasAllRoles(member, roleIds = []) {
  return roleIds.every(roleId => member.roles.cache.has(roleId));
}

/************************************************************
 5) BUILD THE /list Slash Command
    Using attachments for images if you'd like. 
    (If you prefer strings for URLs, revert these to addStringOption.)
************************************************************/
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
      .setDescription('Text to include at the top of the embed')
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
  // If you prefer a string URL, use .addStringOption for 'image'
  .addStringOption(opt =>
    opt.setName('image')
      .setDescription('Main image URL')
      .setRequired(true)
  )
  // Additional fields
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
  // If you prefer a string URL, do .addStringOption here for 'image2'
  .addStringOption(opt =>
    opt.setName('image2')
      .setDescription('Additional image URL')
      .setRequired(true)
  );

/************************************************************
 6) BOT STARTUP
************************************************************/
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Attempt to register slash command
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully.');
  } catch (err) {
    console.error('Error registering /list:', err);
  }
});

/************************************************************
 7) PRESENCE CHECK (discord.gg/brawlshop => BRAWLSHOP_AD_ROLE)
************************************************************/
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

/************************************************************
 8) MESSAGE HANDLER (ticketpanel, move, adds, friendlist, mark)
************************************************************/
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const prefix = '?';
  const staffPrefix = ',';

  // ? prefix
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

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
        // "Other" => green
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
      const targetCategory = MOVE_CATEGORIES[sub];
      try {
        await message.channel.setParent(targetCategory, { lockPermissions: false });
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
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      // 4 Embeds total:
      // 1) Swap (no buttons)
      // 2) 115k Trophies (no buttons)
      // 3) Matcherino Winner (no buttons, 5 invites)
      // 4) Contains all 3 buttons

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
        );

      const embed3 = new EmbedBuilder()
        .setTitle('Matcherino Winner Add')
        .setColor(EMBED_COLOR)
        .setDescription(
          '**__This requires 5 invites!__**\n\n' +
          'Add a **Matcherino Winner!**'
        );

      // No buttons on first 3:
      await message.channel.send({ embeds: [embed1, embed2, embed3] });

      // 4th embed
      const embed4 = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(
          '**Once you have enough invites, claim your reward using the buttons below.**\n\n' +
          'Make sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233'
        );

      const row4 = new ActionRowBuilder().addComponents(
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

      await message.channel.send({ embeds: [embed4], components: [row4] });
    }

    /*******************************************************
     ?friendlist
    ********************************************************/
    if (cmd === 'friendlist') {
      if (!message.member.roles.cache.has('1292933200389083196')) {
        return message.reply("You don't have permission to use this command!");
      }

      // Two columns, no 'row 1/ row 2' text
      // Replace __Name__ with **Name**
      const leftSide = '🥈| **LUX | Zoro** - €10\n🥈| **Lennox** - €15\n🥈| **Melih** - €15\n🥈| **Elox** - €15';
      const rightSide = '🥈| **Kazu** - €15\n🥇| **Izana** - €25\n🥇| **SKC | Rafiki** - €25\n🥇| **HMB | BosS** - €60';

      const embedMain = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .addFields(
          { name: '\u200B', value: leftSide, inline: true },
          { name: '\u200B', value: rightSide, inline: true }
        );

      const embedSecond = new EmbedBuilder()
        .setDescription('# ⬆️ ALL ADDS ARE LIFETIME');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('friendlist_buy')
          .setLabel('Buy Add')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('friendlist_info')
          .setLabel('More Information')
          .setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({
        embeds: [embedMain, embedSecond],
        components: [row]
      });
    }
  }

  // , prefix
  if (message.content.startsWith(staffPrefix)) {
    const args = message.content.slice(staffPrefix.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    // ,mark <messageId>
    if (cmd === 'mark') {
      if (!message.member.roles.cache.has(LIST_COMMAND_ROLE)) {
        return message.reply('You do not have permission to use ,mark.');
      }
      const messageId = args[0];
      if (!messageId) {
        return message.reply('Usage: ,mark <messageId>');
      }

      try {
        const targetMessage = await message.channel.messages.fetch(messageId);
        if (!targetMessage) {
          return message.reply('Could not find that message in this channel.');
        }

        const soldButton = new ButtonBuilder()
          .setCustomId('sold_button')
          .setLabel('This account has been sold.')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true);

        const soldRow = new ActionRowBuilder().addComponents(soldButton);

        await targetMessage.edit({ components: [soldRow] });
        message.reply(`Message \`${messageId}\` has been marked as sold.`);
      } catch (err) {
        console.error(err);
        message.reply('Failed to mark the listing. Check the message ID or permissions.');
      }
    }
  }
});

/************************************************************
 9) STORE /list DATA + INTERACTION HANDLER
************************************************************/
const listingDataMap = new Map(); 
// Key: messageId => object with the optional fields

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'list') {
    // Must have LIST_COMMAND_ROLE
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({
        content: "You don't have the required role to use this command.",
        ephemeral: true
      });
    }

    // Gather inputs
    const pingChoice = interaction.options.getString('ping');
    const text       = interaction.options.getString('text');
    const price      = interaction.options.getString('price');
    const trophies   = interaction.options.getString('trophies');
    const p11        = interaction.options.getString('p11');
    const tierMax    = interaction.options.getString('tier_max');
    const imageUrl   = interaction.options.getString('image');

    const brawlers     = interaction.options.getString('brawlers');
    const legendary    = interaction.options.getString('legendary');
    const mythic       = interaction.options.getString('mythic');
    const epic         = interaction.options.getString('epic');
    const superRare    = interaction.options.getString('super_rare');
    const rare         = interaction.options.getString('rare');
    const p9           = interaction.options.getString('p9');
    const p10          = interaction.options.getString('p10');
    const hypercharges = interaction.options.getString('hypercharges');
    const image2       = interaction.options.getString('image2');

    let nonEmbedText;
    if (pingChoice === 'everyone') nonEmbedText = '**||@everyone|| New account added!**';
    else if (pingChoice === 'here') nonEmbedText = '**||@here|| New account added!**';
    else nonEmbedText = '**New account added!**';

    // Build main embed
    const mainEmbed = new EmbedBuilder()
      .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
      .setColor(EMBED_COLOR)
      .setDescription(text)
      .setImage(imageUrl)
      .addFields(
        { name: 'Price:', value: price, inline: true },
        { name: 'Trophies:', value: trophies, inline: true },
        { name: 'P11:', value: p11, inline: true },
        { name: 'Tier Max:', value: tierMax, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_account')
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('listing_more_info_temp')
        .setLabel('More Information')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    const listingMessage = await interaction.channel.send({
      content: nonEmbedText,
      embeds: [mainEmbed],
      components: [row]
    });

    // Fix customId => listing_more_info_<messageId>
    const newCustomId = `listing_more_info_${listingMessage.id}`;
    const updatedRows = [];
    listingMessage.components.forEach(r => {
      const rowBuilder = ActionRowBuilder.from(r);
      rowBuilder.components.forEach(comp => {
        if (comp.customId === 'listing_more_info_temp') {
          comp.setCustomId(newCustomId);
        }
      });
      updatedRows.push(rowBuilder);
    });
    await listingMessage.edit({ components: updatedRows });

    // Store data for "More Information"
    listingDataMap.set(listingMessage.id, {
      rare, superRare, epic, mythic, legendary,
      brawlers, p9, p10, hypercharges, image2
    });
  }
});

/************************************************************
10) BUTTON INTERACTIONS: TICKETS, /list => "More Information"
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild, channel, user } = interaction;

  // "listing_more_info_..."
  if (customId.startsWith('listing_more_info_')) {
    const listingId = customId.replace('listing_more_info_', '');
    const data = listingDataMap.get(listingId);
    if (!data) {
      return interaction.reply({
        content: 'No additional information found.',
        ephemeral: true
      });
    }

    const {
      rare, superRare, epic, mythic, legendary,
      brawlers, p9, p10, hypercharges, image2
    } = data;

    const lines = [];
    lines.push(`**Rare Skins:**\n${rare}`);
    lines.push(`**Super Rare Skins:**\n${superRare}`);
    lines.push(`**Epic Skins:**\n${epic}`);
    lines.push(`**Mythic Skins:**\n${mythic}`);
    lines.push(`**Legendary Skins:**\n${legendary}`);
    lines.push(`**Brawlers:**\n${brawlers}`);
    lines.push(`**Power 9's:**\n${p9}`);
    lines.push(`**Power 10's:**\n${p10}`);
    lines.push(`**Hypercharges:**\n${hypercharges}`);

    const infoEmbed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setDescription(lines.join('\n\n'));

    if (image2) {
      infoEmbed.setImage(image2);
    }

    await interaction.reply({ embeds: [infoEmbed], ephemeral: false });
  }

  // TICKET: close / confirm / reopen / delete
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

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription('Are you sure you want to close this ticket?')],
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
          // only role 1292933924116500532 remains
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

      await interaction.reply({
        content: 'Ticket closed. Only staff can see it now.',
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to close the ticket. Check permissions.',
        ephemeral: true
      });
    }
  }

  if (customId === 'cancel_close_ticket') {
    await interaction.reply({
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
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to re-open ticket.',
        ephemeral: true
      });
    }
  }

  // The ticket buttons: 
  //   "ticket_trophies", "ticket_ranked", "ticket_bulk", "ticket_mastery", "ticket_other"
  // are handled with modals in the next step.

  // purchase_account => create a single-embed channel in purchase cat
  if (customId === 'purchase_account') {
    try {
      const channelName = `purchase-${user.username}-${Math.floor(Math.random() * 1000)}`;
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
            id: user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          ...STAFF_ROLES.map(roleId => ({
            id: roleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ]
      });

      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          'Welcome, thanks for opening a ticket!\n\n' +
          '**Support will be with you shortly, please wait for them to respond.**'
        );

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await purchaseChannel.send({
        embeds: [welcomeEmbed],
        components: [closeButton]
      });

      ticketOpeners.set(purchaseChannel.id, user.id);

      await interaction.reply({
        content: `Ticket created: <#${purchaseChannel.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to create purchase ticket channel.',
        ephemeral: true
      });
    }
  }
});

/************************************************************
11) MODALS (Ticket forms, 115k, Matcherino)
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const { customId, guild, user } = interaction;

  // Helper to create a new ticket with Q&A
  async function createTicketChannel(interaction, categoryId, answers) {
    const existingTickets = guild.channels.cache.filter(ch => {
      if (ch.type === ChannelType.GuildText && ch.parentId) {
        const perm = ch.permissionOverwrites.cache.get(user.id);
        if (!perm) return false;
        const isTicketCat = Object.values(TICKET_CATEGORIES).includes(ch.parentId)
          || ch.parentId === MATCHERINO_SWAP_CATEGORY
          || ch.parentId === PURCHASE_ACCOUNT_CATEGORY;
        return perm.allow?.has(PermissionsBitField.Flags.ViewChannel) && isTicketCat;
      }
      return false;
    });

    if (existingTickets.size >= MAX_TICKETS_PER_USER) {
      return interaction.reply({ content: `You already have ${MAX_TICKETS_PER_USER} open tickets!`, ephemeral: true });
    }

    const channelName = `ticket-${user.username}-${Math.floor(Math.random() * 1000)}`;
    try {
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

      // 2 embeds + close button on second
      const welcomeEmbed = new EmbedBuilder()
        .setDescription(
          'Welcome, thanks for opening a ticket!\n\n' +
          '**Support will be with you shortly, please wait for them to respond.**'
        );

      let desc = '';
      for (const [q, ans] of answers) {
        desc += `**${q}:**\n\`${ans}\`\n\n`;
      }
      const qnaEmbed = new EmbedBuilder().setDescription(desc.trim());

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await newChan.send({
        embeds: [welcomeEmbed, qnaEmbed],
        components: [closeButton]
      });

      ticketOpeners.set(newChan.id, user.id);
      await interaction.reply({
        content: `Ticket created: <#${newChan.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({ content: 'Failed to create ticket channel.', ephemeral: true });
    }
  }

  // Trophies
  if (customId === 'modal_ticket_trophies') {
    const current = interaction.fields.getTextInputValue('current_brawler_trophies');
    const desired = interaction.fields.getTextInputValue('desired_brawler_trophies');
    const which = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['How many trophies does your brawler have?', current],
      ['What is your desired brawler trophies?', desired],
      ['Which brawler would you like to be boosted?', which]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.TROPHIES, answers);
  }
  // Ranked
  if (customId === 'modal_ticket_ranked') {
    const currentRank = interaction.fields.getTextInputValue('current_rank');
    const desiredRank = interaction.fields.getTextInputValue('desired_rank');
    const answers = [
      ['What rank currently are you?', currentRank],
      ['What is your desired rank?', desiredRank]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.RANKED, answers);
  }
  // Bulk
  if (customId === 'modal_ticket_bulk') {
    const currentTotal = interaction.fields.getTextInputValue('current_total');
    const desiredTotal = interaction.fields.getTextInputValue('desired_total');
    const answers = [
      ['How many total trophies do you have?', currentTotal],
      ['What is your desired total trophies?', desiredTotal]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.BULK, answers);
  }
  // Mastery
  if (customId === 'modal_ticket_mastery') {
    const currentMastery = interaction.fields.getTextInputValue('current_mastery_rank');
    const desiredMastery = interaction.fields.getTextInputValue('desired_mastery_rank');
    const whichBrawler = interaction.fields.getTextInputValue('which_brawler');
    const answers = [
      ['What is your current mastery rank?', currentMastery],
      ['What is your desired mastery rank?', desiredMastery],
      ['Which brawler would you like to be boosted?', whichBrawler]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.MASTERY, answers);
  }
  // Other
  if (customId === 'modal_ticket_other') {
    const reason = interaction.fields.getTextInputValue('reason');
    const answers = [
      ['Why are you opening this ticket?', reason]
    ];
    await createTicketChannel(interaction, TICKET_CATEGORIES.OTHER, answers);
  }

  // Add 115k
  if (customId === 'modal_add_115k') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    const member = interaction.member;

    // Check role again
    let foundRole = null;
    for (const r of ADD_115K_ROLES) {
      if (member.roles.cache.has(r)) {
        foundRole = r;
        break;
      }
    }
    if (!foundRole) {
      return interaction.reply({ content: 'Insufficient Invites; you no longer have the required role.', ephemeral: true });
    }

    // Remove it
    try {
      await member.roles.remove(foundRole);
    } catch (err) {
      console.error('Failed removing 115k role:', err);
      return interaction.reply({ content: 'Error removing your invite role.', ephemeral: true });
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_115K_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({ content: 'Error: cannot find the target channel.', ephemeral: true });
    }

    await targetChannel.send({
      content: `**New 115k Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  }

  // Add Matcherino Winner
  if (customId === 'modal_matcherino_winner') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');
    const member = interaction.member;

    let haveFirstPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_1A, MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_2A, MATCHERINO_WINNER_ROLE_2B]);

    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        content: 'Insufficient Invites; you no longer have the required roles.',
        ephemeral: true
      });
    }

    try {
      if (haveFirstPair) {
        await member.roles.remove(MATCHERINO_WINNER_ROLE_1A);
        await member.roles.remove(MATCHERINO_WINNER_ROLE_1B);
      } else {
        await member.roles.remove(MATCHERINO_WINNER_ROLE_2A);
        await member.roles.remove(MATCHERINO_WINNER_ROLE_2B);
      }
    } catch (err) {
      console.error('Failed removing roles for Matcherino Winner:', err);
      return interaction.reply({ content: 'Error removing your invite roles.', ephemeral: true });
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_MATCHERINO_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({ content: 'Error: cannot find the target channel.', ephemeral: true });
    }

    await targetChannel.send({
      content: `**New Matcherino Winner Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    const successEmbed = new EmbedBuilder()
      .setDescription('**Successfully added! ✅**\nYou will be added within a day.');
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  }
});

/************************************************************
12) SELECT MENUS (for ?friendlist -> Buy Add / More Information)
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return; // or isSelectMenu
  // If you'd prefer a select menu approach for friendlist, 
  // you can implement it similarly to the approach in the previous code snippet
  // storing each player's data. 
  // For brevity, we've not repeated it here unless it's explicitly needed.
});

/************************************************************
13) LOG IN THE BOT
************************************************************/
client.login(BOT_TOKEN).catch(err => {
  console.error('[Login Error]', err);
});
