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
    
    // Determine default service based on context (ticket vs payout DM)
    let reviewingFor;
    const inDM = !interaction.guild;
    if(inDM){
      reviewingFor = 'Affiliate Earnings Payout';
    }else{
      reviewingFor = 'Boost Service';
      try {
        const ticketName = interaction.channel?.name || '';
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
    
    // Determine reviewingFor default
    let reviewingFor = '';
    const inDM2 = !interaction.guild;
    if(inDM2){
      reviewingFor = 'Affiliate Earnings Payout';
    }
    // Get the channel topic to extract boost information for ticket channels
    let channelTopic = '';
    try{ if(interaction.channel && 'topic' in interaction.channel && interaction.channel.topic) channelTopic = interaction.channel.topic; }catch{}

    if (!reviewingFor) {
      reviewingFor = 'Boost Service';
    }
    
    if(!inDM2){
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
    
    const placeholderText = reviewingFor === 'Affiliate Earnings Payout'
      ? 'Let us know how your experience with us was!'
      : 'Let us know how your boost went!';
    const experienceInput = new TextInputBuilder()
      .setCustomId('experience')
      .setLabel('Experience')
      .setPlaceholder(placeholderText)
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

    // Build moderation buttons
    const moderationRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`review_accept_${interaction.user.id}_${anonymous}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`review_deny_${interaction.user.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
    );

    // Send to moderation channel
    const modChannel = interaction.client.channels.cache.get('1368186200741118042');
    if(modChannel){
      await modChannel.send({content:`New review submitted by <@${interaction.user.id}>. Please moderate.`, embeds:[reviewEmbed], components:[moderationRow]});
    } else {
      console.error('[REVIEW] Moderation channel not found');
    }

    // confirmation
    await interaction.reply({content:'Your review has been submitted for moderation. Thank you!',ephemeral:true});
  } catch (error) {
    console.error(`[REVIEW] Error in reviewModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your review.',
        ephemeral: true
      });
    }
  }
};

/**
 * Handles review accept button (moderation)
 */
const reviewAcceptHandler = async (interaction) => {
  try {
    // Check permissions - Allow specific users and roles
    const ALLOWED_USERS = ['987751357773672538', '986164993080836096'];
    const ALLOWED_ROLES = ['1292933200389083196', '1358101527658627270'];
    
    const hasPermission = ALLOWED_USERS.includes(interaction.user.id) || 
                         ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    
    if (!hasPermission) {
      return interaction.reply({ 
        content: "You don't have permission to moderate reviews.", 
        ephemeral: true 
      });
    }
    
    // Extract user ID and anonymous flag from customId: review_accept_userId_anonymous
    const customIdParts = interaction.customId.split('_');
    const originalUserId = customIdParts[2];
    const wasAnonymous = customIdParts[3] === 'true';
    
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
    const REVIEW_CHANNEL_ID = '1293288484487954512';
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
    
    console.log(`[REVIEW_MODERATION] Review accepted by ${interaction.user.id} and posted to review channel`);
  } catch (error) {
    console.error(`[REVIEW_MODERATION] Error in reviewAcceptHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'An error occurred while processing this action.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Handles review deny button (moderation)
 */
const reviewDenyHandler = async (interaction) => {
  try {
    // Check permissions - Allow specific users and roles
    const ALLOWED_USERS = ['987751357773672538', '986164993080836096'];
    const ALLOWED_ROLES = ['1292933200389083196', '1358101527658627270'];
    
    const hasPermission = ALLOWED_USERS.includes(interaction.user.id) || 
                         ALLOWED_ROLES.some(roleId => interaction.member.roles.cache.has(roleId));
    
    if (!hasPermission) {
      return interaction.reply({ 
        content: "You don't have permission to moderate reviews.", 
        ephemeral: true 
      });
    }
    
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
    
    console.log(`[REVIEW_MODERATION] Review denied by ${interaction.user.id}`);
  } catch (error) {
    console.error(`[REVIEW_MODERATION] Error in reviewDenyHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'An error occurred while processing this action.', 
        ephemeral: true 
      });
    }
  }
};

/**
 * Placeholder feedback handler – reuses review flow or responds with info.
 * Currently not used in payout context but exported to satisfy references.
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
    
    // Determine default service based on context
    let feedbackFor;
    const inDM = !interaction.guild;
    if(inDM){
      feedbackFor = 'Affiliate Earnings Payout';
    }else{
      feedbackFor = 'Boost Service';
      try {
        const ticketName = interaction.channel?.name || '';
        if (ticketName.includes('rank') || ticketName.includes('ranked')) {
          feedbackFor = 'Ranked Boost';
        } else if (ticketName.includes('trophy') || ticketName.includes('trophies')) {
          feedbackFor = 'Trophy Boost';
        } else if (ticketName.includes('master') || ticketName.includes('mastery')) {
          feedbackFor = 'Mastery Boost';
        } else if (ticketName.includes('profile') || ticketName.includes('𝐩𝐫𝐨𝐟𝐢𝐥𝐞')) {
          feedbackFor = 'Profile Purchase';
        }
      } catch (error) {
        console.error(`[FEEDBACK] Error determining service type: ${error.message}`);
      }
    }
    
    // Create a modal for the feedback
    const modal = new ModalBuilder()
      .setCustomId(`feedback_modal_${allowedUserId}`)
      .setTitle('Feedback Form');
    
    // Add feedback fields
    const feedbackForInput = new TextInputBuilder()
      .setCustomId('feedback_for')
      .setLabel('Feedback For')
      .setValue(feedbackFor)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    
    const placeholderText = feedbackFor === 'Affiliate Earnings Payout'
      ? 'Let us know how we can improve our payout system!'
      : 'Let us know how we can improve our bot and order handling!';
    const feedbackInput = new TextInputBuilder()
      .setCustomId('feedback_text')
      .setLabel('Your Feedback')
      .setPlaceholder(placeholderText)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    
    const improvementInput = new TextInputBuilder()
      .setCustomId('improvement_suggestions')
      .setLabel('Improvement Suggestions (Optional)')
      .setPlaceholder('Any specific suggestions for improvement?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    
    // Add inputs to modal
    modal.addComponents(
      new ActionRowBuilder().addComponents(feedbackForInput),
      new ActionRowBuilder().addComponents(feedbackInput),
      new ActionRowBuilder().addComponents(improvementInput)
    );
    
    // Show the modal
    await interaction.showModal(modal);
    
    console.log(`[FEEDBACK] Showed feedback form to user ${interaction.user.id}`);
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
    
    // Get the form values
    const feedbackFor = interaction.fields.getTextInputValue('feedback_for');
    const feedbackText = interaction.fields.getTextInputValue('feedback_text');
    const improvementSuggestions = interaction.fields.getTextInputValue('improvement_suggestions') || 'None provided';
    
    // Create the feedback embed
    const feedbackEmbed = new EmbedBuilder()
      .setTitle('New Feedback')
      .setColor('#4a90e2')
      .setTimestamp()
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://cdn.discordapp.com/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&format=webp'
      })
      .setAuthor({
        name: `Feedback by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '**Feedback For:**', value: `> ${feedbackFor}` },
        { name: '**Feedback:**', value: `> ${feedbackText}` },
        { name: '**Improvement Suggestions:**', value: `> ${improvementSuggestions}` }
      );
    
    // Send to feedback channel
    const feedbackChannelId = '1382062544117825697'; // Feedback channel
    const feedbackChannel = interaction.client.channels.cache.get(feedbackChannelId);
    if(feedbackChannel){
      await feedbackChannel.send({
        content: `New feedback submitted by <@${interaction.user.id}>.`, 
        embeds: [feedbackEmbed]
      });
    } else {
      console.error('[FEEDBACK] Feedback channel not found');
    }

    // Send confirmation to user
    await interaction.reply({
      content: 'Your feedback has been submitted successfully. Thank you for helping us improve!',
      ephemeral: true
    });
    
    console.log(`[FEEDBACK] Feedback submitted by user ${interaction.user.id}`);
  } catch (error) {
    console.error(`[FEEDBACK] Error in feedbackModalHandler: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while submitting your feedback.',
        ephemeral: true
      });
    }
  }
};

// Build dynamic star and anonymity handlers
const starHandlers = {};
for(let i=1;i<=5;i++){
  starHandlers[`review_star_${i}`]=reviewStarHandler;
}

const anonymityHandlers = {
  review_anonymous: reviewAnonymousHandler,
  review_username: reviewAnonymousHandler
};

const reviewFeedbackButtonHandlers = {
  review_button: reviewButtonHandler,
  feedback_button: feedbackButtonHandler,
  review_star: reviewStarHandler,
  review_anonymous: reviewAnonymousHandler,
  review_username: reviewAnonymousHandler,
  review_accept: reviewAcceptHandler,
  review_deny: reviewDenyHandler,
  ...starHandlers,
  ...anonymityHandlers
};

const reviewFeedbackModalHandlers = {
  review_modal: reviewModalHandler,
  feedback_modal: feedbackModalHandler
};

module.exports = {
  reviewFeedbackButtonHandlers,
  reviewFeedbackModalHandlers,
  reviewButtonHandler,
  reviewStarHandler,
  reviewAnonymousHandler,
  reviewModalHandler,
  reviewAcceptHandler,
  reviewDenyHandler,
  feedbackButtonHandler,
  feedbackModalHandler
};