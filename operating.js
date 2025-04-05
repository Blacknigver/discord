/********************************************************************
 * operating.js
 * Houses the auto-close logic (TicketData, ticketDataMap, presence
 * update, message counting, role checks, fallback category logic if
 * any), etc.
 ********************************************************************/

const {
  ChannelType,
  EmbedBuilder
} = require('discord.js');

// EXACT from your posted code
const CATEGORY_LIMIT = 25; // Max channels per category (unchanged from old code)
const AUTO_CLOSE_LOG_CHANNEL = '1354587880382795836';

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

// Utility function
function isCategoryFull(categoryId, guild) {
  const category = guild.channels.cache.get(categoryId);
  if (!category) return false;
  return category.children.cache.size >= CATEGORY_LIMIT;
}

async function autoCloseLog(channel, openerId, channelName, afterLabel) {
  const guild = channel.guild;
  if (!guild) return;
  const logChannel = guild.channels.cache.get(AUTO_CLOSE_LOG_CHANNEL);
  if (!logChannel) return;
  await logChannel.send({
    content: `**Ticket Closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed After: ${afterLabel}`
  });
}

async function autoCloseLogAndDelete(channel, openerId, channelName, reason) {
  try {
    await channel.send({
      content: `**Ticket auto-closed**\nUser: <@${openerId}>\nTicket Name: ${channelName}\nClosed Because: ${reason}`
    });
  } catch {/* ignore */}
  await autoCloseLog(channel, openerId, channelName, reason);
  await channel.delete().catch(() => {});
}

// presence updates or presence logs if you wish
function registerOperatingLogic(client) {
  // presenceUpdate from old code
  client.on('presenceUpdate', async (oldPresence, newPresence) => {
    if (!newPresence || !newPresence.member) return;
    const member = newPresence.member;
    if (!member.manageable) return;
    if (newPresence.status === "offline") return;
    // BRAWLSHOP_AD_ROLE = '1351998501982048346' from old code
    let foundLink = false;
    if (newPresence.activities) {
      for (const act of newPresence.activities) {
        if (act.state && act.state.toLowerCase().includes('discord.gg/brawlshop')) {
          foundLink = true;
          break;
        }
      }
    }
    if (foundLink && !member.roles.cache.has('1351998501982048346')) {
      await member.roles.add('1351998501982048346').catch(() => {});
    }
  });

  // For the auto-close check
  setInterval(() => {
    checkTicketTimeouts(client);
  }, 60 * 1000);

  // Count messages from opener
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

  // If opener leaves => auto close
  client.on('guildMemberRemove', async (member) => {
    const userId = member.id;
    for (const [channelId, data] of ticketDataMap.entries()) {
      if (data.openerId === userId) {
        const channel = member.guild.channels.cache.get(channelId);
        if (channel) {
          await autoCloseLogAndDelete(channel, userId, data.channelName, 'User left the server.');
        }
        ticketDataMap.delete(channelId);
      }
    }
  });
}

async function checkTicketTimeouts(client) {
  const now = Date.now();
  const guild = client.guilds.cache.first();
  if (!guild) return;

  for (const [channelId, data] of ticketDataMap.entries()) {
    const { openerId, channelName, openTime, msgCount, lastOpenerMsgTime } = data;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      ticketDataMap.delete(channelId);
      continue;
    }
    const openerMember = guild.members.cache.get(openerId);
    if (!openerMember) {
      // user left
      await autoCloseLogAndDelete(channel, openerId, channelName, `User left the server (was: unknown).`);
      ticketDataMap.delete(channelId);
      continue;
    }
    if (msgCount === 0) {
      const hoursSinceOpen = (now - openTime) / (1000 * 60 * 60);
      if (hoursSinceOpen >= 6 && !data.reminder6hSent) {
        data.reminder6hSent = true;
        await sendNoMsgReminder(channel, openerId, 6, 18);
      }
      if (hoursSinceOpen >= 12 && !data.reminder12hSent) {
        data.reminder12hSent = true;
        await sendNoMsgReminder(channel, openerId, 12, 12);
      }
      if (hoursSinceOpen >= 24) {
        await autoCloseLogAndDelete(channel, openerId, channelName, '24 hours (no user messages).');
        ticketDataMap.delete(channelId);
      }
    } else {
      // user has msg
      const hoursInactive = (now - lastOpenerMsgTime) / (1000 * 60 * 60);
      if (hoursInactive >= 24 && hoursInactive < 48 && !data.reminder24hSent) {
        data.reminder24hSent = true;
        await sendInactivityReminder(channel, openerId);
      }
      if (hoursInactive >= 48) {
        await autoCloseLogAndDelete(channel, openerId, channelName, '48 hours (no user messages).');
        ticketDataMap.delete(channelId);
      }
    }
  }
}

async function sendNoMsgReminder(channel, openerId, hoursSoFar, hoursLeft) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(
      `${mention} - You have not sent a single message for **${hoursSoFar} hours**, ` +
      `please send a message within the next **${hoursLeft} hours** or your ticket will be closed.`
    );
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}
async function sendInactivityReminder(channel, openerId) {
  const mention = `<@${openerId}>`;
  const embed = new EmbedBuilder()
    .setTitle('Close Reminder')
    .setDescription(
      `${mention} - You have not sent a message for 24 hours, ` +
      `please send a message within the next 24 hours or your ticket will be closed.`
    );
  await channel.send({ content: mention, embeds: [embed] }).catch(() => {});
}

module.exports = {
  registerOperatingLogic,
  TicketData,
  ticketDataMap,
  isCategoryFull,
  autoCloseLogAndDelete
};
