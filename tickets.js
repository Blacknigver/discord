// Ticket management system
const { 
  ChannelType, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  PermissionsBitField,
  PermissionFlagsBits
} = require('discord.js');
const { 
  STAFF_ROLES, 
  AUTO_CLOSE_LOG_CHANNEL, 
  TICKET_CATEGORIES, 
  MAX_TICKETS_PER_USER, 
  PURCHASE_ACCOUNT_CATEGORY, 
  EMBED_COLOR,
  TICKET_OVERFLOW_CATEGORIES
} = require('./config.js');
const { isCategoryFull, hasAnyRole } = require('./utils');
const { cancelActiveCryptoPayment } = require('./ticketPayments.js');
const { ROLE_IDS } = require('./src/constants.js');
const { sendWelcomeEmbed, sendOrderDetailsEmbed } = require('./ticketPayments.js');
const config = require('./config');

// Define pink color
const PINK_COLOR = '#e68df2';

// TicketData class
class TicketData {
  constructor(openerId, channelId, channelName, openTime) {
    this.openerId = openerId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.openTime = openTime;
    this.lastUserMessageTime = null;
    this.reminded6h = false;
    this.reminded12h = false;
    this.reminded24h = false;
    this.reminded48h = false;
    this.lastActivity = openTime;
  }
}

// Maps to store ticket data and ephemeral flow state
const ticketDataMap = new Map();
const ephemeralFlowState = new Map();

/**
 * Creates a ticket channel with overflow handling
 * If a category is full, it will attempt to create in the next available category
 * 
 * @param {Guild} guild - The guild to create the channel in
 * @param {string} userId - The ID of the user who opened the ticket
 * @param {string} categoryId - The category ID to try first
 * @param {string} channelName - The base name for the channel
 * @param {Object} orderDetails - Order details to store in the topic
 * @returns {Promise<TextChannel|null>} The created channel or null if creation failed
 */
async function createTicketChannelWithOverflow(guild, userId, categoryId, channelName, orderDetails = {}) {
  try {
    console.log(`[TICKET_CREATE] Creating ticket channel: ${channelName} for user ${userId}`);
    
    // Format channel name (ensure lowercase, no spaces, etc.)
    let formattedName = channelName.toLowerCase().replace(/\s+/g, '-');
    
    // Ensure name is not too long
    if (formattedName.length > 90) {
      formattedName = formattedName.substring(0, 90);
    }
    
    // Generate topic from order details
    let topic = `User: <@${userId}>`;
    
    if (orderDetails.type) {
      topic += ` | Type: ${orderDetails.type}`;
    }
    
    if (orderDetails.price) {
      topic += ` | Price: ${orderDetails.price}`;
    }
    
    if (orderDetails.paymentMethod) {
      topic += ` | Payment: ${orderDetails.paymentMethod}`;
    }
    
    // Prepare permissions for the channel
    const permissionOverwrites = [
      // Everyone role - deny view
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      }
    ];
    
    // Add user permissions - first check if the user exists
    try {
      const user = await guild.client.users.fetch(userId).catch(() => null);
      
      if (user) {
        permissionOverwrites.push({
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.UseExternalEmojis
          ],
          deny: [
            PermissionFlagsBits.MentionEveryone,
            PermissionFlagsBits.UseExternalStickers
          ]
        });
      } else {
        console.warn(`[TICKET_CREATE] User with ID ${userId} not found, not adding user permissions`);
      }
    } catch (error) {
      console.warn(`[TICKET_CREATE] Error fetching user ${userId}: ${error.message}`);
    }
    
    // Add staff role permissions
    const staffRoleIds = [
      config.ROLES.OWNER_ROLE || config.ROLES.OWNER,
      config.ROLES.HEAD_ADMIN_ROLE || config.ROLES.HEAD_ADMIN,
      config.ROLES.ADMIN_ROLE || config.ROLES.ADMIN
    ];
    
    // Verify each role exists before adding to permission overwrites
    for (const roleId of staffRoleIds) {
      if (roleId) {
        try {
          // Check if the role exists in the guild
          const role = await guild.roles.fetch(roleId).catch(() => null);
          
          // Only add the role if it exists
          if (role) {
            permissionOverwrites.push({
              id: roleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.UseExternalEmojis,
                PermissionFlagsBits.MentionEveryone,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.ManageChannels
              ]
            });
          } else {
            console.warn(`[TICKET_CREATE] Role with ID ${roleId} not found in guild, skipping permission`);
          }
        } catch (error) {
          console.warn(`[TICKET_CREATE] Error fetching role ${roleId}: ${error.message}`);
        }
      }
    }
    
    // Prepare channel creation options
    const channelOptions = {
      name: formattedName,
      type: ChannelType.GuildText, // Use the enum value
      topic: topic,
      permissionOverwrites: permissionOverwrites
    };
    
    // If category is provided, try to create in that category
    if (categoryId) {
      try {
        const category = await guild.channels.fetch(categoryId);
        
        // Check if category has space (Discord limit is 50 channels per category)
        const maxChannels = config.MAX_CATEGORY_CHANNELS || 50;
        
        if (category?.children?.cache?.size < maxChannels) {
          channelOptions.parent = categoryId;
        } else {
          console.log(`[TICKET_CREATE] Category ${categoryId} is full (${category?.children?.cache?.size || 'unknown'}/${maxChannels}), creating without category`);
        }
      } catch (categoryError) {
        console.error(`[TICKET_CREATE] Error fetching category ${categoryId}: ${categoryError.message}`);
      }
    }
    
    // Create the channel
    return await guild.channels.create({
      name: channelOptions.name,
      type: channelOptions.type,
      topic: channelOptions.topic,
      permissionOverwrites: channelOptions.permissionOverwrites,
      parent: channelOptions.parent
    });
  } catch (error) {
    console.error(`[TICKET_CREATE] Error creating ticket channel: ${error.message}`);
    console.error(error.stack);
    return null;
  }
}

// Auto-close logging
async function autoCloseLog(guild, userId, channelName, reason) {
  console.log(`Ticket auto-closed: ${channelName} for user ${userId} - Reason: ${reason}`);
}

/**
 * Logs and deletes a ticket
 */
async function autoCloseLogAndDelete(channel, userId, channelName, reason) {
  try {
    // First cancel any active crypto payment timeouts for this channel
    try {
      cancelActiveCryptoPayment(channel.id);
      console.log(`[AUTO_CLOSE] Canceled active crypto payments for channel ${channel.id}`);
    } catch (paymentError) {
      console.error(`[AUTO_CLOSE] Error canceling crypto payments: ${paymentError}`);
      // Continue with deletion even if payment cancellation fails
    }
    
    // Then log and delete the channel
    await autoCloseLog(channel.guild, userId, channelName, reason);
    await channel.delete();
    
    // Remove from ticket data map
    if (ticketDataMap.has(channel.id)) {
      ticketDataMap.delete(channel.id);
    }
  } catch (error) {
    console.error(`[AUTO_CLOSE] Error closing ticket: ${error}`);
  }
}

async function sendNoMsgReminder(channel, openerId, soFar, left) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No messages for **${soFar}h**, please respond within **${left}h**.`)
    .setColor(PINK_COLOR);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(`${mention} – No activity for 24h, please respond within 24h.`)
    .setColor(PINK_COLOR);
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

/**
 * Check for inactive tickets to auto-close
 */
async function checkAutoClose(client) {
  const now = Date.now();
  const channelsToProcess = [...ticketDataMap.entries()]; // Create a copy to avoid modification during iteration
  
  for (const [channelId, data] of channelsToProcess) {
    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel) {
        console.log(`[AUTO_CLOSE] Channel ${channelId} not found, removing from ticket data`);
        ticketDataMap.delete(channelId);
        continue;
      }
      
      // Check if user has sent any messages
      const hasMessages = data.lastUserMessageTime !== null;
      
      // Time since ticket opened
      const timeSinceOpen = now - data.openTime;
      
      // Time since last user message
      const timeSinceLastMsg = hasMessages ? now - data.lastUserMessageTime : 0;
      
      // If no messages from user
      if (!hasMessages) {
        // Send 6h reminder
        if (timeSinceOpen > 6 * 60 * 60 * 1000 && !data.reminded6h) {
          data.reminded6h = true;
          try {
            await channel.send({
              content: `<@${data.openerId}>`,
              embeds: [
                new EmbedBuilder()
                  .setColor(PINK_COLOR)
                  .setDescription('This ticket will automatically close in 18 hours if you don\'t respond.')
              ]
            });
            console.log(`[AUTO_CLOSE] Sent 6h reminder to channel ${channelId}`);
          } catch (reminderError) {
            console.error(`[AUTO_CLOSE] Error sending 6h reminder to channel ${channelId}:`, reminderError);
            // Don't return or throw, continue with other checks
          }
        }
        
        // Send 12h reminder
        if (timeSinceOpen > 12 * 60 * 60 * 1000 && !data.reminded12h) {
          data.reminded12h = true;
          try {
            await channel.send({
              content: `<@${data.openerId}>`,
              embeds: [
                new EmbedBuilder()
                  .setColor(PINK_COLOR)
                  .setDescription('This ticket will automatically close in 12 hours if you don\'t respond.')
              ]
            });
            console.log(`[AUTO_CLOSE] Sent 12h reminder to channel ${channelId}`);
          } catch (reminderError) {
            console.error(`[AUTO_CLOSE] Error sending 12h reminder to channel ${channelId}:`, reminderError);
            // Don't return or throw, continue with other checks
          }
        }
        
        // Auto close after 24h of no messages
        if (timeSinceOpen > 24 * 60 * 60 * 1000) {
          console.log(`[AUTO_CLOSE] Closing ticket ${channelId} due to 24h of inactivity (no messages sent)`);
          try {
            await autoCloseLogAndDelete(channel, data.openerId, data.channelName, 'Inactivity (no messages sent)');
          } catch (closeError) {
            console.error(`[AUTO_CLOSE] Error auto-closing ticket ${channelId}:`, closeError);
            // Remove from ticket data map even if deletion fails
            ticketDataMap.delete(channelId);
          }
          continue;
        }
      } 
      // If user has sent messages but inactive
      else if (hasMessages && timeSinceLastMsg > 24 * 60 * 60 * 1000 && !data.reminded24h) {
        // Send 24h inactivity reminder
        data.reminded24h = true;
        try {
          await channel.send({
            content: `<@${data.openerId}>`,
            embeds: [
              new EmbedBuilder()
                .setColor(PINK_COLOR)
                .setDescription('This ticket will automatically close in 24 hours due to inactivity.')
            ]
          });
          console.log(`[AUTO_CLOSE] Sent 24h inactivity reminder to channel ${channelId}`);
        } catch (reminderError) {
          console.error(`[AUTO_CLOSE] Error sending 24h inactivity reminder to channel ${channelId}:`, reminderError);
          // Don't return or throw, continue with other checks
        }
      } 
      // Auto close after 48h of inactivity (if user had previously sent messages)
      else if (hasMessages && timeSinceLastMsg > 48 * 60 * 60 * 1000) {
        console.log(`[AUTO_CLOSE] Closing ticket ${channelId} due to 48h of inactivity`);
        try {
          await autoCloseLogAndDelete(channel, data.openerId, data.channelName, 'Inactivity (48 hours)');
        } catch (closeError) {
          console.error(`[AUTO_CLOSE] Error auto-closing ticket ${channelId}:`, closeError);
          // Remove from ticket data map even if deletion fails
          ticketDataMap.delete(channelId);
        }
        continue;
      }
      
    } catch (error) {
      console.error(`[AUTO-CLOSE] Error processing channel ${channelId}:`, error);
      // Clean up the data for this channel to prevent future errors
      ticketDataMap.delete(channelId);
    }
  }
  
  console.log(`[AUTO_CLOSE] Checked ${channelsToProcess.length} tickets, ${ticketDataMap.size} tickets remain active`);
}

/**
 * Initialize ticket system
 */
async function initializeTicketSystem(client, db) {
  global.db = db; // Make db available in this module
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
      data.lastUserMessageTime = Number(row.last_msg_time);
      data.reminded6h = row.reminder_6h;
      data.reminded12h = row.reminder_12h;
      data.reminded24h = row.reminder_24h;
      ticketDataMap.set(row.channel_id, data);
    }
    console.log(`Loaded ${res.rows.length} tickets`);
    
    // Start the auto-close check interval
    setInterval(() => checkAutoClose(client), 60 * 60 * 1000); // Check every hour
  } catch (err) {
    console.error('Error loading tickets:', err);
  }
}

/**
 * Set up ticket listeners
 */
function setupTicketHandlers(client) {
  console.log('Ticket handlers have been set up');
}

/**
 * Closes a ticket channel by removing permissions and moving it to the archive category
 * @param {Channel} channel - The channel to close
 * @param {User} user - The user who closed the ticket
 * @param {string} reason - Optional reason for closing
 */
async function closeTicket(channel, user, reason = '') {
  try {
    console.log(`[TICKET_CLOSE] Closing ticket ${channel.id} by user ${user.id}`);
    
    // Create and send the closed embed
    const closedEmbed = new EmbedBuilder()
      .setTitle('Ticket Closed')
      .setDescription(`This ticket has been closed by <@${user.id}>`)
      .setColor(PINK_COLOR)
      .setTimestamp();
    
    // Create the reopen and delete buttons
    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('reopen_ticket')
        .setLabel('Re-Open')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔓'),
      new ButtonBuilder()
        .setCustomId('delete_ticket')
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );
    
    await channel.send({
      embeds: [closedEmbed],
      components: [actionRow]
    });
    
    // Remove permissions for everyone except staff roles
    await channel.permissionOverwrites.set([
      {
        id: channel.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: ROLE_IDS.OWNER || '1292933200389083196', // Owner role
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels
        ]
      },
      {
        id: ROLE_IDS.HEAD_ADMIN || '1358101527658627270', // Head Admin role
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels
        ]
      },
      {
        id: ROLE_IDS.ADMIN || '1292933924116500532', // Admin role
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ]);
    
    // Move to archive category
    const archiveCategoryId = '1382393108737691740'; // From requirements
    const archiveCategory = await channel.guild.channels.fetch(archiveCategoryId).catch(() => null);
    
    if (archiveCategory) {
      await channel.setParent(archiveCategoryId, { lockPermissions: false });
      console.log(`[TICKET_CLOSE] Moved ticket ${channel.id} to archive category`);
    } else {
      console.warn(`[TICKET_CLOSE] Archive category not found, ticket not moved`);
    }
    
    // Update ticket data
    if (ticketDataMap.has(channel.id)) {
      const ticketData = ticketDataMap.get(channel.id);
      ticketData.closed = true;
      ticketData.closedBy = user.id;
      ticketData.closedAt = Date.now();
      ticketData.closedReason = reason;
      ticketDataMap.set(channel.id, ticketData);
    }
    
    return true;
  } catch (error) {
    console.error(`[TICKET_CLOSE] Error closing ticket: ${error.message}`);
    return false;
  }
}

/**
 * Reopens a closed ticket
 * @param {Channel} channel - The channel to reopen
 * @param {User} user - The user who reopened the ticket
 */
async function reopenTicket(channel, user) {
  try {
    console.log(`[TICKET_REOPEN] Reopening ticket ${channel.id} by user ${user.id}`);
    
    // Get ticket data
    const ticketData = ticketDataMap.get(channel.id);
    if (!ticketData) {
      console.warn(`[TICKET_REOPEN] No ticket data found for channel ${channel.id}`);
      return false;
    }
    
    // Create and send the reopened embed
    const reopenedEmbed = new EmbedBuilder()
      .setTitle('Ticket Reopened')
      .setDescription(`This ticket has been reopened by <@${user.id}>`)
      .setColor(EMBED_COLOR)
      .setTimestamp();
    
    await channel.send({
      embeds: [reopenedEmbed]
    });
    
    // Restore permissions for the ticket opener
    await channel.permissionOverwrites.edit(ticketData.openerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
      UseExternalEmojis: true
    });
    
    // Move back to original ticket category
    const ticketCategory = await channel.guild.channels.fetch(TICKET_CATEGORIES[0]).catch(() => null);
    if (ticketCategory) {
      await channel.setParent(ticketCategory.id, { lockPermissions: false });
    }
    
    // Update ticket data
    ticketData.closed = false;
    ticketData.reopenedBy = user.id;
    ticketData.reopenedAt = Date.now();
    ticketDataMap.set(channel.id, ticketData);
    
    return true;
  } catch (error) {
    console.error(`[TICKET_REOPEN] Error reopening ticket: ${error.message}`);
    return false;
  }
}

/**
 * Deletes a ticket channel
 * @param {Channel} channel - The channel to delete
 * @param {User} user - The user who triggered the deletion
 */
async function deleteTicket(channel, user) {
  try {
    console.log(`[TICKET_DELETE] Deleting ticket ${channel.id} by user ${user.id}`);
    
    // Create a deletion message
    const deleteEmbed = new EmbedBuilder()
      .setTitle('Ticket Deleted')
      .setDescription(`This ticket is being deleted by <@${user.id}>`)
      .setColor('#ff0000')
      .setTimestamp();
    
    await channel.send({
      embeds: [deleteEmbed]
    });
    
    // Remove from the ticket data map
    if (ticketDataMap.has(channel.id)) {
      ticketDataMap.delete(channel.id);
    }
    
    // Wait a moment before deleting
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Delete the channel
    await channel.delete(`Deleted by ${user.tag}`);
    
    return true;
  } catch (error) {
    console.error(`[TICKET_DELETE] Error deleting ticket: ${error.message}`);
    return false;
  }
}

module.exports = {
  createTicketChannelWithOverflow,
  ticketDataMap,
  TicketData,
  ephemeralFlowState,
  checkAutoClose,
  autoCloseLog,
  autoCloseLogAndDelete,
  setupTicketHandlers,
  initializeTicketSystem,
  closeTicket,
  reopenTicket,
  deleteTicket
}; 