const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

/**
 * Button handlers for review and feedback system
 */
const reviewFeedbackButtonHandlers = {
    // Basic review button handler
    review_button: async (interaction) => {
        try {
            console.log(`[REVIEW_BUTTON] Review button clicked by ${interaction.user.tag}`);
            
            // Create review modal
            const reviewModal = new ModalBuilder()
                .setCustomId(`review_modal_${interaction.user.id}`)
                .setTitle('Leave a Review');

            const reviewingForInput = new TextInputBuilder()
                .setCustomId('reviewing_for')
                .setLabel('What are you reviewing for?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Boost, Account, etc.')
                .setRequired(true)
                .setMaxLength(100);

            const experienceInput = new TextInputBuilder()
                .setCustomId('experience_text')
                .setLabel('How was your experience with us?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Please let us know about your experience...')
                .setRequired(true)
                .setMaxLength(1000);

            const ratingInput = new TextInputBuilder()
                .setCustomId('rating')
                .setLabel('Rating (1-5 stars)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter a number from 1 to 5')
                .setRequired(true)
                .setMaxLength(1);

            const actionRow1 = new ActionRowBuilder().addComponents(reviewingForInput);
            const actionRow2 = new ActionRowBuilder().addComponents(experienceInput);
            const actionRow3 = new ActionRowBuilder().addComponents(ratingInput);
            
            reviewModal.addComponents(actionRow1, actionRow2, actionRow3);

            await interaction.showModal(reviewModal);
  } catch (error) {
            console.error('[REVIEW_BUTTON] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your review request.',
        ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // Basic feedback button handler
    feedback_button: async (interaction) => {
        try {
            console.log(`[FEEDBACK_BUTTON] Feedback button clicked by ${interaction.user.tag}`);
            
            // Create feedback modal
            const feedbackModal = new ModalBuilder()
                .setCustomId(`feedback_modal_${interaction.user.id}`)
                .setTitle('Leave Feedback');

            const feedbackInput = new TextInputBuilder()
                .setCustomId('feedback_text')
                .setLabel('Your Feedback')
      .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Please share your feedback about our service, bot, or any suggestions...')
                .setRequired(true)
                .setMaxLength(1000);

            const actionRow = new ActionRowBuilder().addComponents(feedbackInput);
            feedbackModal.addComponents(actionRow);

            await interaction.showModal(feedbackModal);
  } catch (error) {
            console.error('[FEEDBACK_BUTTON] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
                    content: 'An error occurred while processing your feedback request.',
        ephemeral: true
                }).catch(console.error);
            }
    }
  }
};

/**
 * Modal handlers for review and feedback system
 */
const reviewFeedbackModalHandlers = {
    // Review modal handler
    review_modal: async (interaction) => {
        try {
            console.log(`[REVIEW_MODAL] Processing review from ${interaction.user.tag}`);
            
    const reviewingFor = interaction.fields.getTextInputValue('reviewing_for');
            const experienceText = interaction.fields.getTextInputValue('experience_text');
            const ratingInput = interaction.fields.getTextInputValue('rating');
    
            // Validate rating
            const rating = parseInt(ratingInput);
            if (isNaN(rating) || rating < 1 || rating > 5) {
      return interaction.reply({
                    content: 'Invalid rating. Please provide a number between 1 and 5.',
        ephemeral: true
      });
    }
    
    // Generate star display
            const stars = '⭐'.repeat(rating);
    
            // Create review embed for moderation
    const reviewEmbed = new EmbedBuilder()
                .setTitle('New Review Received')
      .setColor('#E68DF2')
                .setAuthor({
                    name: `Review by ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: '**Reviewing For:**', value: `> ${reviewingFor}` },
                    { name: '**Experience:**', value: `> ${experienceText}` },
                    { name: '**Rating:**', value: `> ${stars}` }
                )
      .setTimestamp()
      .setFooter({
        text: 'Brawl Shop',
        iconURL: 'https://cdn.discordapp.com/attachments/987753155360079903/1370862482717147247/Untitled70_20250208222905.jpg?ex=68210aad&is=681fb92d&hm=c9f876a09be906de33276bf0155f65c369d6b557e4c2deeb33cfaa2355a3b24b&format=webp'
      });
    
            // Create moderation buttons
    const moderationRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`review_accept_${interaction.user.id}_false`)
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`review_deny_${interaction.user.id}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
            );

            // Send to moderation channel (same as /review command)
            const modChannelId = '1368186200741118042';
            const modChannel = interaction.client.channels.cache.get(modChannelId);
            
            if (modChannel) {
                await modChannel.send({
                    content: `New review submitted by <@${interaction.user.id}>. Please moderate.`,
                    embeds: [reviewEmbed],
                    components: [moderationRow]
                });
                console.log(`[REVIEW_MODAL] Sent review to moderation channel ${modChannelId}`);
    } else {
                console.error(`[REVIEW_MODAL] Moderation channel ${modChannelId} not found`);
    }

    await interaction.reply({
                content: 'Your review has been submitted for moderation. Thank you for your feedback!',
      ephemeral: true
    });
  } catch (error) {
            console.error('[REVIEW_MODAL] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
                    content: 'An error occurred while processing your review.',
        ephemeral: true
                }).catch(console.error);
            }
        }
    },

    // Feedback modal handler
    feedback_modal: async (interaction) => {
        try {
            console.log(`[FEEDBACK_MODAL] Processing feedback from ${interaction.user.tag}`);
            
            const feedbackText = interaction.fields.getTextInputValue('feedback_text');
            
            // Create feedback embed
    const feedbackEmbed = new EmbedBuilder()
                .setTitle('New Feedback Received')
                .setDescription(feedbackText)
      .addFields(
                    { name: 'User', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: 'User ID', value: interaction.user.id, inline: true },
                    { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setColor('#00ff00')
                .setThumbnail(interaction.user.displayAvatarURL());

            // Send to feedback channel
    const feedbackChannelId = '1382062544117825697';
    const feedbackChannel = interaction.client.channels.cache.get(feedbackChannelId);
            
    if (feedbackChannel) {
                await feedbackChannel.send({ embeds: [feedbackEmbed] });
                console.log(`[FEEDBACK_MODAL] Sent feedback to channel ${feedbackChannelId}`);
    } else {
                console.error(`[FEEDBACK_MODAL] Feedback channel ${feedbackChannelId} not found`);
    }

    await interaction.reply({
                content: 'Thank you for your feedback! We appreciate your input and will use it to improve our services.',
      ephemeral: true
    });
  } catch (error) {
            console.error('[FEEDBACK_MODAL] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
                    content: 'An error occurred while processing your feedback. Please try again.',
        ephemeral: true
                }).catch(console.error);
            }
        }
    }
};

module.exports = {
  reviewFeedbackButtonHandlers,
    reviewFeedbackModalHandlers
};
