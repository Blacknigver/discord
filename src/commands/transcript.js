const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Generate a text transcript for the current ticket channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  
  async execute(interaction) {
    try {
      // Check if user has permission (staff roles)
      const STAFF_ROLES = [
        '1292933200389083196', // Owner role
        '1358101527658627270', // Head Admin role
        '1292933924116500532', // Admin role
      ];
      
      const hasPermission = STAFF_ROLES.some(roleId => 
        interaction.member.roles.cache.has(roleId)
      );
      
      if (!hasPermission) {
        return interaction.reply({
          content: '❌ You do not have permission to use this command.',
          ephemeral: true
        });
      }
      
      // Check if this is a ticket channel
      const channel = interaction.channel;
      const isTicketChannel = channel.name.includes('ticket') || 
                             channel.name.includes('ranked') || 
                             channel.name.includes('trophy') || 
                             channel.name.includes('bulk') || 
                             channel.name.includes('other') ||
                             channel.name.includes('profile');
      
      if (!isTicketChannel) {
        return interaction.reply({
          content: '❌ This command can only be used in ticket channels.',
          ephemeral: true
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      console.log(`[TRANSCRIPT_CMD] Staff ${interaction.user.id} requested transcript for ${channel.name}`);
      
      // Generate transcript
      const { generateTextTranscript, saveTranscriptToFile } = require('../utils/transcriptGenerator.js');
      
      const textContent = await generateTextTranscript(channel, false);
      
      // Save transcript to file
      const filename = `transcript.txt`;
      const filepath = await saveTranscriptToFile(textContent, filename, 'txt');
      
      // Create attachment
      const transcriptFile = new AttachmentBuilder(filepath, { name: filename });
      
      // Send transcript as attachment
      await interaction.editReply({
        content: `✅ Transcript generated successfully for **#${channel.name}**`,
        files: [transcriptFile]
      });
      
      console.log(`[TRANSCRIPT_CMD] Successfully generated manual transcript: ${filename}`);
      
    } catch (error) {
      console.error(`[TRANSCRIPT_CMD] Error generating manual transcript: ${error.message}`);
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ An error occurred while generating the transcript. Please try again.',
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while generating the transcript. Please try again.',
          ephemeral: true
        });
      }
    }
  },
}; 