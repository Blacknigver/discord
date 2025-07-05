const { 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

/**
 * Handles the Review button
 */
const reviewButtonHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customId = interaction.customId;
    const allowedUserId = customId.split('_').pop();
    
    console.log(`[REVIEW] Button clicked by ${interaction.user.id}, allowed user is ${allowedUserId}`);
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      console.log(`[REVIEW] User ${interaction.user.id} is not allowed to use this button (expecting ${allowedUserId})`);
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Store default information for the review
    if (!interaction.client.reviewData) {
      interaction.client.reviewData = {};
    }
    
    // Initialize data for this user
    interaction.client.reviewData[allowedUserId] = {
      stars: '',
      anonymous: false
    };
    
    // Get service name from the ticket
    let reviewingFor = 'Boost Service';
    try {
      const ticketName = interaction.channel.name;
      
      // Extract service type from ticket name
      if (ticketName.includes('rank') || ticketName.includes('ranked')) {
        reviewingFor = 'Ranked Boost';
      } else if (ticketName.includes('trophy') || ticketName.includes('trophies')) {
        reviewingFor = 'Trophy Boost';
      } else if (ticketName.includes('master') || ticketName.includes('mastery')) {
        reviewingFor = 'Mastery Boost';
      }
    } catch (error) {
      console.error(`[REVIEW] Error determining service type: ${error.message}`);
    }
    
    // Store the service name
    interaction.client.reviewData[allowedUserId].reviewingFor = reviewingFor;
    
    // Create the rating embed
    const ratingEmbed = new EmbedBuilder()
      .setTitle('Review Rating')
      .setDescription(`Please rate your experience with our ${reviewingFor}:`)
      .setColor('#e68df2');
    
    // Create star rating buttons
    const star1 = new ButtonBuilder()
      .setCustomId(`review_star_1_${allowedUserId}`)
      .setLabel('1⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star2 = new ButtonBuilder()
      .setCustomId(`review_star_2_${allowedUserId}`)
      .setLabel('2⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star3 = new ButtonBuilder()
      .setCustomId(`review_star_3_${allowedUserId}`)
      .setLabel('3⭐')
      .setStyle(ButtonStyle.Primary);
    
    const star4 = new ButtonBuilder()
      .setCustomId(`review_star_4_${allowedUserId}`)
      .setLabel('4⭐')
      .setStyle(ButtonStyle.Success);
    
    const star5 = new ButtonBuilder()
      .setCustomId(`review_star_5_${allowedUserId}`)
      .setLabel('5⭐')
      .setStyle(ButtonStyle.Success);
    
    // Create button row
    const row = new ActionRowBuilder()
      .addComponents(star1, star2, star3, star4, star5);
    
    // Send the rating message
    await interaction.reply({
      embeds: [ratingEmbed],
      components: [row],
      ephemeral: true
    });
    
    console.log(`[REVIEW] Showed rating stars to user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[REVIEW] Error in reviewButtonHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your review request.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the star rating selection
 */
const reviewStarHandler = async (interaction) => {
  try {
    // Extract the star rating and user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const rating = customIdParts[2];
    const allowedUserId = customIdParts[3];
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Store the rating in a temporary variable for later use
    interaction.client.reviewData = interaction.client.reviewData || {};
    interaction.client.reviewData[allowedUserId] = {
      rating: rating
    };
    
    // Create the anonymous choice embed
    const anonymousEmbed = new EmbedBuilder()
      .setTitle('Anonymous')
      .setDescription('Would you like to stay anonymous?\n\n**We highly prefer it if you include your username!**')
      .setColor('#e68df2');
    
    // Create buttons for anonymous choice
    const includeUsernameButton = new ButtonBuilder()
      .setCustomId(`review_username_${allowedUserId}`)
      .setLabel('Include Username')
      .setStyle(ButtonStyle.Success);
    
    const stayAnonymousButton = new ButtonBuilder()
      .setCustomId(`review_anonymous_${allowedUserId}`)
      .setLabel('Stay Anonymous')
      .setStyle(ButtonStyle.Danger);
    
    const anonymousRow = new ActionRowBuilder()
      .addComponents(includeUsernameButton, stayAnonymousButton);
    
    // Update the message with the anonymous choice embed
    await interaction.update({
      embeds: [anonymousEmbed],
      components: [anonymousRow]
    });
  } catch (error) {
    console.error(`[REVIEW] Error in reviewStarHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your rating.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the anonymous choice selection
 */
const reviewAnonymousHandler = async (interaction) => {
  try {
    // Extract the choice and user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const choice = customIdParts[1]; // "username" or "anonymous"
    const allowedUserId = customIdParts[2];
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Update the stored data with the anonymity choice
    if (!interaction.client.reviewData || !interaction.client.reviewData[allowedUserId]) {
      return interaction.reply({
        content: 'An error occurred. Please start the review process again.',
        ephemeral: true
      });
    }
    
    interaction.client.reviewData[allowedUserId].anonymous = (choice === 'anonymous');
    
    // Get the channel topic to extract boost information
    const channelTopic = interaction.channel.topic || '';
    let reviewingFor = '';
    
    // Try to extract boost information from the channel topic
    if (channelTopic.includes('Trophies')) {
      const trophiesMatch = channelTopic.match(/(\d+)\s*Trophies\s*to\s*(\d+)/i);
      if (trophiesMatch) {
        reviewingFor = `${trophiesMatch[1]} Trophies to ${trophiesMatch[2]} Trophies Boost!`;
      }
    } else if (channelTopic.includes('Rank')) {
      const rankMatch = channelTopic.match(/([A-Za-z]+\s*\d*)\s*to\s*([A-Za-z]+\s*\d*)/i);
      if (rankMatch) {
        reviewingFor = `${rankMatch[1]} to ${rankMatch[2]} Boost!`;
      }
    }
    
    if (!reviewingFor) {
      reviewingFor = 'Boost Service';
    }
    
    // Create a modal for the review
    const modal = new ModalBuilder()
      .setCustomId(`review_modal_${allowedUserId}_${choice}`)
      .setTitle('Review Form');
    
    // Add review fields
    const reviewingForInput = new TextInputBuilder()
      .setCustomId('reviewing_for')
      .setLabel('Reviewing For')
      .setValue(reviewingFor)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const experienceInput = new TextInputBuilder()
      .setCustomId('experience')
      .setLabel('Experience')
      .setPlaceholder('Let us know how your boost went!')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    // Add inputs to modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(reviewingForInput),
      new ActionRowBuilder().addComponents(experienceInput)
    );
    
    // Show the modal
    await interaction.showModal(modal);
  } catch (error) {
    console.error(`[REVIEW] Error in reviewAnonymousHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your choice.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the review modal submission
 */
const reviewModalHandler = async (interaction) => {
  try {
    // Extract the user ID and choice from the custom ID
    const customIdParts = interaction.customId.split('_');
    const allowedUserId = customIdParts[2];
    const choice = customIdParts[3]; // "username" or "anonymous"
    
    // Check if the user is allowed
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can submit this form.',
        ephemeral: true
      });
    }
    
    // Get the form values
    const reviewingFor = interaction.fields.getTextInputValue('reviewing_for');
    const experience = interaction.fields.getTextInputValue('experience');
    
    // Get the stored rating
    if (!interaction.client.reviewData || !interaction.client.reviewData[allowedUserId]) {
      return interaction.reply({
        content: 'An error occurred. Please start the review process again.',
        ephemeral: true
      });
    }
    
    const rating = interaction.client.reviewData[allowedUserId].rating;
    const anonymous = (choice === 'anonymous');
    
    // Generate star display
    const stars = '⭐'.repeat(parseInt(rating));
    
    // Create the review embed
    const reviewEmbed = new EmbedBuilder()
      .setColor('#E68DF2')
      .setTimestamp()
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://cdn.discordapp.com/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&format=webp'
      });
    
    if (anonymous) {
      reviewEmbed.setTitle('New Anonymous Review');
    } else {
      reviewEmbed.setTitle('New Review');
      reviewEmbed.setAuthor({
        name: `Review by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      });
      
      reviewEmbed.setThumbnail(interaction.user.displayAvatarURL());
    }
    
    reviewEmbed.addFields(
      { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
      { name: '**Experience:**', value: `> ${experience}` },
      { name: '**Rating:**', value: `> ${stars}` }
    );
    
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
    
    // Send to moderation channel
    const modChannel = interaction.client.channels.cache.get('1368186200741118042');
    if (!modChannel) {
      console.error('Moderation channel not found');
      return interaction.reply({ 
        content: 'There was an error submitting your review. Please try again later.', 
        ephemeral: true 
      });
    }
    
    await modChannel.send({ 
      content: `New review submitted by <@${interaction.user.id}>. Please moderate.`,
      embeds: [reviewEmbed], 
      components: [moderationRow] 
    });
    
    // Clean up stored data
    if (interaction.client.reviewData && interaction.client.reviewData[allowedUserId]) {
      delete interaction.client.reviewData[allowedUserId];
    }
    
    // Confirm to the user
    return interaction.reply({ 
      content: 'Your review has been submitted for moderation. Thank you for your feedback!', 
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[REVIEW] Error in reviewModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your review. Please try again later.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the Feedback button
 */
const feedbackButtonHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customId = interaction.customId;
    const allowedUserId = customId.split('_').pop();
    
    console.log(`[FEEDBACK] Button clicked by ${interaction.user.id}, allowed user is ${allowedUserId}`);
    
    // Check if the user is allowed to use this button
    if (interaction.user.id !== allowedUserId) {
      console.log(`[FEEDBACK] User ${interaction.user.id} is not allowed to use this button (expecting ${allowedUserId})`);
      return interaction.reply({
        content: 'Only the person who opened this ticket can use this button.',
        ephemeral: true
      });
    }
    
    // Create a modal for the feedback
    const modal = new ModalBuilder()
      .setCustomId(`feedback_modal_${allowedUserId}`)
      .setTitle('Feedback Form');
    
    // Add feedback field
    const feedbackInput = new TextInputBuilder()
      .setCustomId('feedback')
      .setLabel('What do you think we could improve on?')
      .setPlaceholder('Let us know! Any feedback is appreciated')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    // Add input to modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(feedbackInput)
    );
    
    // Show the modal
    await interaction.showModal(modal);
    console.log(`[FEEDBACK] Showed feedback modal to user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[FEEDBACK] Error in feedbackButtonHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your feedback request.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles the feedback modal submission
 */
const feedbackModalHandler = async (interaction) => {
  try {
    // Extract the user ID from the custom ID
    const customIdParts = interaction.customId.split('_');
    const allowedUserId = customIdParts[2];
    
    // Check if the user is allowed
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'Only the person who opened this ticket can submit this form.',
        ephemeral: true
      });
    }
    
    // Get the feedback text
    const feedbackText = interaction.fields.getTextInputValue('feedback');
    
    // Create the feedback embed
    const feedbackEmbed = new EmbedBuilder()
      .setTitle('New Feedback')
      .setDescription(
        `**From User:** <@${interaction.user.id}>\n\n` +
        `**Feedback:**\n` +
        `> ${feedbackText}`
      )
      .setColor('#e68df2')
      .setTimestamp();
    
    // Send to the feedback channel
    const feedbackChannel = interaction.client.channels.cache.get('1382062544117825697');
    if (!feedbackChannel) {
      console.error('Feedback channel not found');
      return interaction.reply({ 
        content: 'There was an error submitting your feedback. Please try again later.', 
        ephemeral: true 
      });
    }
    
    await feedbackChannel.send({ embeds: [feedbackEmbed] });
    
    // Confirm to the user
    return interaction.reply({ 
      content: 'Your feedback has been submitted. Thank you for your input!', 
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[FEEDBACK] Error in feedbackModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your feedback. Please try again later.',
        ephemeral: true
      });
    }
  }
};

// Create button handlers mapping
const reviewFeedbackButtonHandlers = {
  'review_button': reviewButtonHandler,
  'feedback_button': feedbackButtonHandler,
  'review_star_1': reviewStarHandler,
  'review_star_2': reviewStarHandler,
  'review_star_3': reviewStarHandler,
  'review_star_4': reviewStarHandler,
  'review_star_5': reviewStarHandler,
  'review_username': reviewAnonymousHandler,
  'review_anonymous': reviewAnonymousHandler
};

// Create modal handlers mapping
const reviewFeedbackModalHandlers = {
  'review_modal': reviewModalHandler,
  'feedback_modal': feedbackModalHandler
};

module.exports = {
  reviewFeedbackButtonHandlers,
  reviewFeedbackModalHandlers
}; 