const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generates a text transcript for a ticket channel
 * @param {TextChannel} channel - The channel to generate transcript for
 * @param {boolean} includeBots - Whether to include bot messages
 * @returns {Promise<string>} - The transcript content
 */
async function generateTextTranscript(channel, includeBots = false) {
  try {
    console.log(`[TRANSCRIPT] Starting transcript generation for channel ${channel.name} (${channel.id})`);
    
    // Fetch all messages from the channel
    const messages = [];
    let lastMessageId = null;
    
    while (true) {
      const fetchOptions = { limit: 100 };
      if (lastMessageId) {
        fetchOptions.before = lastMessageId;
      }
      
      const batch = await channel.messages.fetch(fetchOptions);
      if (batch.size === 0) break;
      
      messages.push(...batch.values());
      lastMessageId = batch.last().id;
    }
    
    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Filter out bot messages if requested
    const filteredMessages = includeBots ? messages : messages.filter(msg => !msg.author.bot);
    
    console.log(`[TRANSCRIPT] Fetched ${messages.length} messages, filtered to ${filteredMessages.length} (bots excluded: ${!includeBots})`);
    
    if (filteredMessages.length === 0) {
      return "No messages sent.";
    }
    
    // Generate transcript content
    let transcript = `=== TRANSCRIPT FOR ${channel.name.toUpperCase()} ===\n`;
    transcript += `Generated: ${new Date().toLocaleString()}\n`;
    transcript += `Channel: #${channel.name} (${channel.id})\n`;
    transcript += `Server: ${channel.guild.name}\n`;
    transcript += `Total Messages: ${filteredMessages.length}\n`;
    transcript += `\n${'='.repeat(50)}\n\n`;
    
    for (const message of filteredMessages) {
      const timestamp = message.createdAt.toLocaleString();
      const displayName = message.member?.displayName || message.author.username;
      
      transcript += `[${timestamp}] ${displayName}: ${message.content}\n`;
      
      // Add attachment info
      if (message.attachments.size > 0) {
        message.attachments.forEach(attachment => {
          transcript += `  📎 Attachment: ${attachment.name} (${attachment.url})\n`;
        });
      }
      
      // Add embed info
      if (message.embeds.length > 0) {
        message.embeds.forEach(embed => {
          transcript += `  📋 Embed: ${embed.title || 'No title'}\n`;
          if (embed.description) {
            transcript += `      ${embed.description.substring(0, 100)}${embed.description.length > 100 ? '...' : ''}\n`;
          }
        });
      }
    }
    
    transcript += `\n${'='.repeat(50)}\n`;
    transcript += `End of transcript - ${filteredMessages.length} messages\n`;
    
    console.log(`[TRANSCRIPT] Successfully generated TXT transcript (${transcript.length} characters)`);
    return transcript;
    
  } catch (error) {
    console.error(`[TRANSCRIPT] Error generating text transcript: ${error.message}`);
    return `Error generating transcript: ${error.message}`;
  }
}

/**
 * Generates an HTML transcript for a ticket channel
 * @param {TextChannel} channel - The channel to generate transcript for
 * @param {boolean} includeBots - Whether to include bot messages
 * @returns {Promise<string>} - The HTML transcript content
 */
async function generateHTMLTranscript(channel, includeBots = false) {
  try {
    console.log(`[TRANSCRIPT] Starting HTML transcript generation for channel ${channel.name} (${channel.id})`);
    
    // Fetch all messages from the channel
    const messages = [];
    let lastMessageId = null;
    
    while (true) {
      const fetchOptions = { limit: 100 };
      if (lastMessageId) {
        fetchOptions.before = lastMessageId;
      }
      
      const batch = await channel.messages.fetch(fetchOptions);
      if (batch.size === 0) break;
      
      messages.push(...batch.values());
      lastMessageId = batch.last().id;
    }
    
    // Sort messages by timestamp (oldest first)
    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Filter out bot messages if requested
    const filteredMessages = includeBots ? messages : messages.filter(msg => !msg.author.bot);
    
    console.log(`[TRANSCRIPT] Fetched ${messages.length} messages, filtered to ${filteredMessages.length} (bots excluded: ${!includeBots})`);
    
    if (filteredMessages.length === 0) {
      return generateEmptyHTMLTranscript(channel);
    }
    
    // Generate HTML content
    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcript - ${channel.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #36393f; color: #dcddde; }
        .header { background-color: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-left: 3px solid #7289da; background-color: #40444b; border-radius: 4px; }
        .author { font-weight: bold; color: #7289da; }
        .timestamp { color: #72767d; font-size: 0.8em; }
        .content { margin: 5px 0; }
        .attachment { color: #00b0f4; margin: 5px 0; }
        .embed { background-color: #2f3136; border-left: 4px solid #7289da; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .embed-title { font-weight: bold; color: #ffffff; }
        .embed-description { color: #dcddde; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Transcript for #${channel.name}</h1>
        <p><strong>Server:</strong> ${channel.guild.name}</p>
        <p><strong>Channel ID:</strong> ${channel.id}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Messages:</strong> ${filteredMessages.length}</p>
    </div>
    <div class="messages">`;
    
    for (const message of filteredMessages) {
      const timestamp = message.createdAt.toLocaleString();
      const displayName = message.member?.displayName || message.author.username;
      const avatarUrl = message.author.displayAvatarURL();
      
      html += `
        <div class="message">
            <div class="author">
                <img src="${avatarUrl}" alt="${displayName}" style="width: 20px; height: 20px; border-radius: 50%; margin-right: 8px;">
                ${displayName}
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="content">${escapeHtml(message.content)}</div>`;
      
      // Add attachments
      if (message.attachments.size > 0) {
        message.attachments.forEach(attachment => {
          html += `<div class="attachment">📎 <a href="${attachment.url}" target="_blank">${attachment.name}</a></div>`;
        });
      }
      
      // Add embeds
      if (message.embeds.length > 0) {
        message.embeds.forEach(embed => {
          html += `<div class="embed">`;
          if (embed.title) {
            html += `<div class="embed-title">${escapeHtml(embed.title)}</div>`;
          }
          if (embed.description) {
            html += `<div class="embed-description">${escapeHtml(embed.description)}</div>`;
          }
          html += `</div>`;
        });
      }
      
      html += `</div>`;
    }
    
    html += `
    </div>
    <div class="header" style="margin-top: 20px;">
        <p>End of transcript - ${filteredMessages.length} messages</p>
    </div>
</body>
</html>`;
    
    console.log(`[TRANSCRIPT] Successfully generated HTML transcript (${html.length} characters)`);
    return html;
    
  } catch (error) {
    console.error(`[TRANSCRIPT] Error generating HTML transcript: ${error.message}`);
    return `<html><body><h1>Error generating transcript</h1><p>${error.message}</p></body></html>`;
  }
}

/**
 * Generates an empty HTML transcript
 * @param {TextChannel} channel - The channel
 * @returns {string} - Empty HTML transcript
 */
function generateEmptyHTMLTranscript(channel) {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcript - ${channel.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #36393f; color: #dcddde; }
        .header { background-color: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Transcript for #${channel.name}</h1>
        <p><strong>Server:</strong> ${channel.guild.name}</p>
        <p><strong>Channel ID:</strong> ${channel.id}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Messages:</strong> 0</p>
        <p style="color: #faa61a; margin-top: 20px;">No messages were sent in this ticket.</p>
    </div>
</body>
</html>`;
}

/**
 * Escapes HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Saves transcript to file and returns file path
 * @param {string} content - Transcript content
 * @param {string} filename - Filename without extension
 * @param {string} format - 'txt' or 'html'
 * @returns {Promise<string>} - File path
 */
async function saveTranscriptToFile(content, filename, format = 'txt') {
  try {
    // Ensure transcripts directory exists
    const transcriptsDir = path.join(__dirname, '../../transcripts');
    try {
      await fs.mkdir(transcriptsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
    
    const filePath = path.join(transcriptsDir, `${filename}.${format}`);
    await fs.writeFile(filePath, content, 'utf8');
    
    console.log(`[TRANSCRIPT] Saved transcript to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`[TRANSCRIPT] Error saving transcript: ${error.message}`);
    throw error;
  }
}

/**
 * Generates transcript and DMs it to user
 * @param {TextChannel} channel - The channel to generate transcript for
 * @param {string} userId - User ID to DM the transcript to
 * @param {Client} client - Discord client
 * @param {string} reason - Reason for closing (optional)
 * @returns {Promise<boolean>} - Success status
 */
async function generateAndDMTranscript(channel, userId, client, reason = '') {
  try {
    console.log(`[TRANSCRIPT_DM] Generating transcript for channel ${channel.name} to DM user ${userId}`);
    
    // Generate text transcript
    const textContent = await generateTextTranscript(channel, false);
    
    // Save to file
    const filename = `${channel.name}-${Date.now()}`;
    const filePath = await saveTranscriptToFile(textContent, filename, 'txt');
    
    // Get user and send DM
    const user = await client.users.fetch(userId);
    if (!user) {
      console.error(`[TRANSCRIPT_DM] Could not fetch user ${userId}`);
      return false;
    }
    
    // Create attachment
    const attachment = new AttachmentBuilder(filePath, { name: `${filename}.txt` });
    
    // Send DM
    const dmMessage = reason 
      ? `**Your ticket has been closed, here is your transcript:**\n\n**Reason:** ${reason}`
      : `**Your ticket has been closed, here is your transcript:**`;
    
    await user.send({
      content: dmMessage,
      files: [attachment]
    });
    
    console.log(`[TRANSCRIPT_DM] Successfully sent transcript to user ${userId}`);
    
    // Clean up file after sending
    try {
      await fs.unlink(filePath);
      console.log(`[TRANSCRIPT_DM] Cleaned up transcript file ${filePath}`);
    } catch (cleanupError) {
      console.error(`[TRANSCRIPT_DM] Error cleaning up file: ${cleanupError.message}`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`[TRANSCRIPT_DM] Error generating and DMing transcript: ${error.message}`);
    return false;
  }
}

/**
 * Generates transcript and logs it to a channel
 * @param {TextChannel} channel - The channel to generate transcript for
 * @param {string} userId - User ID who the ticket belongs to
 * @param {Client} client - Discord client
 * @param {string} reason - Reason for closing
 * @param {string} logChannelId - Channel ID to log the transcript to
 * @returns {Promise<boolean>} - Success status
 */
async function generateAndLogTranscript(channel, userId, client, reason, logChannelId) {
  try {
    console.log(`[TRANSCRIPT_LOG] Generating transcript for channel ${channel.name} to log in ${logChannelId}`);
    
    // Generate HTML transcript
    const htmlContent = await generateHTMLTranscript(channel, false);
    
    // Save to file
    const filename = `${channel.name}-${Date.now()}`;
    const filePath = await saveTranscriptToFile(htmlContent, filename, 'html');
    
    // Get log channel
    const logChannel = client.channels.cache.get(logChannelId);
    if (!logChannel) {
      console.error(`[TRANSCRIPT_LOG] Log channel ${logChannelId} not found`);
      return false;
    }
    
    // Create log embed
    const logEmbed = new EmbedBuilder()
      .setTitle('🔒 Ticket Closed')
      .setDescription(`**Channel:** ${channel.name}\n**User:** <@${userId}>\n**Reason:** ${reason || 'No reason provided'}`)
      .setColor('#ff6b6b')
      .setTimestamp()
      .setFooter({ text: 'Brawl Shop Ticket System' });
    
    // Create attachment
    const attachment = new AttachmentBuilder(filePath, { name: `${filename}.html` });
    
    // Send to log channel
    await logChannel.send({
      embeds: [logEmbed],
      files: [attachment]
    });
    
    console.log(`[TRANSCRIPT_LOG] Successfully logged transcript to channel ${logChannelId}`);
    
    // Clean up file after sending
    try {
      await fs.unlink(filePath);
      console.log(`[TRANSCRIPT_LOG] Cleaned up transcript file ${filePath}`);
    } catch (cleanupError) {
      console.error(`[TRANSCRIPT_LOG] Error cleaning up file: ${cleanupError.message}`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`[TRANSCRIPT_LOG] Error generating and logging transcript: ${error.message}`);
    return false;
  }
}

module.exports = {
  generateTextTranscript,
  generateHTMLTranscript,
  saveTranscriptToFile,
  generateAndDMTranscript,
  generateAndLogTranscript
}; 