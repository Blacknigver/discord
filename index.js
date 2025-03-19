/********************************************************************
 * Brawl Stars Boosting Discord Bot
 * Using Discord.js v14
 * Incorporates updated /list command and ,mark command
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
require('dotenv').config();

/************************************************************
 1) BOT SETUP
************************************************************/
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel]
});

// Replace these with your own IDs / environment variable
const BOT_TOKEN = process.env.TOKEN; // Put your bot token in Railway env vars
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_BOT_CLIENT_ID_HERE';

/************************************************************
 2) CONFIGURATION CONSTANTS
************************************************************/
// === IDs of the two people who can use ?ticketpanel
const TICKET_PANEL_ALLOWED_USERS = ['658351335967686659', '986164993080836096'];

// === Roles that have "staff" perms for tickets & ?move command
const STAFF_ROLES = [
  '1292933924116500532', // staff role 1
  '1292933200389083196', // staff role 2
  '1303702944696504441', // staff role 3
  '1322611585281425478'  // staff role 4
];

// === Ticket categories
const TICKET_CATEGORIES = {
  TROPHIES: '1322947795803574343',
  RANKED: '1322913302921089094',
  BULK: '1351659422484791306',
  MASTERY: '1351659903621791805',
  OTHER: '1322947859561320550'
};

// === Ticket limit per user
const MAX_TICKETS_PER_USER = 2;

// === ?move category IDs
const MOVE_CATEGORIES = {
  paid: '1347969048553586822',
  add: '1347969216052985876',
  sell: '1347969305165303848',
  finished: '1347969418898051164'
};

// === /list command: can ONLY be used by role 1292933200389083196
const LIST_COMMAND_ROLE = '1292933200389083196';

// === /list command: new ticket category for "Purchase Account" button
const PURCHASE_ACCOUNT_CATEGORY = '1347969247317327933';

// === ?adds command: categories/IDs for the adds
const MATCHERINO_SWAP_CATEGORY = '1351687962907246753';
const ADD_115K_MSG_CHANNEL = '1351687016433193051'; // channel to post "New 115k Add"
const ADD_MATCHERINO_MSG_CHANNEL = '1351687016433193051'; // channel to post "New Matcherino Winner Add"

// === Roles for the "Add 115k" button (check in order)
const ADD_115K_ROLES = [
  '1351281086134747298',
  '1351687292200423484'
];

// === Roles for "Add Matcherino Winner" button
const MATCHERINO_WINNER_ROLE_1A = '1351281117445099631';
const MATCHERINO_WINNER_ROLE_1B = '1351281086134747298';
const MATCHERINO_WINNER_ROLE_2A = '1351687292200423484';
const MATCHERINO_WINNER_ROLE_2B = '1351281117445099631';

/************************************************************
 3) UTILITY FUNCTIONS
************************************************************/
function hasAnyRole(member, roleIds=[]) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function hasAllRoles(member, roleIds=[]) {
  return roleIds.every(roleId => member.roles.cache.has(roleId));
}

/************************************************************
 4) TRACK LISTINGS
    We'll store listing data so we can show "More Information."
************************************************************/
const listingDataMap = new Map(); 
// Key: messageId of the listing
// Value: object with the optional fields, e.g. { rare:'some text', superRare:'some text', ...}

/************************************************************
 5) BUILD & REGISTER SLASH COMMAND (/list)
************************************************************/
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (Restricted).')

// Required fields
  .addStringOption(option =>
    option.setName('ping')
      .setDescription('Who do you want to ping?')
      .setRequired(true)
      .addChoices(
        { name: 'Everyone', value: 'everyone' },
        { name: 'Here', value: 'here' },
        { name: 'None', value: 'none' }
      )
  )
  .addStringOption(option =>
    option.setName('text')
      .setDescription('Text to include at the top of the embed')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('price')
      .setDescription('Price of the account')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('trophies')
      .setDescription('Trophies value')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('p11')
      .setDescription('Power 11 info')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('tier_max')
      .setDescription('Tier Max info')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('image')
      .setDescription('Image URL to display')
      .setRequired(true)
  )

// New optional fields
  .addStringOption(option =>
    option.setName('brawlers')
      .setDescription('Brawlers info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('legendary')
      .setDescription('Legendary Skins info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('mythic')
      .setDescription('Mythic Skins info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('epic')
      .setDescription('Epic Skins info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('super_rare')
      .setDescription('Super Rare Skins info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('rare')
      .setDescription('Rare Skins info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('p9')
      .setDescription('Power 9 info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('p10')
      .setDescription('Power 10 info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('hypercharges')
      .setDescription('Hypercharges info (optional)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('image2')
      .setDescription('Additional image URL (optional)')
      .setRequired(false)
  );

/************************************************************
 6) BOT STARTUP
************************************************************/
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register slash command globally (may take up to 1h to appear).
  // For immediate tests, register as a guild command in a specific server if you prefer.
  try {
    await client.application.commands.create(listCommand);
    console.log('[Slash Command] /list registered successfully.');
  } catch (err) {
    console.error('Error registering /list command:', err);
  }
});

/************************************************************
 7) MESSAGE HANDLER FOR PREFIX COMMANDS 
    (ticketpanel, move, adds, and the new ,mark command)
************************************************************/
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const prefix = '?';
  const staffPrefix = ','; // For the new ,mark command

  // Check if message starts with ?
  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();

    /*******************************************************
     ?ticketpanel command
     *******************************************************/
    if (cmd === 'ticketpanel') {
      // Only allow if user ID is in TICKET_PANEL_ALLOWED_USERS
      if (!TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
        return message.reply("You don't have permission to use this command!");
      }

      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('Order a Boost')
        .setDescription('Looking to Purchase a Boost? Please select what kind of boost you want below.');

      // Build the 5 buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_trophies')
          .setLabel('Trophies')
          .setEmoji('<:trophy:1301901071471345664>')
          .setStyle(ButtonStyle.Danger), // red
        new ButtonBuilder()
          .setCustomId('ticket_ranked')
          .setLabel('Ranked')
          .setEmoji('<:Masters:1293283897618075728>')
          .setStyle(ButtonStyle.Primary), // blue
        new ButtonBuilder()
          .setCustomId('ticket_bulk')
          .setLabel('Bulk Trophies')
          .setEmoji('<:gold_trophy:1351658932434768025>')
          .setStyle(ButtonStyle.Primary) // blue
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_mastery')
          .setLabel('Mastery')
          .setEmoji('<:mastery:1351659726991134832>')
          .setStyle(ButtonStyle.Success), // green
        new ButtonBuilder()
          .setCustomId('ticket_other')
          .setLabel('Other')
          .setEmoji('<:winmatcherino:1298703851934711848>')
          .setStyle(ButtonStyle.Secondary) // grey
      );

      await message.channel.send({ embeds: [embed], components: [row, row2] });
      await message.reply('Ticket panel created!');
    }

    /*******************************************************
     ?move command
     *******************************************************/
    if (cmd === 'move') {
      // Check if user has staff roles
      if (!hasAnyRole(message.member, STAFF_ROLES)) {
        return message.reply("You don't have permission to use this command!");
      }

      const sub = args[0];
      if (!sub || !MOVE_CATEGORIES[sub]) {
        return message.reply(`Invalid syntax. Usage: ?move [paid|add|sell|finished]`);
      }
      const targetCategoryId = MOVE_CATEGORIES[sub];

      // move the current channel
      try {
        await message.channel.setParent(targetCategoryId, { lockPermissions: false });
        await message.reply(`Channel moved to category: ${sub}`);
      } catch (err) {
        console.error(err);
        message.reply('Could not move the channel. Check my permissions or the category ID.');
      }
    }

    /*******************************************************
     ?adds command
     *******************************************************/
    if (cmd === 'adds') {
      // No role restriction mentioned, so we allow all. 
      // If needed, add "if(!hasAnyRole(message.member, STAFF_ROLES)) return ..."

      const embed1 = new EmbedBuilder()
        .setTitle('Matcherino Swap')
        .setDescription(
          '**__This requires 2 invites!__**\n' +
          'Swap pins with a Matcherino Winner in a friendly game.\n\n' +
          'After that you will be able to use the **Matcherino Winner Pin** yourself during that game.'
        );

      const embed2 = new EmbedBuilder()
        .setTitle('115k <:Trophee:354331048244674560> & 71 R35 Add')
        .setDescription(
          '**__This requires 3 invites!__**\n' +
          'Add a 115k Trophy and 71 legacy R35 Player.'
        )
        .setImage('https://media.discordapp.net/attachments/987753155360079903/1351685459666931803/IMG_2300.png?ex=67db46ae&is=67d9f52e&hm=cae532a6e600892696d095741f299b3a6d3bd3afa8df9194cd04427a700825d8&=&format=webp&quality=lossless&width=550&height=254');

      const embed3 = new EmbedBuilder()
        .setTitle('Matcherino Winner Add')
        .setDescription(
          '**__This requires 3 invites!__**\n' +
          'Add a **Matcherino Winner!**'
        );

      const embed4 = new EmbedBuilder()
        .setDescription(
          '**Whenever you have enough invites, claim your reward using the buttons below!**\n\n' +
          'Make sure to follow https://discord.com/channels/1292895164595175444/1293243690185265233'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_swap_matcherino')
          .setLabel('Swap Matcherino')
          .setEmoji('<:winmatcherino:1298703851934711848>')
          .setStyle(ButtonStyle.Danger), // red
        new ButtonBuilder()
          .setCustomId('btn_add_115k')
          .setLabel('Add 115k')
          .setEmoji('<:gold_trophy:1351658932434768025>')
          .setStyle(ButtonStyle.Primary), // blue
        new ButtonBuilder()
          .setCustomId('btn_add_matcherino_winner')
          .setLabel('Add Matcherino Winner')
          .setEmoji('<:pro:1351687685328208003>')
          .setStyle(ButtonStyle.Success) // green
      );

      await message.channel.send({
        embeds: [embed1, embed2, embed3, embed4],
        components: [row]
      });
    }
  }

  // Check if message starts with , (the staffPrefix) for ,mark
  if (message.content.startsWith(staffPrefix)) {
    const args = message.content.slice(staffPrefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();

    /*******************************************************
     ,mark <messageId> command
     Removes buttons & marks as sold
     *******************************************************/
    if (cmd === 'mark') {
      // Must have role 1292933200389083196
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

        // Build a single row with a disabled "This account has been sold." button
        const soldButton = new ButtonBuilder()
          .setCustomId('sold_button')
          .setLabel('This account has been sold.')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true);
        const soldRow = new ActionRowBuilder().addComponents(soldButton);

        await targetMessage.edit({
          components: [soldRow]
        });

        message.reply(`Message \`${messageId}\` has been marked as sold.`);
      } catch (err) {
        console.error(err);
        message.reply('Failed to mark the listing. Check the message ID or my permissions.');
      }
    }
  }
});

/************************************************************
 8) SLASH COMMAND INTERACTION HANDLER (/list)
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'list') {
    // Check if user has the correct role
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({
        content: "You don't have the required role to use this command.",
        ephemeral: true
      });
    }

    // Gather inputs
    const pingChoice = interaction.options.getString('ping'); 
    const text = interaction.options.getString('text');
    const price = interaction.options.getString('price');
    const trophies = interaction.options.getString('trophies');
    const p11 = interaction.options.getString('p11');
    const tierMax = interaction.options.getString('tier_max');
    const imageUrl = interaction.options.getString('image');

    // Optional fields
    const brawlers      = interaction.options.getString('brawlers') || '';
    const legendary     = interaction.options.getString('legendary') || '';
    const mythic        = interaction.options.getString('mythic') || '';
    const epic          = interaction.options.getString('epic') || '';
    const superRare     = interaction.options.getString('super_rare') || '';
    const rare          = interaction.options.getString('rare') || '';
    const p9            = interaction.options.getString('p9') || '';
    const p10           = interaction.options.getString('p10') || '';
    const hypercharges  = interaction.options.getString('hypercharges') || '';
    const image2        = interaction.options.getString('image2') || '';

    // Determine non-embed text based on pingChoice
    let nonEmbedText = '';
    if (pingChoice === 'everyone') {
      nonEmbedText = '**||@everyone|| New account added!**';
    } else if (pingChoice === 'here') {
      nonEmbedText = '**||@here|| New account added!**';
    } else {
      nonEmbedText = '**New account added!**';
    }

    // Build main embed (color #E68DF2)
    const mainEmbed = new EmbedBuilder()
      .setTitle('New Account Added! <:winmatcherino:1298703851934711848>')
      .setColor('#E68DF2')
      .setDescription(text)
      .setImage(imageUrl)
      .addFields(
        { name: '<:Money:1351665747641766022> Price:', value: price, inline: true },
        { name: '<:gold_trophy:1351658932434768025> Trophies:', value: trophies, inline: true },
        { name: '<:P11:1351683038127591529> P11:', value: p11, inline: true },
        { name: '<:tiermax:1301899953320497243> Tier Max:', value: tierMax, inline: true }
      );

    // We always add the "Purchase Account" button
    // We'll only add "More Information" if at least one optional field was filled
    const buttonsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('purchase_account')
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success)
    );

    // Check if user filled ANY optional field 
    const anyOptionalFilled = (
      brawlers      !== '' ||
      legendary     !== '' ||
      mythic        !== '' ||
      epic          !== '' ||
      superRare     !== '' ||
      rare          !== '' ||
      p9            !== '' ||
      p10           !== '' ||
      hypercharges  !== '' ||
      image2        !== ''
    );
    
    if (anyOptionalFilled) {
      // Add the "More Information" button
      // We'll store all optional fields in a map for retrieval
      // We'll fill the map AFTER we send the message, because we need the messageId
      // But we can create a placeholder customId referencing "listing_more_info".
      buttonsRow.addComponents(
        new ButtonBuilder()
          .setCustomId('listing_more_info_temp') // We'll rename after sending
          .setLabel('More Information')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    // A) We respond to the slash command ephemerally (so no one sees "X used /list")
    // B) Then we post the listing as a separate public message
    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    // Now send the listing in the same channel
    const listingMessage = await interaction.channel.send({
      content: nonEmbedText,
      embeds: [mainEmbed],
      components: [buttonsRow]
    });

    // If user filled any optional field, store them in listingDataMap
    // Also fix the customId with the actual message ID
    if (anyOptionalFilled) {
      // Generate a customId with the message id
      const newComponents = [];
      listingMessage.components.forEach(row => {
        const rowBuilder = ActionRowBuilder.from(row);
        rowBuilder.components.forEach(component => {
          if (component.customId === 'listing_more_info_temp') {
            component.setCustomId(`listing_more_info_${listingMessage.id}`);
          }
        });
        newComponents.push(rowBuilder);
      });

      // Edit the message with updated button
      await listingMessage.edit({ components: newComponents });

      // Store data
      listingDataMap.set(listingMessage.id, {
        rare, superRare, epic, mythic, legendary,
        brawlers, p9, p10, hypercharges, image2
      });
    }
  }
});

/************************************************************
 9) BUTTON & MODAL INTERACTION HANDLER
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, member, guild, channel } = interaction;

  /****************************************************
   TICKET BUTTONS from ?ticketpanel
  ****************************************************/
  if (customId.startsWith('ticket_')) {
    // 1) Check how many tickets the user has
    const existingTickets = guild.channels.cache.filter(ch => {
      if (ch.type === ChannelType.GuildText && ch.parentId) {
        const perm = ch.permissionOverwrites.cache.get(member.id);
        if (!perm) return false;
        const isTicketCat = Object.values(TICKET_CATEGORIES).includes(ch.parentId);
        return perm.allow?.has(PermissionsBitField.Flags.ViewChannel) && isTicketCat;
      }
      return false;
    });

    if (existingTickets.size >= MAX_TICKETS_PER_USER) {
      return interaction.reply({
        content: `You already have the maximum of ${MAX_TICKETS_PER_USER} open tickets!`,
        ephemeral: true
      });
    }

    // 2) Determine category
    let targetCat = null;
    switch(customId) {
      case 'ticket_trophies': targetCat = TICKET_CATEGORIES.TROPHIES; break;
      case 'ticket_ranked':   targetCat = TICKET_CATEGORIES.RANKED;   break;
      case 'ticket_bulk':     targetCat = TICKET_CATEGORIES.BULK;     break;
      case 'ticket_mastery':  targetCat = TICKET_CATEGORIES.MASTERY;  break;
      case 'ticket_other':    targetCat = TICKET_CATEGORIES.OTHER;    break;
    }

    // 3) Create the channel
    const channelName = `ticket-${member.user.username}-${Math.floor(Math.random() * 1000)}`;
    try {
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: targetCat,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
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

      // 4) Reply ephemeral
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Your ticket has been created!')
            .setDescription(`Please head over to <#${ticketChannel.id}>`)
        ],
        ephemeral: true
      });

      // 5) In ticket channel, send a "welcome" embed + close button
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('Welcome')
        .setDescription('Thanks for opening a ticket!\n\nSupport will be with you shortly, please wait for them to respond.');

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('<:Lock:1349157009244557384>')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `<@${member.id}>`,
        embeds: [welcomeEmbed],
        components: [closeButton]
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: 'Failed to create ticket channel. Check my permissions.',
        ephemeral: true
      });
    }
  }

  /****************************************************
   CLOSE TICKET BUTTON
  ****************************************************/
  if (customId === 'close_ticket') {
    // Double confirmation
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
      embeds: [
        new EmbedBuilder().setDescription('Are you sure you want to close this ticket?')
      ],
      components: [confirmRow],
      ephemeral: true
    });
  }

  if (customId === 'confirm_close_ticket') {
    // The user confirmed
    try {
      await channel.permissionOverwrites.set([
        {
          id: channel.guild.roles.everyone,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: '1292933924116500532', // The role that remains
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]);
      await interaction.reply({
        content: 'This ticket has been closed. Only staff can view it now.',
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
    interaction.reply({
      content: 'Ticket close canceled.',
      ephemeral: true
    });
  }

  /****************************************************
   /list -> "Purchase Account" & "More Information" Buttons
  ****************************************************/
  if (customId === 'purchase_account') {
    // Create a ticket in the purchase account category
    try {
      const channelName = `purchase-${interaction.user.username}-${Math.floor(Math.random() * 1000)}`;
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

  if (customId.startsWith('listing_more_info_')) {
    // Show the optional info in a new embed
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

    // Build the lines. If empty, skip them.
    let descLines = [];
    if (rare) descLines.push(`**<:rare:1351963849322004521> Rare Skins:**\n${rare}`);
    if (superRare) descLines.push(`**<:super_rare:1351963921967218839> Super Rare Skins:**\n${superRare}`);
    if (epic) descLines.push(`**<:epic:1351963993442353365> Epic Skins:**\n${epic}`);
    if (mythic) descLines.push(`**<:mythic:1351964047179907235> Mythic Skins:**\n${mythic}`);
    if (legendary) descLines.push(`**<:legendary:1351964089454428261> Legendary Skins:**\n${legendary}`);
    if (brawlers) descLines.push(`**<:brawler:1351965712582705152> Brawlers:**\n${brawlers}`);
    if (p9) descLines.push(`**<:power_9:1351963484207841331> Power 9's:**\n${p9}`);
    if (p10) descLines.push(`**<:p10:1351981538740404355> Power 10's:**\n${p10}`);
    if (hypercharges) descLines.push(`**<:hypercharge:1351963655234650143> Hypercharges:**\n${hypercharges}`);

    if (descLines.length === 0) {
      return interaction.reply({ 
        content: 'No additional information is available.', 
        ephemeral: true 
      });
    }

    const infoEmbed = new EmbedBuilder()
      .setColor('#E68DF2')
      .setDescription(descLines.join('\n\n')); // double newline between sections

    if (image2) {
      infoEmbed.setImage(image2);
    }

    // Send ephemeral so only the user sees it, or do you want it public?
    // The requirement doesn't say ephemeral or not. We'll do ephemeral = false so everyone can see it.
    await interaction.reply({ embeds: [infoEmbed], ephemeral: false });
  }

  /****************************************************
   ?adds -> 3 Buttons: Swap Matcherino, Add 115k, Add Matcherino Winner
  ****************************************************/
  if (customId === 'btn_swap_matcherino') {
    const channelName = `swap-${interaction.user.username}-${Math.floor(Math.random() * 1000)}`;
    try {
      const swapChannel = await guild.channels.create({
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

      await interaction.reply({
        content: `Matcherino swap ticket created: <#${swapChannel.id}>`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      interaction.reply({
        content: 'Failed to create swap ticket channel.',
        ephemeral: true
      });
    }
  }

  if (customId === 'btn_add_115k') {
    let roleToRemove = null;
    if (member.roles.cache.has(ADD_115K_ROLES[0])) {
      roleToRemove = ADD_115K_ROLES[0];
    } else if (member.roles.cache.has(ADD_115K_ROLES[1])) {
      roleToRemove = ADD_115K_ROLES[1];
    }

    if (!roleToRemove) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:cross:1351689463453061130> - **Insufficient Invites**, please come back when you have enough invites!')
        ],
        ephemeral: true
      });
    }

    // Show a modal
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

    await interaction.showModal(modal);
  }

  if (customId === 'btn_add_matcherino_winner') {
    let haveFirstPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_1A, MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(member, [MATCHERINO_WINNER_ROLE_2A, MATCHERINO_WINNER_ROLE_2B]);

    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:cross:1351689463453061130> - **Insufficient Invites**, please come back when you have enough invites!')
        ],
        ephemeral: true
      });
    }

    // Show modal
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

    await interaction.showModal(modal);
  }
});

/************************************************************
10) MODAL SUBMISSIONS (Supercell ID forms)
************************************************************/
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const { customId } = interaction;

  if (customId === 'modal_add_115k') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');

    let roleToRemove = null;
    if (interaction.member.roles.cache.has(ADD_115K_ROLES[0])) {
      roleToRemove = ADD_115K_ROLES[0];
    } else if (interaction.member.roles.cache.has(ADD_115K_ROLES[1])) {
      roleToRemove = ADD_115K_ROLES[1];
    }

    if (!roleToRemove) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:cross:1351689463453061130> - **Insufficient Invites**')
        ],
        ephemeral: true
      });
    }

    await interaction.member.roles.remove(roleToRemove).catch(console.error);

    const targetChannel = interaction.guild.channels.cache.get(ADD_115K_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }

    await targetChannel.send({
      content: `**New 115k Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    await interaction.reply({
      content: 'Successfully added 115k. Your role has been removed and the info posted!',
      ephemeral: true
    });
  }

  if (customId === 'modal_matcherino_winner') {
    const supercellId = interaction.fields.getTextInputValue('supercell_id_input');

    let haveFirstPair = hasAllRoles(interaction.member, [MATCHERINO_WINNER_ROLE_1A, MATCHERINO_WINNER_ROLE_1B]);
    let haveSecondPair = hasAllRoles(interaction.member, [MATCHERINO_WINNER_ROLE_2A, MATCHERINO_WINNER_ROLE_2B]);

    if (!haveFirstPair && !haveSecondPair) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('<:cross:1351689463453061130> - **Insufficient Invites**')
        ],
        ephemeral: true
      });
    }

    if (haveFirstPair) {
      await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_1A).catch(console.error);
      await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_1B).catch(console.error);
    } else {
      await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_2A).catch(console.error);
      await interaction.member.roles.remove(MATCHERINO_WINNER_ROLE_2B).catch(console.error);
    }

    const targetChannel = interaction.guild.channels.cache.get(ADD_MATCHERINO_MSG_CHANNEL);
    if (!targetChannel) {
      return interaction.reply({
        content: 'Error: cannot find the target channel to post the add.',
        ephemeral: true
      });
    }

    await targetChannel.send({
      content: `**New Matcherino Winner Add**\nUser: <@${interaction.user.id}>\n\nSupercell ID: \`${supercellId}\``
    });

    await interaction.reply({
      content: 'Successfully added Matcherino Winner! Your roles have been removed and the info posted!',
      ephemeral: true
    });
  }
});

/************************************************************
11) LOG IN
************************************************************/
client.login(BOT_TOKEN).catch((err) => {
  console.error('[Login Error]', err);
});
