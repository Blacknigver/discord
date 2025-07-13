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
    this.reminderMessageId = null;
    this.paymentCompleted = false;
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
    
    // Add rank information for better extraction
    if (orderDetails.current && orderDetails.desired) {
      topic += ` | From: ${orderDetails.current} to ${orderDetails.desired}`;
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
    const channel = await guild.channels.create({
      name: channelOptions.name,
      type: channelOptions.type,
      topic: channelOptions.topic,
      permissionOverwrites: channelOptions.permissionOverwrites,
      parent: channelOptions.parent
    });

    // Register the ticket in memory so we can later identify the opener (e.g. for close permissions)
    ticketDataMap.set(channel.id, new TicketData(userId, channel.id, formattedName, Date.now()));

    /* ---------------- Persist to DB ---------------- */
    try {
      const db = require('./database');
      
      console.log(`[TICKET_CREATE] === STORING BOOST INFORMATION IN DATABASE ===`);
      console.log(`[TICKET_CREATE] Channel ID: ${channel.id}`);
      console.log(`[TICKET_CREATE] Raw orderDetails:`, orderDetails);
      
      // Wait for database connection instead of checking isConnected
      try {
        await db.waitUntilConnected();
        console.log(`[TICKET_CREATE] ✅ Database connection confirmed`);
      } catch (connectionError) {
        console.error(`[TICKET_CREATE] ❌ Database connection failed: ${connectionError.message}`);
        throw connectionError;
      }
      
      // Extract boost information from orderDetails for proper storage
      let boostType = null;
      let desiredRank = null;
      let desiredTrophies = null;
      
      if (orderDetails && typeof orderDetails === 'object') {
        if (orderDetails.type) {
          boostType = orderDetails.type;
          console.log(`[TICKET_CREATE] ✅ Extracted boost type: ${boostType}`);
        } else {
          console.log(`[TICKET_CREATE] ❌ No type found in orderDetails`);
        }
        
        if (orderDetails.desired) {
          console.log(`[TICKET_CREATE] Found desired field: "${orderDetails.desired}"`);
          if (orderDetails.type === 'ranked') {
            desiredRank = orderDetails.desired;
            console.log(`[TICKET_CREATE] ✅ Set desired_rank for ranked boost: ${desiredRank}`);
          } else if (orderDetails.type === 'trophies' || orderDetails.type === 'bulk') {
            desiredTrophies = orderDetails.desired;
            console.log(`[TICKET_CREATE] ✅ Set desired_trophies for trophy/bulk boost: ${desiredTrophies}`);
          }
        } else {
          console.log(`[TICKET_CREATE] ❌ No desired field found in orderDetails`);
        }
      } else {
        console.log(`[TICKET_CREATE] ❌ orderDetails is null, undefined, or not an object:`, typeof orderDetails);
      }
      
      console.log(`[TICKET_CREATE] Final values to store:`);
      console.log(`[TICKET_CREATE] - boost_type: ${boostType || 'NULL'}`);
      console.log(`[TICKET_CREATE] - desired_rank: ${desiredRank || 'NULL'}`);
      console.log(`[TICKET_CREATE] - desired_trophies: ${desiredTrophies || 'NULL'}`);
      
      const result = await db.query(
        `INSERT INTO tickets (channel_id, user_id, status, created_at, metadata, boost_type, desired_rank, desired_trophies)
         VALUES ($1,$2,'open',NOW(),$3,$4,$5,$6)
         ON CONFLICT (channel_id) DO NOTHING
         RETURNING channel_id, boost_type, desired_rank, desired_trophies`,
        [channel.id, userId, JSON.stringify(orderDetails), boostType, desiredRank, desiredTrophies]
      );
      
      if (result.rows.length > 0) {
        console.log(`[TICKET_CREATE] ✅ Successfully stored ticket in database:`, result.rows[0]);
      } else {
        console.log(`[TICKET_CREATE] ❌ No rows returned - ticket may have already existed`);
        
        // Try to update existing ticket with boost information if it exists
        const updateResult = await db.query(
          `UPDATE tickets SET boost_type = $2, desired_rank = $3, desired_trophies = $4, metadata = $5
           WHERE channel_id = $1 
           RETURNING channel_id, boost_type, desired_rank, desired_trophies`,
          [channel.id, boostType, desiredRank, desiredTrophies, JSON.stringify(orderDetails)]
        );
        
        if (updateResult.rows.length > 0) {
          console.log(`[TICKET_CREATE] ✅ Updated existing ticket with boost info:`, updateResult.rows[0]);
        } else {
          console.log(`[TICKET_CREATE] ❌ Failed to update existing ticket`);
        }
      }
    } catch (dbErr) {
      console.error(`[TICKET_CREATE] ❌ Failed to write ticket to DB: ${dbErr.message}`);
      console.error(`[TICKET_CREATE] Database error stack:`, dbErr.stack);
    }

    return channel;
  } catch (error) {
    console.error(`[TICKET_CREATE] Error creating ticket channel: ${error.message}`);
    console.error(error.stack);
    return null;
  }
}

// Auto-close logging with HTML transcript
async function autoCloseLog(guild, userId, channelName, reason, channel = null) {
  try {
    console.log(`[AUTO_CLOSE_LOG] Ticket auto-closed: ${channelName} for user ${userId} - Reason: ${reason}`);
    
    const logChannelId = '1354587880382795836';
    const logChannel = guild.channels.cache.get(logChannelId);
    
    if (!logChannel) {
      console.error(`[AUTO_CLOSE_LOG] Log channel ${logChannelId} not found`);
      return;
    }
    
    // Generate and DM transcript to user if channel is available
    if (channel && guild.client) {
      try {
        const { generateAndDMTranscript } = require('./src/utils/transcriptGenerator.js');
        await generateAndDMTranscript(channel, userId, guild.client, reason);
        console.log(`[AUTO_CLOSE_LOG] Successfully DMed transcript to user ${userId}`);
      } catch (dmError) {
        console.error(`[AUTO_CLOSE_LOG] Error DMing transcript: ${dmError.message}`);
      }
    }
    
    // Create basic log embed
    const logEmbed = new EmbedBuilder()
      .setTitle('🔒 Ticket Auto-Closed')
      .setDescription(`**Channel:** ${channelName}\n**User:** <@${userId}>\n**Reason:** ${reason}`)
      .setColor('#ff6b6b')
      .setTimestamp()
      .setFooter({ text: 'Brawl Shop Auto-Close System' });
    
    // Try to generate HTML transcript if channel is available
    let transcriptFile = null;
    if (channel) {
      try {
        console.log(`[AUTO_CLOSE_LOG] Generating text transcript for ${channelName}...`);
        
        const { generateTextTranscript, saveTranscriptToFile } = require('./src/utils/transcriptGenerator.js');
        
        // Generate transcript
        const textContent = await generateTextTranscript(channel, false);
        
        // Save transcript to file
        const filename = `transcript.txt`;
        const filepath = await saveTranscriptToFile(textContent, filename, 'txt');
        
        // Create attachment
        const { AttachmentBuilder } = require('discord.js');
        transcriptFile = new AttachmentBuilder(filepath, { name: filename });
        
        console.log(`[AUTO_CLOSE_LOG] Successfully generated transcript: ${filename}`);
        
        // Add transcript info to embed
        logEmbed.addFields({
          name: '📄 Transcript',
          value: 'Text transcript attached below',
          inline: false
        });
        
      } catch (transcriptError) {
        console.error(`[AUTO_CLOSE_LOG] Error generating transcript: ${transcriptError.message}`);
        logEmbed.addFields({
          name: '❌ Transcript Error',
          value: 'Could not generate transcript',
          inline: false
        });
      }
    }
    
    // Send log message with optional transcript attachment
    const messageOptions = {
      embeds: [logEmbed]
    };
    
    if (transcriptFile) {
      messageOptions.files = [transcriptFile];
    }
    
    await logChannel.send(messageOptions);
    console.log(`[AUTO_CLOSE_LOG] Sent auto-close log to channel ${logChannelId}`);
    
  } catch (error) {
    console.error(`[AUTO_CLOSE_LOG] Error sending auto-close log: ${error.message}`);
  }
}

/**
 * Logs and deletes a ticket with HTML transcript generation
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
    
    // Generate transcript and log BEFORE deleting the channel
    console.log(`[AUTO_CLOSE] Generating transcript for ${channelName} before deletion...`);
    await autoCloseLog(channel.guild, userId, channelName, reason, channel);
    
    // Delete the channel after logging
    await channel.delete();
    console.log(`[AUTO_CLOSE] Successfully deleted channel ${channelName}`);
    
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
 * Sends auto-close reminder message with exact format requested
 * @param {Channel} channel - The channel to send reminder to
 * @param {string} openerId - The user ID of the ticket opener
 * @param {number} hoursInactive - How many hours the ticket has been inactive
 * @param {number} hoursUntilClose - How many hours until auto-close
 * @param {string} oldReminderMessageId - ID of old reminder message to delete
 * @returns {string} The ID of the new reminder message
 */
async function sendAutoCloseReminder(channel, openerId, hoursInactive, hoursUntilClose, oldReminderMessageId = null) {
  try {
    // Delete old reminder message if it exists
    if (oldReminderMessageId) {
      try {
        const oldMessage = await channel.messages.fetch(oldReminderMessageId);
        if (oldMessage) {
          await oldMessage.delete();
          console.log(`[AUTO_CLOSE] Deleted old reminder message ${oldReminderMessageId}`);
        }
      } catch (error) {
        console.log(`[AUTO_CLOSE] Could not delete old reminder message ${oldReminderMessageId}: ${error.message}`);
      }
    }
    
    // Calculate Discord timestamp for close time
    const closeTime = Math.floor((Date.now() + (hoursUntilClose * 60 * 60 * 1000)) / 1000);
    
    // Create the reminder embed
    const reminderEmbed = new EmbedBuilder()
      .setTitle('Auto-Close Reminder')
      .setDescription(`Your ticket has been inactive for ${hoursInactive} hours, please send a message or click the 'Payment Completed' button after sending the money.\n\n> <a:warning:1393326303804919889> If this ticket remains inactive it will be closed <t:${closeTime}:R>`)
      .setColor('#ff0000'); // Red color
    
    // Create the warning button
    const warningButton = new ButtonBuilder()
      .setCustomId('auto_close_warning')
      .setLabel(`Ticket will be closed in ${hoursUntilClose}h`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('<a:warning:1393326303804919889>');
    
    const actionRow = new ActionRowBuilder().addComponents(warningButton);
    
    // Send the reminder message
    const reminderMessage = await channel.send({
      content: `<@${openerId}>`,
      embeds: [reminderEmbed],
      components: [actionRow]
    });
    
    console.log(`[AUTO_CLOSE] Sent ${hoursInactive}h reminder to channel ${channel.id} (closes in ${hoursUntilClose}h)`);
    return reminderMessage.id;
    
  } catch (error) {
    console.error(`[AUTO_CLOSE] Error sending reminder to channel ${channel.id}:`, error);
    return null;
  }
}

/**
 * Check for inactive tickets to auto-close
 */
async function checkAutoClose(client) {
  const now = Date.now();
  const channelsToProcess = [...ticketDataMap.entries()]; // Create a copy to avoid modification during iteration
  
  // First, process completion-based auto-close (boost/profile completions)
  try {
    const { processCompletionAutoClose } = require('./src/utils/completionUtils.js');
    await processCompletionAutoClose(client);
  } catch (error) {
    console.error(`[AUTO_CLOSE] Error processing completion auto-close: ${error.message}`);
  }
  
  for (const [channelId, data] of channelsToProcess) {
    try {
      const channel = client.channels.cache.get(channelId);
      if (!channel) {
        console.log(`[AUTO_CLOSE] Channel ${channelId} not found, removing from ticket data`);
        ticketDataMap.delete(channelId);
        continue;
      }
      
      // Check if payment has been completed - if so, skip auto-close
      if (data.paymentCompleted) {
        console.log(`[AUTO_CLOSE] Skipping auto-close for channel ${channelId} - payment completed`);
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
        // Send 6h reminder (closes in 18h)
        if (timeSinceOpen > 6 * 60 * 60 * 1000 && !data.reminded6h) {
          data.reminded6h = true;
          const reminderMessageId = await sendAutoCloseReminder(channel, data.openerId, 6, 18, data.reminderMessageId);
          if (reminderMessageId) {
            data.reminderMessageId = reminderMessageId;
            // Update database
            try {
              const db = require('./database.js');
              if (db.isConnected) {
                await db.query(
                  'UPDATE tickets SET reminder_6h = TRUE, reminder_message_id = $2 WHERE channel_id = $1',
                  [channelId, reminderMessageId]
                );
              }
            } catch (dbError) {
              console.error(`[AUTO_CLOSE] Error updating database for 6h reminder: ${dbError.message}`);
            }
          }
        }
        
        // Send 12h reminder (closes in 12h)
        if (timeSinceOpen > 12 * 60 * 60 * 1000 && !data.reminded12h) {
          data.reminded12h = true;
          const reminderMessageId = await sendAutoCloseReminder(channel, data.openerId, 12, 12, data.reminderMessageId);
          if (reminderMessageId) {
            data.reminderMessageId = reminderMessageId;
            // Update database
            try {
              const db = require('./database.js');
              if (db.isConnected) {
                await db.query(
                  'UPDATE tickets SET reminder_12h = TRUE, reminder_message_id = $2 WHERE channel_id = $1',
                  [channelId, reminderMessageId]
                );
              }
            } catch (dbError) {
              console.error(`[AUTO_CLOSE] Error updating database for 12h reminder: ${dbError.message}`);
            }
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
        // Send 24h inactivity reminder (closes in 24h)
        data.reminded24h = true;
        const reminderMessageId = await sendAutoCloseReminder(channel, data.openerId, 24, 24, data.reminderMessageId);
        if (reminderMessageId) {
          data.reminderMessageId = reminderMessageId;
          // Update database
          try {
            const db = require('./database.js');
            if (db.isConnected) {
              await db.query(
                'UPDATE tickets SET reminder_24h = TRUE, reminder_message_id = $2 WHERE channel_id = $1',
                [channelId, reminderMessageId]
              );
            }
          } catch (dbError) {
            console.error(`[AUTO_CLOSE] Error updating database for 24h reminder: ${dbError.message}`);
          }
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
 * Handles when a user sends a message in a ticket - resets auto-close timer and deletes reminder
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID who sent the message
 */
async function handleUserMessage(channelId, userId) {
  const ticketData = ticketDataMap.get(channelId);
  if (!ticketData) return;
  
  // Only reset if this is the ticket opener
  if (ticketData.openerId !== userId) return;
  
  console.log(`[AUTO_CLOSE] User ${userId} sent message in ticket ${channelId} - resetting auto-close timer`);
  
  // Update last message time
  const now = Date.now();
  ticketData.lastUserMessageTime = now;
  
  // Reset all reminder flags
  ticketData.reminded6h = false;
  ticketData.reminded12h = false;
  ticketData.reminded24h = false;
  ticketData.reminded48h = false;
  
  // Delete existing reminder message if it exists
  if (ticketData.reminderMessageId) {
    try {
      // Get the client from the global object or try to find a channel directly 
      const client = global.client || require('./index.js').client;
      if (client) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const reminderMessage = await channel.messages.fetch(ticketData.reminderMessageId);
          if (reminderMessage) {
            await reminderMessage.delete();
            console.log(`[AUTO_CLOSE] Deleted reminder message ${ticketData.reminderMessageId} due to user activity`);
          }
        }
      }
    } catch (error) {
      console.log(`[AUTO_CLOSE] Could not delete reminder message ${ticketData.reminderMessageId}: ${error.message}`);
    }
    ticketData.reminderMessageId = null;
  }
  
  // Update database
  try {
    const db = require('./database.js');
    if (db.isConnected) {
      await db.query(
        `UPDATE tickets SET 
          last_msg_time = to_timestamp($2 / 1000.0),
          reminder_6h = FALSE,
          reminder_12h = FALSE,
          reminder_24h = FALSE,
          reminder_message_id = NULL
        WHERE channel_id = $1`,
        [channelId, now]
      );
      console.log(`[AUTO_CLOSE] Updated database for user message in ticket ${channelId}`);
    }
  } catch (dbError) {
    console.error(`[AUTO_CLOSE] Error updating database for user message: ${dbError.message}`);
  }
}

/**
 * Handles when a user clicks the Payment Completed button - stops auto-close permanently
 * @param {string} channelId - The channel ID
 * @param {string} userId - The user ID who clicked the button
 */
async function handlePaymentCompleted(channelId, userId) {
  const ticketData = ticketDataMap.get(channelId);
  if (!ticketData) return;
  
  // Only allow if this is the ticket opener
  if (ticketData.openerId !== userId) return;
  
  console.log(`[AUTO_CLOSE] User ${userId} clicked Payment Completed in ticket ${channelId} - stopping auto-close permanently`);
  
  // Mark payment as completed
  ticketData.paymentCompleted = true;
  
  // Delete existing reminder message if it exists
  if (ticketData.reminderMessageId) {
    try {
      // Get the client from the global object or try to find a channel directly 
      const client = global.client || require('./index.js').client;
      if (client) {
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const reminderMessage = await channel.messages.fetch(ticketData.reminderMessageId);
          if (reminderMessage) {
            await reminderMessage.delete();
            console.log(`[AUTO_CLOSE] Deleted reminder message ${ticketData.reminderMessageId} due to payment completion`);
          }
        }
      }
    } catch (error) {
      console.log(`[AUTO_CLOSE] Could not delete reminder message ${ticketData.reminderMessageId}: ${error.message}`);
    }
    ticketData.reminderMessageId = null;
  }
  
  // Update database
  try {
    const db = require('./database.js');
    if (db.isConnected) {
      await db.query(
        `UPDATE tickets SET 
          payment_completed = TRUE,
          reminder_message_id = NULL
        WHERE channel_id = $1`,
        [channelId]
      );
      console.log(`[AUTO_CLOSE] Updated database for payment completion in ticket ${channelId}`);
    }
  } catch (dbError) {
    console.error(`[AUTO_CLOSE] Error updating database for payment completion: ${dbError.message}`);
  }
}

/**
 * Deletes a ticket channel with transcript generation and DM
 * @param {Channel} channel - The channel to delete
 * @param {User} user - The user who deleted the ticket
 * @param {string} reason - Optional reason for deletion
 */
async function deleteTicket(channel, user, reason = '') {
  try {
    console.log(`[TICKET_DELETE] Deleting ticket ${channel.id} by user ${user.id}`);
    
    // Get ticket data to find the ticket opener
    const ticketData = ticketDataMap.get(channel.id);
    const ticketOpenerId = ticketData ? ticketData.openerId : null;
    
    // Generate and DM transcript to ticket opener BEFORE deleting
    if (ticketOpenerId && channel.client) {
      try {
        const { generateAndDMTranscript } = require('./src/utils/transcriptGenerator.js');
        const deleteReason = reason || `Deleted by ${user.username}`;
        await generateAndDMTranscript(channel, ticketOpenerId, channel.client, deleteReason);
        console.log(`[TICKET_DELETE] Successfully DMed transcript to ticket opener ${ticketOpenerId}`);
      } catch (dmError) {
        console.error(`[TICKET_DELETE] Error DMing transcript: ${dmError.message}`);
      }
    }
    
    // Generate and log transcript to log channel BEFORE deleting
    if (channel.client) {
      try {
        const { generateAndLogTranscript } = require('./src/utils/transcriptGenerator.js');
        const logChannelId = '1354587880382795836';
        const deleteReason = reason || `Deleted by ${user.username}`;
        await generateAndLogTranscript(channel, ticketOpenerId || 'Unknown', channel.client, deleteReason, logChannelId);
        console.log(`[TICKET_DELETE] Successfully logged transcript to channel ${logChannelId}`);
      } catch (logError) {
        console.error(`[TICKET_DELETE] Error logging transcript: ${logError.message}`);
      }
    }
    
    // Delete the channel
    await channel.delete(`Ticket deleted by ${user.username}${reason ? ` - ${reason}` : ''}`);
    console.log(`[TICKET_DELETE] Successfully deleted channel ${channel.name}`);
    
    // Remove from ticket data map
    if (ticketDataMap.has(channel.id)) {
      ticketDataMap.delete(channel.id);
    }
    
    // Update database
    try {
      const db = require('./database');
      if (db.isConnected) {
        await db.query(
          `UPDATE tickets SET status='deleted', closed_at=NOW(), last_activity=NOW() WHERE channel_id=$1`,
          [channel.id]
        );
      }
    } catch (dbErr) {
      console.error('[TICKET_DELETE] Failed to update ticket status in DB:', dbErr.message);
    }
    
    return true;
  } catch (error) {
    console.error(`[TICKET_DELETE] Error deleting ticket: ${error.message}`);
    return false;
  }
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
        reminder_6h, reminder_12h, reminder_24h,
        reminder_message_id, payment_completed
      FROM tickets;
    `);
    for (const row of res.rows) {
      const data = new TicketData(row.opener_id, row.channel_id, row.channel_name, Number(row.open_time));
      data.lastUserMessageTime = Number(row.last_msg_time);
      data.reminded6h = row.reminder_6h;
      data.reminded12h = row.reminder_12h;
      data.reminded24h = row.reminder_24h;
      data.reminderMessageId = row.reminder_message_id;
      data.paymentCompleted = row.payment_completed || false;
      ticketDataMap.set(row.channel_id, data);
    }
    console.log(`Loaded ${res.rows.length} tickets`);
    
    // Start the auto-close check interval
    setInterval(() => checkAutoClose(client), 5 * 60 * 1000); // Check every 5 minutes
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
    
    // Get ticket data to find the ticket opener
    const ticketData = ticketDataMap.get(channel.id);
    const ticketOpenerId = ticketData ? ticketData.openerId : null;
    
    // Generate and DM transcript to ticket opener
    if (ticketOpenerId && channel.client) {
      try {
        const { generateAndDMTranscript } = require('./src/utils/transcriptGenerator.js');
        const closeReason = reason || `Closed by ${user.username}`;
        await generateAndDMTranscript(channel, ticketOpenerId, channel.client, closeReason);
        console.log(`[TICKET_CLOSE] Successfully DMed transcript to ticket opener ${ticketOpenerId}`);
      } catch (dmError) {
        console.error(`[TICKET_CLOSE] Error DMing transcript: ${dmError.message}`);
      }
    }
    
    // Generate and log transcript to log channel
    if (channel.client) {
      try {
        const { generateAndLogTranscript } = require('./src/utils/transcriptGenerator.js');
        const logChannelId = '1354587880382795836';
        const closeReason = reason || `Closed by ${user.username}`;
        await generateAndLogTranscript(channel, ticketOpenerId || 'Unknown', channel.client, closeReason, logChannelId);
        console.log(`[TICKET_CLOSE] Successfully logged transcript to channel ${logChannelId}`);
      } catch (logError) {
        console.error(`[TICKET_CLOSE] Error logging transcript: ${logError.message}`);
      }
    }
    
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
    
    // Update in-memory ticket data
    if (ticketDataMap.has(channel.id)) {
      const ticketData = ticketDataMap.get(channel.id);
      ticketData.closed = true;
      ticketData.closedBy = user.id;
      ticketData.closedAt = Date.now();
      ticketData.closedReason = reason;
      ticketDataMap.set(channel.id, ticketData);
    }
    
    /* ---------------- Persist status to DB ---------------- */
    try {
      const db = require('./database');
      if (db.isConnected) {
        await db.query(
          `UPDATE tickets SET status='closed', closed_at=NOW(), last_activity=NOW() WHERE channel_id=$1`,
          [channel.id]
        );
      }
    } catch (dbErr) {
      console.error('[TICKET_CLOSE] Failed to update ticket status in DB:', dbErr.message);
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
    
    /* ---------------- Persist reopen to DB ---------------- */
    try {
      const db = require('./database');
      if (db.isConnected) {
        await db.query(
          `UPDATE tickets SET status='open', last_activity=NOW() WHERE channel_id=$1`,
          [channel.id]
        );
      }
    } catch (dbErr) {
      console.error('[TICKET_REOPEN] Failed to update ticket status in DB:', dbErr.message);
    }
    
    return true;
  } catch (error) {
    console.error(`[TICKET_REOPEN] Error reopening ticket: ${error.message}`);
    return false;
  }
}

/**
 * Deletes a ticket channel with transcript generation
 * @param {Channel} channel - The channel to delete
 * @param {User} user - The user who triggered the deletion
 */
async function deleteTicket(channel, user) {
  try {
    console.log(`[TICKET_DELETE] Deleting ticket ${channel.id} by user ${user.id}`);
    
    // Generate transcript BEFORE deleting the channel
    const ticketData = ticketDataMap.get(channel.id);
    const channelName = channel.name;
    const openerId = ticketData ? ticketData.openerId : 'Unknown';
    
    console.log(`[TICKET_DELETE] Generating transcript for manual deletion of ${channelName}...`);
    
    // Generate transcript and send to log channel
    try {
      const logChannelId = '1354587880382795836';
      const logChannel = channel.guild.channels.cache.get(logChannelId);
      
      if (logChannel) {
        console.log(`[TICKET_DELETE] Generating text transcript for ${channelName}...`);
        
        const { generateTextTranscript, saveTranscriptToFile } = require('./src/utils/transcriptGenerator.js');
        
        // Generate transcript
        const textContent = await generateTextTranscript(channel, false);
        
        // Save transcript to file
        const filename = `transcript.txt`;
        const filepath = await saveTranscriptToFile(textContent, filename, 'txt');
        
        // Create attachment
        const { AttachmentBuilder } = require('discord.js');
        const transcriptFile = new AttachmentBuilder(filepath, { name: filename });
        
        // Create log embed for manual deletion
        const logEmbed = new EmbedBuilder()
          .setTitle('🗑️ Ticket Manually Deleted')
          .setDescription(`**Channel:** ${channelName}\n**Opener:** <@${openerId}>\n**Deleted by:** <@${user.id}>`)
          .setColor('#ff0000')
          .setTimestamp()
          .setFooter({ text: 'Brawl Shop Ticket System' })
          .addFields({
            name: '📄 Transcript',
            value: 'Text transcript attached below',
            inline: false
          });
        
        // Send log with transcript
        await logChannel.send({
          embeds: [logEmbed],
          files: [transcriptFile]
        });
        
        console.log(`[TICKET_DELETE] Successfully generated and sent transcript for ${channelName}`);
      } else {
        console.error(`[TICKET_DELETE] Log channel ${logChannelId} not found`);
      }
    } catch (transcriptError) {
      console.error(`[TICKET_DELETE] Error generating transcript for manual deletion: ${transcriptError.message}`);
    }
    
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
    
    /* ---------------- Update DB ---------------- */
    try {
      const db = require('./database');
      if (db.isConnected) {
        await db.query(`DELETE FROM tickets WHERE channel_id=$1`, [channel.id]);
      }
    } catch (dbErr) {
      console.error('[TICKET_DELETE] Failed to delete ticket from DB:', dbErr.message);
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
  deleteTicket,
  handleUserMessage,
  handlePaymentCompleted
}; 