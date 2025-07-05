/**
 * Ticket manager class for handling ticket-related functions
 */
const { 
  ChannelType, 
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const config = require('../../config');

class TicketManager {
  constructor(client) {
    this.client = client;
    this.tickets = new Map();
  }

  /**
   * Create a new ticket channel
   * @param {Guild} guild - The guild to create the ticket in
   * @param {string} userId - The ID of the user who opened the ticket
   * @param {string} categoryId - The category ID to create the ticket in
   * @param {string} channelName - The name of the ticket channel
   * @param {Object} options - Additional options for the ticket
   * @returns {Promise<TextChannel|null>} The created channel or null if creation failed
   */
  async createTicket(guild, userId, categoryId = null, channelName, options = {}) {
    try {
      console.log(`[TICKET_MANAGER] Creating ticket: ${channelName} for user ${userId} in category ${categoryId || 'None'}`);
    
      // Prepare permissions for the ticket channel
      const permissionOverwrites = [
        // Default permissions - deny everyone
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        // User permissions
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ],
          deny: [
            PermissionFlagsBits.MentionEveryone
          ]
        }
      ];
      
      // Add staff roles
      [config.ROLES.OWNER_ROLE, config.ROLES.HEAD_ADMIN_ROLE, config.ROLES.ADMIN_ROLE].forEach(roleId => {
        if (roleId) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MentionEveryone
            ]
          });
        }
      });
      
      // Channel creation options
      const channelOptions = {
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites,
        topic: options.topic || `Ticket for <@${userId}>`
      };
      
      // Create in category if provided
      if (categoryId) {
        const category = await guild.channels.fetch(categoryId).catch(() => null);
        if (category) {
          channelOptions.parent = categoryId;
        } else {
          console.warn(`[TICKET_MANAGER] Category ${categoryId} not found, creating without category`);
  }
      }
      
      // Create the channel
      const channel = await guild.channels.create(channelOptions);
      
      // Store ticket info
      this.tickets.set(channel.id, {
        userId,
        channelId: channel.id,
        createdAt: Date.now(),
        type: options.type || 'general',
        data: options.data || {}
      });
      
      console.log(`[TICKET_MANAGER] Ticket created: ${channel.id}`);
      return channel;
    } catch (error) {
      console.error(`[TICKET_MANAGER] Error creating ticket: ${error.message}`);
      console.error(error.stack);
      return null;
    }
  }

  /**
   * Add a user to a ticket
   * @param {string} channelId - The ID of the ticket channel
   * @param {string} userId - The ID of the user to add
   * @param {Object} permissions - The permissions to give the user
   */
  async addUserToTicket(channelId, userId, permissions = {}) {
    try {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return false;
      }
      
      // Default permissions
      const defaultPermissions = {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      };
      
      // Merge with provided permissions
      const finalPermissions = { ...defaultPermissions, ...permissions };
      
      // Convert to Discord.js permission format
      await channel.permissionOverwrites.edit(userId, finalPermissions);
      
      return true;
    } catch (error) {
      console.error(`[TICKET_MANAGER] Error adding user to ticket: ${error.message}`);
      return false;
    }
  }

  /**
   * Close a ticket
   * @param {string} channelId - The ID of the ticket channel
   * @param {string} closedBy - The ID of the user who closed the ticket
   * @param {string} reason - The reason for closing
   */
  async closeTicket(channelId, closedBy, reason = '') {
    try {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        return false;
      }
      
      // Get ticket data
      const ticketData = this.tickets.get(channelId);
      if (!ticketData) {
        console.warn(`[TICKET_MANAGER] Ticket data not found for ${channelId}`);
      }
      
      // Send closing message
      const embed = new EmbedBuilder()
        .setTitle('Ticket Closed')
        .setDescription(`This ticket has been closed by <@${closedBy}>${reason ? `\nReason: ${reason}` : ''}`)
        .setColor(0xff0000)
        .setTimestamp();
      
      await channel.send({ embeds: [embed] }).catch(() => {});
      
      // Archive the channel (or delete based on settings)
      if (config.DELETE_CLOSED_TICKETS) {
        await channel.delete(`Ticket closed by ${closedBy}`).catch(err => {
          console.error(`[TICKET_MANAGER] Error deleting channel: ${err.message}`);
        });
      } else {
        // Archive the channel instead
        if (channel.parent && channel.parent.children) {
          // If there's an archive category, move it there
          const archiveCategoryId = config.ARCHIVE_CATEGORY_ID;
          if (archiveCategoryId) {
            const archiveCategory = await this.client.channels.fetch(archiveCategoryId).catch(() => null);
            if (archiveCategory) {
              await channel.setParent(archiveCategoryId, { lockPermissions: false }).catch(() => {});
            }
          }
          
          // Lock the channel
          await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            SendMessages: false
          }).catch(() => {});
          
          // Set archived in ticket data
          if (ticketData) {
            ticketData.closedAt = Date.now();
            ticketData.closedBy = closedBy;
            ticketData.reason = reason;
            ticketData.status = 'closed';
            this.tickets.set(channelId, ticketData);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[TICKET_MANAGER] Error closing ticket: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get ticket data
   * @param {string} channelId - The ID of the ticket channel
   * @returns {Object|null} The ticket data or null if not found
   */
  getTicketData(channelId) {
    return this.tickets.get(channelId) || null;
  }
}

module.exports = TicketManager;
