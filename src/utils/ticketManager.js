const { ChannelType, PermissionsBitField, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { TICKET_CATEGORIES, STAFF_ROLES, AUTO_CLOSE_LOG_CHANNEL, MAX_TICKETS_PER_USER, MAX_TICKET_PANEL_TICKETS, MAX_PURCHASE_TICKETS } = require('../constants');

class TicketData {
  constructor(openerId, channelId, channelName, openTime) {
    this.openerId = openerId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.openTime = openTime;
    this.msgCount = 0;
    this.lastOpenerMsgTime = openTime;
    this.noMsgReminderSent = false;
    this.reminder6hSent = false;
    this.reminder12hSent = false;
    this.reminder24hSent = false;
    this.closed = false;
  }
}

const ticketDataMap = new Map();

function isCategoryFull(categoryId, guild) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return false;
  return category.children.cache.size >= 50;
}

async function createTicketChannelWithOverflow(interaction, categoryId, answers) {
  const { guild, user } = interaction;
  try {
    const existingTickets = guild.channels.cache.filter(ch =>
      ch.type === ChannelType.GuildText && ch.name.startsWith(`ticket-${user.username}-`)
    );
    const hasOverflowUser = existingTickets.size >= MAX_TICKETS_PER_USER;
    const categoryFull = isCategoryFull(categoryId, guild);
    const parentToUse = (hasOverflowUser || categoryFull) ? null : categoryId;
    const channelName = `ticket-${user.username}-${Math.floor(Math.random() * 1000)}`;

    const validStaffRoles = [];
    for (const roleId of STAFF_ROLES) {
      const role = guild.roles.cache.get(roleId);
      if (role) {
        validStaffRoles.push({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        });
      }
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentToUse,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        ...validStaffRoles
      ]
    });

    const mentionText = `<@${user.id}>`;
    const welcomeEmbed = new EmbedBuilder().setDescription('Welcome, thanks for opening a ticket!\n\n**Support will be with you shortly.**\n\nIf there is any more details or information you would like to share, feel free to do so!');
    const closeBtnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setEmoji('<:Lock:1349157009244557384>')
        .setStyle(ButtonStyle.Danger)
    );
    await ticketChannel.send({ content: mentionText, embeds: [welcomeEmbed], components: [closeBtnRow] });

    if (answers && answers.length > 0) {
      const recapEmbed = new EmbedBuilder()
        .setTitle('Order Recap')
        .setColor(0x2b2d31)
        .addFields(answers.map(([name, value]) => ({ name, value })));
      await ticketChannel.send({ embeds: [recapEmbed] });
    }

    ticketDataMap.set(ticketChannel.id, new TicketData(user.id, ticketChannel.id, channelName, Date.now()));
    return interaction.reply({ content: `Ticket created: <#${ticketChannel.id}>`, ephemeral: true });
  } catch (err) {
    console.error('[TICKET ERROR]', err);
    return interaction.reply({ content: 'Failed to create ticket channel. Please contact staff.', ephemeral: true });
  }
}

async function sendNoMsgReminder(channel, openerId, soFar, left) {
  try {
    const embed = new EmbedBuilder()
      .setDescription(`<@${openerId}>, you haven't sent a message in this ticket for **${soFar}** hours. If you don't send a message in the next **${left}** hours, this ticket will be automatically closed.`)
      .setColor(0x2b2d31);
    await channel.send({ content: `<@${openerId}>`, embeds: [embed] });
  } catch (err) {
    console.error('[REMINDER ERROR]', err);
  }
}

async function sendInactivityReminder(channel, openerId) {
  try {
    const embed = new EmbedBuilder()
      .setDescription(`<@${openerId}>, there has been no activity in this ticket for 24 hours. If there is no activity in the next 24 hours, this ticket will be automatically closed.`)
      .setColor(0x2b2d31);
    await channel.send({ content: `<@${openerId}>`, embeds: [embed] });
  } catch (err) {
    console.error('[REMINDER ERROR]', err);
  }
}

async function autoCloseLog(channel, userId, channelName, reason) {
  try {
    const logChannel = channel.guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('Ticket Auto-Closed')
        .setColor(0x2b2d31)
        .addFields(
          { name: 'Channel', value: channelName, inline: true },
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Reason', value: reason, inline: true }
        );
      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[AUTO-CLOSE LOG ERROR]', err);
  }
}

async function autoCloseLogAndDelete(channel, userId, channelName, reason) {
  await autoCloseLog(channel, userId, channelName, reason);
  try {
    await channel.delete();
  } catch (err) {
    console.error('[CHANNEL DELETE ERROR]', err);
  }
}

async function checkTicketTimeouts(client) {
  const now = Date.now();
  for (const [channelId, data] of ticketDataMap.entries()) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel) {
        ticketDataMap.delete(channelId);
        continue;
      }

      const timeSinceLastMsg = now - data.lastOpenerMsgTime;
      const hoursSinceLastMsg = timeSinceLastMsg / (1000 * 60 * 60);

      if (data.msgCount === 0 && !data.noMsgReminderSent && hoursSinceLastMsg >= 6) {
        await sendNoMsgReminder(channel, data.openerId, 6, 6);
        data.noMsgReminderSent = true;
      } else if (data.msgCount === 0 && hoursSinceLastMsg >= 12) {
        await autoCloseLogAndDelete(channel, data.openerId, data.channelName, 'No messages sent within 12 hours');
        ticketDataMap.delete(channelId);
      } else if (data.msgCount > 0) {
        if (!data.reminder6hSent && hoursSinceLastMsg >= 6) {
          await sendInactivityReminder(channel, data.openerId);
          data.reminder6hSent = true;
        } else if (!data.reminder12hSent && hoursSinceLastMsg >= 12) {
          await sendInactivityReminder(channel, data.openerId);
          data.reminder12hSent = true;
        } else if (!data.reminder24hSent && hoursSinceLastMsg >= 24) {
          await sendInactivityReminder(channel, data.openerId);
          data.reminder24hSent = true;
        } else if (hoursSinceLastMsg >= 48) {
          await autoCloseLogAndDelete(channel, data.openerId, data.channelName, 'No activity for 48 hours');
          ticketDataMap.delete(channelId);
        }
      }
    } catch (err) {
      console.error(`[TICKET TIMEOUT CHECK ERROR] Channel ${channelId}:`, err);
    }
  }
}

async function checkTicketLimits(userId, category) {
  // Count open tickets for the user from the ticketDataMap
  let userTickets = [];
  
  // Collect all tickets for this user from the map
  for (const [channelId, data] of ticketDataMap.entries()) {
    if (data.openerId === userId && !data.closed) {
      userTickets.push(data);
    }
  }

  // Count tickets by category
  const ticketPanelTickets = userTickets.filter(t => 
    !t.channelName.includes('purchase-account') && 
    !t.channelName.includes('add-') && 
    !t.channelName.includes('friendlist-')
  ).length;

  const purchaseTickets = userTickets.filter(t => 
    t.channelName.includes('purchase-account')
  ).length;

  console.log(`[TICKET LIMITS] User ${userId} has ${ticketPanelTickets} ticket panel tickets and ${purchaseTickets} purchase tickets`);

  // Check limits based on category
  if (category === 'purchase-account') {
    if (purchaseTickets >= MAX_PURCHASE_TICKETS) {
      return {
        allowed: false,
        embed: {
          color: 0xFF0000,
          title: 'Ticket Limit',
          description: 'You currently have too many tickets opened.\n\nPlease close your previous tickets to continue.'
        }
      };
    }
  } else {
    if (ticketPanelTickets >= MAX_TICKET_PANEL_TICKETS) {
      return {
        allowed: false,
        embed: {
          color: 0xFF0000,
          title: 'Ticket Limit',
          description: 'You currently have too many tickets opened.\n\nPlease close your previous tickets to continue.'
        }
      };
    }
  }

  return { allowed: true };
}

async function createTicket(interaction, category, answers = []) {
  try {
    // First, check if user is at their ticket limit
    const userId = interaction.user.id;
    const limitCheck = await checkTicketLimits(userId, category);
    
    if (!limitCheck.allowed) {
      return interaction.reply({ 
        embeds: [new EmbedBuilder()
          .setColor(limitCheck.embed.color)
          .setTitle(limitCheck.embed.title)
          .setDescription(limitCheck.embed.description)
        ], 
        ephemeral: true 
      });
    }
    
    // Get the category channel ID
    const categoryId = TICKET_CATEGORIES[category];
    if (!categoryId) {
      console.error(`[TICKET ERROR] Invalid category: ${category}`);
      return interaction.reply({ 
        content: 'Invalid ticket category. Please try again or contact staff.', 
        ephemeral: true 
      });
    }
    
    // Create the ticket channel
    return createTicketChannelWithOverflow(interaction, categoryId, answers);
  } catch (error) {
    console.error(`[TICKET ERROR] Error creating ticket:`, error);
    return interaction.reply({ 
      content: 'An error occurred while creating your ticket. Please try again or contact staff.', 
      ephemeral: true 
    });
  }
}

// Function to mark a ticket as closed in the map
function markTicketAsClosed(channelId) {
  const ticketData = ticketDataMap.get(channelId);
  if (ticketData) {
    ticketData.closed = true;
    ticketDataMap.set(channelId, ticketData);
    return true;
  }
  return false;
}

// Function to update the message count for a user
function updateTicketMessageCount(channelId, userId) {
  const ticketData = ticketDataMap.get(channelId);
  if (ticketData && ticketData.openerId === userId) {
    ticketData.msgCount++;
    ticketData.lastOpenerMsgTime = Date.now();
    ticketDataMap.set(channelId, ticketData);
    return true;
  }
  return false;
}

module.exports = {
  TicketData,
  ticketDataMap,
  isCategoryFull,
  createTicketChannelWithOverflow,
  sendNoMsgReminder,
  sendInactivityReminder,
  autoCloseLog,
  autoCloseLogAndDelete,
  checkTicketTimeouts,
  checkTicketLimits,
  createTicket,
  markTicketAsClosed,
  updateTicketMessageCount
}; 