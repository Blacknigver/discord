// review.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  time,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const MOD_CHANNEL_ID = '1368186200741118042';
const REVIEW_CHANNEL_ID = '1293288484487954512';
const EMBED_COLOR       = '#E68DF2';
const LOGO_URL          = 'https://cdn.discordapp.com/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&format=webp';

// Users and roles with permission to moderate reviews
const ALLOWED_ROLES = ['1292933200389083196', '1358101527658627270'];
const ALLOWED_USERS = ['987751357773672538', '986164993080836096'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('Make a review for our services! You can also do this anonymously.')
    .addStringOption(option => 
      option.setName('reviewing_for')
            .setDescription('What are you reviewing for? Ex; Boost, Account, etc')
            .setRequired(true))
    .addStringOption(option => 
      option.setName('text')
            .setDescription('How was your experience with us? Please let us know')
            .setRequired(true))
    .addStringOption(option => 
      option.setName('rating')
            .setDescription('What do you rate us from 1-5?')
            .setRequired(true)
            .addChoices(
              { name: '⭐⭐⭐⭐⭐', value: '5' },
              { name: '⭐⭐⭐⭐', value: '4' },
              { name: '⭐⭐⭐', value: '3' },
              { name: '⭐⭐', value: '2' },
              { name: '⭐', value: '1' }
            ))
    .addAttachmentOption(option => 
      option.setName('image')
            .setDescription('Add an image as proof! (optional)')
            .setRequired(false))
    .addStringOption(option => 
      option.setName('anonymous')
            .setDescription('Post your review anonymously (HIGHLY PREFERRED NOT TO❗)')
            .setRequired(false)
            .addChoices(
              { name: 'Stay Anonymous (Preferably NOT)', value: 'anonymous' },
              { name: 'Include Username (PREFERRED❗)', value: 'username' }
            )),

  execute: async function(interaction) {
    try {
      // Get all the input values
      const reviewingFor = interaction.options.getString('reviewing_for');
      const experience = interaction.options.getString('text');
      const rating = interaction.options.getString('rating');
      const image = interaction.options.getAttachment('image');
      const anonymous = interaction.options.getString('anonymous') === 'anonymous';
      
      // Generate star display
      const stars = '⭐'.repeat(parseInt(rating));
      
      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTimestamp()
        .setFooter({
          text: 'Brawl Shop',
          iconURL: LOGO_URL
        });
      
      if (anonymous) {
        embed.setTitle('New Anonymous Review');
      } else {
        embed.setTitle('New Review');
        embed.setAuthor({
          name: `Review by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL()
        });
        
        // Always show profile picture in top right, regardless of image attachment
        embed.setThumbnail(interaction.user.displayAvatarURL());
      }
      
      embed.addFields(
        { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
        { name: '**Experience:**', value: `> ${experience}` },
        { name: '**Rating:**', value: `> ${stars}` }
      );
      
      // Add image if provided
      if (image) {
        embed.setImage(image.url);
      }
      
      // Create the moderation buttons
      const moderationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`review_accept_${interaction.user.id}_${anonymous}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`review_deny_${interaction.user.id}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );
      
      // Send to moderation channel first
      const modChannel = interaction.client.channels.cache.get(MOD_CHANNEL_ID);
      if (!modChannel) {
        console.error('Moderation channel not found');
        return interaction.reply({ content: 'There was an error submitting your review. Please try again later.', ephemeral: true });
      }
      
      await modChannel.send({ 
        content: `New review submitted by <@${interaction.user.id}>. Please moderate.`,
        embeds: [embed], 
        components: [moderationRow] 
      });
      
      // Confirm to the user
      await interaction.reply({ 
        content: 'Your review has been submitted for moderation. Thank you for your feedback!', 
        ephemeral: true 
      });
      
    } catch (error) {
      console.error('Error in review command:', error);
      await interaction.reply({ 
        content: 'There was an error submitting your review. Please try again later.', 
        ephemeral: true 
      });
    }
  },

  // Handle button interactions for the review system
  handleButton: async function(interaction) {
    try {
      // Check permissions
      const hasPermission = ALLOWED_USERS.includes(interaction.user.id) || 
                           ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
      
      if (!hasPermission) {
        return interaction.reply({ content: "You don't have permission to moderate reviews.", ephemeral: true });
      }
      
      const customId = interaction.customId;
      
      if (customId.startsWith('review_accept_')) {
        // Extract user ID and anonymous flag
        const parts = customId.split('_');
        const originalUserId = parts[2];
        const wasAnonymous = parts[3] === 'true';
        
        // Create a copy of the original embed
        const originalEmbed = interaction.message.embeds[0];
        const embed = EmbedBuilder.from(originalEmbed);
        
        // Create the "Order Now" button
        const orderRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Order Now')
            .setURL('https://discord.com/channels/1292895164595175444/1292896201859141722')
            .setStyle(ButtonStyle.Link)
        );
        
        // Send to the review channel
        const reviewChannel = interaction.client.channels.cache.get(REVIEW_CHANNEL_ID);
        if (!reviewChannel) {
          return interaction.reply({ content: 'Review channel not found.', ephemeral: true });
        }
        
        await reviewChannel.send({ embeds: [embed], components: [orderRow] });
        
        // Update the original message to show it was accepted
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('review_accepted')
            .setLabel('Review Accepted')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
        );
        
        await interaction.update({ 
          content: `Review accepted by <@${interaction.user.id}> and posted to <#${REVIEW_CHANNEL_ID}>.`,
          components: [disabledRow] 
        });
        
        return;
      }
      
      if (customId.startsWith('review_deny_')) {
        // Update the original message to show it was denied
        const deniedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('review_denied')
            .setLabel('This review has been denied')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );
        
        await interaction.update({ 
          content: `Review denied by <@${interaction.user.id}>.`,
          components: [deniedRow] 
        });
        
        return;
      }
    } catch (error) {
      console.error('Error handling review button:', error);
      await interaction.reply({ content: 'An error occurred while processing this action.', ephemeral: true });
    }
  }
}