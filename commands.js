// Command handlers for the Discord bot
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
  ChannelType,
  InteractionResponseFlags,
  Client,
  GatewayIntentBits
} = require('discord.js');
const { 
  EMBED_COLOR, 
  STAFF_ROLES, 
  TICKET_CATEGORIES
} = require('./src/constants');
const { createTicketPanel } = require('./src/modules/ticketFlow');
const { handleReviewCommand } = require('./review');

// Internal state to store ephemeral data between interactions
const ephemeralFlowState = new Map();
const ticketDataMap = new Map();

// Define missing constants
const LIST_COMMAND_ROLE = '1234567890123456780'; // Replace with actual role ID
const TICKET_PANEL_ALLOWED_USERS = ['1234567890123456779']; // Replace with actual user IDs
const MOVE_CATEGORIES = {
  paid: '1234567890123456778',
  add: '1234567890123456777',
  sell: '1234567890123456776',
  finished: '1234567890123456775'
};
const PURCHASE_ACCOUNT_CATEGORY = TICKET_CATEGORIES.purchase;

/**
 * Check if a member has any of the specified roles
 * @param {GuildMember} member - The guild member to check
 * @param {string[]} roleIds - Array of role IDs to check against
 * @returns {boolean} True if the member has any of the roles
 */
function hasAnyRole(member, roleIds) {
  return roleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Create a ticket channel with overflow handling
 * @param {Guild} guild - The guild to create the channel in
 * @param {string} userId - The user ID who created the ticket
 * @param {string} categoryId - The category to create the channel in
 * @param {string} baseName - The base name for the channel
 * @returns {TextChannel|null} The created channel or null if failed
 */
async function createTicketChannelWithOverflow(guild, userId, categoryId, baseName) {
  try {
    const user = await guild.members.fetch(userId);
    const category = await guild.channels.fetch(categoryId);
    
    if (!category) {
      console.error(`Category ${categoryId} not found`);
      return null;
    }
    
    // Create channel permissions
    const channelPermissions = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: userId,
        allow: [PermissionsBitField.Flags.ViewChannel]
      }
    ];
    
    // Add staff role permissions
    for (const roleId of STAFF_ROLES) {
      channelPermissions.push({
        id: roleId,
        allow: [PermissionsBitField.Flags.ViewChannel]
      });
    }
    
    // Create the channel
    const channel = await guild.channels.create({
      name: baseName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: channelPermissions,
      topic: `User ID: ${userId} | Created: ${new Date().toISOString()}`
    });
    
    // Store ticket data
    ticketDataMap.set(channel.id, {
      userId,
      createdAt: new Date(),
      type: baseName.split('-')[0]
    });
    
    return channel;
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    return null;
  }
}

// /list slash command registration
const listCommand = new SlashCommandBuilder()
  .setName('list')
  .setDescription('Add a new account for sale (restricted to sellers).')
  .addStringOption(option => option
    .setName('ping')
    .setDescription('Who should be pinged?')
      .setRequired(true)
      .addChoices(
        { name: 'Everyone', value: 'everyone' },
        { name: 'Here', value: 'here' },
        { name: 'None', value: 'none' }
      )
  )
  // Core summary fields
  .addStringOption(option => option.setName('text').setDescription('Short description').setRequired(true))
  .addStringOption(option => option.setName('price').setDescription('Price').setRequired(true))
  .addStringOption(option => option.setName('trophies').setDescription('Total trophies').setRequired(true))
  .addStringOption(option => option.setName('p11').setDescription('P11 info').setRequired(true))
  .addStringOption(option => option.setName('tier_max').setDescription('Tier-max info').setRequired(true))
  // Detailed fields
  .addStringOption(option => option.setName('rare_skins').setDescription('Rare skins').setRequired(true))
  .addStringOption(option => option.setName('super_rare_skins').setDescription('Super-rare skins').setRequired(true))
  .addStringOption(option => option.setName('epic_skins').setDescription('Epic skins').setRequired(true))
  .addStringOption(option => option.setName('mythic_skins').setDescription('Mythic skins').setRequired(true))
  .addStringOption(option => option.setName('legendary_skins').setDescription('Legendary skins').setRequired(true))
  .addStringOption(option => option.setName('titles').setDescription('Titles').setRequired(true))
  .addStringOption(option => option.setName('hypercharges').setDescription('Hypercharges').setRequired(true))
  .addStringOption(option => option.setName('power_10s').setDescription('Number of Power-10 brawlers').setRequired(true))
  .addStringOption(option => option.setName('power_9s').setDescription('Number of Power-9 brawlers').setRequired(true))
  .addStringOption(option => option.setName('old_ranked_rank').setDescription('Old ranked rank').setRequired(true))
  .addStringOption(option => option.setName('new_ranked_rank').setDescription('New ranked rank').setRequired(true))
  // Images
  .addAttachmentOption(option => option.setName('image').setDescription('Main image').setRequired(true))
  .addAttachmentOption(option => option.setName('image2').setDescription('Second image (optional)').setRequired(false));

// /ticket-panel command
const ticketPanelCommand = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('Create a ticket panel in the current channel');

// /review command
const reviewCommand = new SlashCommandBuilder()
  .setName('review')
  .setDescription('Add a review')
  .addUserOption(option => option.setName('user').setDescription('User to review').setRequired(true))
  .addStringOption(option => option.setName('rating').setDescription('Rating (1-5 stars)').setRequired(true))
  .addStringOption(option => option.setName('comment').setDescription('Review comment').setRequired(true))
  .addBooleanOption(option => option.setName('anonymous').setDescription('Submit anonymously').setRequired(false));

const exportedCommands = [listCommand, ticketPanelCommand, reviewCommand];

// Handle slash commands
async function handleSlashCommands(interaction) {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'review') {
    return handleReviewCommand(interaction);
  }

  if (interaction.commandName === 'ticket-panel') {
    // Check if user is allowed to create ticket panel
    if (!TICKET_PANEL_ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: "You don't have permission to create ticket panels.", 
        ephemeral: true 
      });
    }
    
    return createTicketPanel(interaction);
  }

  if (interaction.commandName === 'list') {
    // Check if user has the role OR is the specific user with permission
    const hasPermission = 
      interaction.member.roles.cache.has(LIST_COMMAND_ROLE) || 
      interaction.user.id === '658351335967686659' || // User JustRuben ID
      interaction.user.id === LIST_COMMAND_ROLE; // In case the ID is directly used
      
    if (!hasPermission) {
      console.log(`[LIST] Permission denied for user ${interaction.user.tag} (${interaction.user.id})`);
      return interaction.reply({ content: "You don't have permission to use this.", ephemeral: true });
    }
    console.log(`[LIST] Command used by ${interaction.user.tag} (${interaction.user.id})`);

    const pingChoice = interaction.options.getString('ping');
    const text = interaction.options.getString('text');
    const price = interaction.options.getString('price');
    const trophies = interaction.options.getString('trophies');
    const p11 = interaction.options.getString('p11');
    const tierMax = interaction.options.getString('tier_max');
    const rareSkins = interaction.options.getString('rare_skins');
    const superRareSkins = interaction.options.getString('super_rare_skins');
    const epicSkins = interaction.options.getString('epic_skins');
    const mythicSkins = interaction.options.getString('mythic_skins');
    const legendarySkins = interaction.options.getString('legendary_skins');
    const titles = interaction.options.getString('titles');
    const hypercharges = interaction.options.getString('hypercharges');
    const power10s = interaction.options.getString('power_10s');
    const power9s = interaction.options.getString('power_9s');
    const oldRankedRank = interaction.options.getString('old_ranked_rank');
    const newRankedRank = interaction.options.getString('new_ranked_rank');
    const image = interaction.options.getAttachment('image')?.url;
    const image2 = interaction.options.getAttachment('image2')?.url;

    console.log('[LIST] All options received successfully');

    let mention = '**New account added!**';
    if (pingChoice === 'everyone') mention = '**||@everyone|| New account added!**';
    if (pingChoice === 'here') mention = '**||@here|| New account added!**';

    const embed = new EmbedBuilder()
      .setTitle('New Account Added!')
      .setColor(EMBED_COLOR)
      .addFields(
        { name: 'Description', value: text },
        { name: 'Price', value: price, inline: true },
        { name: 'Trophies', value: trophies, inline: true },
        { name: 'P11', value: p11, inline: true },
        { name: 'Tier Max', value: tierMax, inline: true }
      );
    if (image) embed.setImage(image);

    // Create the more info embed data
    const moreInfoData = {
      rareSkins,
      superRareSkins,
      epicSkins,
      mythicSkins,
      legendarySkins,
      titles,
      hypercharges,
      power10s,
      power9s,
      oldRankedRank,
      newRankedRank,
      image2
    };

    console.log('[LIST] Created embeds and stored more info data');

    await interaction.reply({ content: 'Listing posted!', ephemeral: true });

    // Create our buttons with proper IDs from the start
    // We'll use a temporary variable to store our components
    const actionRow = new ActionRowBuilder();

    // Create the message first so we have the ID
    const msg = await interaction.channel.send({
      content: mention,
      embeds: [embed]
      // Don't add components yet, we'll add them after we have the message ID
    });

    console.log(`[LIST] Message sent with ID: ${msg.id}`);

    // Store the more info data
    ephemeralFlowState.set(msg.id, moreInfoData);
    console.log(`[LIST] More info data stored for message ${msg.id}`);

    // Now create the buttons with the proper IDs
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`purchase_account_${msg.id}`)
        .setLabel('Purchase Account')
        .setEmoji('<:Shopping_Cart:1351686041559367752>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`more_info_${msg.id}`)
        .setLabel('More Information')
        .setEmoji('<:Information:1370838179334066217>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`listing_mark_sold_${msg.id}`)
        .setLabel('Mark as Sold')
        .setEmoji('<:cross:1351689463453061130>')
        .setStyle(ButtonStyle.Danger)
    );

    // Update the message with the components
    await msg.edit({ components: [actionRow] });
    console.log('[LIST] Message updated with components');
  }
}

// Handle message commands
async function handleMessageCommands(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'move') {
    // Check permissions
    if (!hasAnyRole(message.member, STAFF_ROLES)) {
      return message.reply("You don't have permission to use this command.");
    }

    if (!args[0] || !MOVE_CATEGORIES[args[0]]) {
      return message.reply("Please specify a valid category: paid, add, sell, or finished");
    }

    // Get the target category
    const target = MOVE_CATEGORIES[args[0]];
    if (!target) {
      return message.reply("Invalid category specified.");
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
}

// Button handler for list command interactions
async function handleListButtons(interaction) {
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  // Handle Purchase Account button
  if (customId.startsWith('purchase_account_')) {
    const messageId = customId.replace('purchase_account_', '');
    
    try {
      // Create a ticket for the purchase
      const ticketName = `purchase-${interaction.user.username}`;
      const channel = await createTicketChannelWithOverflow(
        interaction.guild,
        interaction.user.id,
        PURCHASE_ACCOUNT_CATEGORY,
        ticketName
      );
      
      if (channel) {
        // Try to fetch the original listing message
        try {
          const originalMessage = await interaction.channel.messages.fetch(messageId);
          const originalEmbed = originalMessage.embeds[0];
          
          // Create a welcome message
          const welcomeEmbed = new EmbedBuilder()
            .setTitle('Account Purchase Ticket')
            .setColor(EMBED_COLOR)
            .setDescription(`Welcome ${interaction.user}! This is your ticket for purchasing an account. Staff will assist you shortly.`);
          
          // Create a close button
          const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('close_ticket')
              .setLabel('Close Ticket')
              .setStyle(ButtonStyle.Danger)
          );
          
          // Send welcome message
          await channel.send({ 
            content: `${interaction.user}`,
            embeds: [welcomeEmbed],
            components: [closeButton]
          });
          
          // Create order recap embed if original embed was found
          if (originalEmbed) {
            const recapEmbed = new EmbedBuilder()
              .setTitle('Order Recap')
              .setColor(EMBED_COLOR);
            
            // Copy fields from original embed
            if (originalEmbed.fields) {
              originalEmbed.fields.forEach(field => {
                recapEmbed.addFields({ 
                  name: field.name, 
                  value: field.value, 
                  inline: field.inline 
                });
              });
            }
            
            // Copy image if present
            if (originalEmbed.image) {
              recapEmbed.setImage(originalEmbed.image.url);
            }
            
            await channel.send({ embeds: [recapEmbed] });
          }
        } catch (error) {
          console.error('Error fetching original listing:', error);
          // Still send a basic message if original can't be found
          await channel.send(`${interaction.user}, your purchase ticket has been created. Staff will assist you shortly.`);
        }
        
        // Reply to the interaction
        await interaction.reply({ 
          content: `Your purchase ticket has been created: ${channel}`, 
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'Failed to create ticket. Please try again or contact staff.', 
          ephemeral: true 
        });
      }
    } catch (error) {
      console.error('Error creating purchase ticket:', error);
      await interaction.reply({ 
        content: 'An error occurred. Please try again or contact staff.', 
        ephemeral: true 
      });
    }
  }
  
  // Handle More Information button
  else if (customId.startsWith('more_info_')) {
    const messageId = customId.replace('more_info_', '');
    
    try {
      // Look up the payload in the ephemeral flow state
      const payload = ephemeralFlowState.get(messageId);
      
      if (payload) {
        // Create the detailed info embed
        const detailedEmbed = new EmbedBuilder()
          .setTitle('Account Details')
          .setColor(EMBED_COLOR)
          .addFields(
            { name: 'Rare Skins', value: payload.rareSkins, inline: true },
            { name: 'Super Rare Skins', value: payload.superRareSkins, inline: true },
            { name: 'Epic Skins', value: payload.epicSkins, inline: true },
            { name: 'Mythic Skins', value: payload.mythicSkins, inline: true },
            { name: 'Legendary Skins', value: payload.legendarySkins, inline: true },
            { name: 'Titles', value: payload.titles, inline: true },
            { name: 'Hypercharges', value: payload.hypercharges, inline: true },
            { name: 'Power 10s', value: payload.power10s, inline: true },
            { name: 'Power 9s', value: payload.power9s, inline: true },
            { name: 'Old Ranked Rank', value: payload.oldRankedRank, inline: true },
            { name: 'New Ranked Rank', value: payload.newRankedRank, inline: true }
          );
        
        // Add second image if present
        if (payload.image2) {
          detailedEmbed.setImage(payload.image2);
        }
        
        await interaction.reply({ 
          embeds: [detailedEmbed], 
          ephemeral: true 
        });
      } else {
        // Fallback in case the bot was restarted and lost the payload
        try {
          const originalMessage = await interaction.channel.messages.fetch(messageId);
          const originalEmbed = originalMessage.embeds[0];
          
          const fallbackEmbed = new EmbedBuilder()
            .setTitle('Limited Information Available')
            .setColor(EMBED_COLOR)
            .setDescription("We couldn't retrieve all details due to a bot restart. Please ask staff for complete information.");
          
          // Copy available fields from original embed
          if (originalEmbed && originalEmbed.fields) {
            originalEmbed.fields.forEach(field => {
              fallbackEmbed.addFields({ 
                name: field.name, 
                value: field.value, 
                inline: field.inline 
              });
            });
          }
          
          await interaction.reply({ 
            embeds: [fallbackEmbed], 
            ephemeral: true 
          });
        } catch (error) {
          console.error('Error creating fallback more info embed:', error);
          await interaction.reply({ 
            content: "We couldn't retrieve the account details. Please ask staff for more information.", 
            ephemeral: true 
          });
        }
      }
    } catch (error) {
      console.error('Error handling more info button:', error);
      await interaction.reply({ 
        content: 'An error occurred. Please try again or contact staff.', 
        ephemeral: true 
      });
    }
  }
  
  // Handle Mark as Sold button
  else if (customId.startsWith('listing_mark_sold_')) {
    // Permission check - only staff with LIST_COMMAND_ROLE can mark as sold
    if (!interaction.member.roles.cache.has(LIST_COMMAND_ROLE)) {
      return interaction.reply({ 
        content: 'Only authorized users can mark as sold.', 
        ephemeral: true 
      });
    }
    
    const messageId = customId.replace('listing_mark_sold_', '');
    
    try {
      // Create a disabled "sold" button
      const soldButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sold_button')
          .setLabel('SOLD')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      
      // Try to fetch and update the original message
      const originalMessage = await interaction.channel.messages.fetch(messageId);
      await originalMessage.edit({ components: [soldButton] });
      
      // Clear from ephemeral flow state to free memory
      ephemeralFlowState.delete(messageId);
      
      await interaction.reply({ 
        content: 'Listing marked as sold.',
        ephemeral: true 
      });
    } catch (error) {
      console.error('Error marking listing as sold:', error);
      await interaction.reply({ 
        content: 'Failed to mark listing as sold. Please try again or contact staff.',
        ephemeral: true 
      });
    }
  }
}

// Set up and export the commands
const commands = [
  listCommand.toJSON(),
  ticketPanelCommand.toJSON(),
  reviewCommand.toJSON()
];

// Initialize the bot
function initializeBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.once('ready', () => {
    console.log(`Bot is online! Logged in as ${client.user.tag}`);
  });

  // Set up all event handlers
  client.on('interactionCreate', handleSlashCommands);
  client.on('messageCreate', handleMessageCommands);
  client.on('interactionCreate', handleListButtons);
  
  // Register slash commands with Discord
  client.on('ready', async () => {
    try {
      console.log('Started refreshing application (/) commands.');
      await client.application.commands.set(commands);
      console.log('Successfully registered application commands.');
    } catch (error) {
      console.error('Error registering slash commands:', error);
    }
  });

  // Login to Discord with token from Replit secrets
  const token = process.env.TOKEN;
  if (!token) {
    console.error('Missing TOKEN environment variable. Make sure to set it in your Replit secrets.');
    process.exit(1);
  }
  
  client.login(token);
}

// Export everything needed
module.exports = {
  commands: exportedCommands,
  handleCommand: handleSlashCommands,
  handleListButtons,
  handleMessageCommands
}; 