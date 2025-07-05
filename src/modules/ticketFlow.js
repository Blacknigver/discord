const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  InteractionResponseFlags
} = require('discord.js');
const { STAFF_ROLES, TICKET_CATEGORIES } = require('../constants');
const helpers = require('../utils/helpers');
const { calculateBulkPrice, calculateRankedPrice, calculateMasteryPrice } = helpers;
const { calculateTrophyPrice } = require('../../utils'); // <-- Import from correct file

// Define the pink color for all embeds
const PINK_COLOR = '#e68df2';

// Define rank-specific colors
const RANK_COLORS = {
  'Masters': '#57F287',  // Green
  'Pro': '#57F287',      // Green
  'Gold': '#57F287',     // Green
  'Legendary': '#ED4245', // Red
  'Mythic': '#ED4245',    // Red
  'Diamond': '#5865F2',   // Blue
  'Silver': '#5865F2',    // Blue
  'Bronze': '#4E5058'     // Gray
};

// Define mastery-specific colors
const MASTERY_COLORS = {
  'Gold': '#57F287',    // Green
  'Silver': '#5865F2',  // Blue
  'Bronze': '#ED4245'   // Red
};

const { 
  sendOrderRecapEmbed, 
  sendWelcomeEmbed,
  sendPayPalTermsEmbed,
  sendIbanEmbed,
  sendPayPalGiftcardEmbed,
  sendAppleGiftcardEmbed,
  sendOrderDetailsEmbed,
  showCryptoSelection,
  sendTikkieEmbed,
  sendBolGiftcardEmbed
} = require('../../ticketPayments.js'); // Adjusted path to root
const { 
  createTicketChannelWithOverflow 
} = require('../../tickets.js'); // Adjusted path to root

// Store user flow state
const flowState = new Map();

// Ranked boost flow
async function handleRankedFlow(interaction) {
  try {
    console.log(`[RANKED_FLOW] Starting ranked flow for user ${interaction.user.id}`);
    
    // Initialize user state
    flowState.set(interaction.user.id, { 
      type: 'ranked', 
      step: 'p11_modal',  // Start with P11 modal
      timestamp: Date.now()
    });
    
    // Show P11 modal instead of proceeding directly to rank selection
    return showP11Modal(interaction);
    
  } catch (error) {
    console.error('[RANKED_FLOW] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while creating the ranked ticket.',
        ephemeral: true
      }).catch(console.error);
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({
        content: 'An error occurred while creating the ranked ticket.'
      }).catch(console.error);
    }
  }
}

// Show P11 modal for ranked boost
async function showP11Modal(interaction) {
  try {
    console.log(`[P11_MODAL] Showing P11 modal to user ${interaction.user.id}`);
    
    // Create a modal for P11 input
    const modal = new ModalBuilder()
      .setCustomId('modal_p11_count')
      .setTitle('P11 Brawlers Count');
    
    // Add text input for P11 count
    const p11Input = new TextInputBuilder()
      .setCustomId('p11_count')
      .setLabel('How many P11 do you have?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter a number only')
      .setRequired(true);
    
    // Add the text input to an action row
    const firstActionRow = new ActionRowBuilder().addComponents(p11Input);
    
    // Add the action row to the modal
    modal.addComponents(firstActionRow);
    
    // Show the modal
    await interaction.showModal(modal);
    
    return true;
  } catch (error) {
    console.error(`[P11_MODAL] Error showing P11 modal: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while showing the P11 modal. Please try again.',
        ephemeral: true
      });
    }
    
    return false;
  }
}

// Handle P11 modal submission
async function handleP11ModalSubmit(interaction) {
  try {
    console.log(`[P11_MODAL] Processing P11 modal submission from user ${interaction.user.id}`);
    
    // Get user data
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[P11_MODAL] No user data found for ${interaction.user.id}`);
      return interaction.reply({
        content: 'Session data not found. Please try again.',
        flags: 64  // Ephemeral flag
      });
    }
    
    // Get P11 count from modal
    const p11CountInput = interaction.fields.getTextInputValue('p11_count');
    
    // Validate that input is a number
    const p11Count = parseInt(p11CountInput, 10);
    if (isNaN(p11Count) || p11Count < 0) {
      return interaction.reply({
        content: 'Please enter a valid number for your P11 count.',
        flags: 64  // Ephemeral flag
      });
    }
    
    // Store P11 count in user data
    userData.p11Count = p11Count;
    userData.step = 'current_rank';  // Move to current rank selection
    flowState.set(interaction.user.id, userData);
    
    console.log(`[P11_MODAL] Stored P11 count ${p11Count} for user ${interaction.user.id}`);
    
    // Create rank selection embed and components
    const embed = new EmbedBuilder()
      .setTitle('Current Rank')
      .setDescription('Please select your current rank below.')
      .setColor(PINK_COLOR);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranked_Masters')
        .setLabel('Masters')
        .setEmoji('<:Masters:1293283897618075728>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ranked_Legendary')
        .setLabel('Legendary')
        .setEmoji('<:Legendary:1264709440561483818>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ranked_Mythic')
        .setLabel('Mythic')
        .setEmoji('<:mythic:1357482343555666181>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ranked_Diamond')
        .setLabel('Diamond')
        .setEmoji('<:diamond:1357482488506613920>')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ranked_Gold')
        .setLabel('Gold')
        .setEmoji('<:gold:1357482374048256131>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ranked_Silver')
        .setLabel('Silver')
        .setEmoji('<:silver:1357482400333955132>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ranked_Bronze')
        .setLabel('Bronze')
        .setEmoji('<:bronze:1357482418654937332>')
        .setStyle(ButtonStyle.Secondary)
    );

    // Reply to the modal submission with the rank selection
    const response = await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      flags: 64,  // Ephemeral flag
      fetchReply: true // Get the message object
    });
    
    // Store the message ID for future edits
    userData.lastMessageId = response.id;
    flowState.set(interaction.user.id, userData);
    
    return response;
    
  } catch (error) {
    console.error(`[P11_MODAL] Error handling P11 modal submission: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ 
        content: 'An error occurred while processing your P11 count. Please try again.',
        flags: 64  // Ephemeral flag
      });
    }
    
    return false;
  }
}

// Bulk trophies flow
async function handleBulkFlow(interaction) {
  try {
    console.log(`[BULK_FLOW] Starting bulk trophies flow for user ${interaction.user.id}`);
  
    const modal = new ModalBuilder()
      .setCustomId('modal_bulk_trophies')
      .setTitle('Bulk Trophies Boost');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('current_trophies')
          .setLabel('Current Trophies')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('desired_trophies')
          .setLabel('Desired Trophies')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    // Initialize user state
    flowState.set(interaction.user.id, { 
      type: 'bulk', 
      step: 'trophies_input',
      timestamp: Date.now()
    });
    console.log(`[BULK_FLOW] Set initial flow state for user ${interaction.user.id}`);
    
    // Show the modal directly without deferred replies
    console.log(`[BULK_FLOW] Showing modal to user ${interaction.user.id}`);
    return interaction.showModal(modal)
      .then(() => console.log(`[BULK_FLOW] Successfully showed modal to user ${interaction.user.id}`))
      .catch(err => {
        console.error(`[BULK_FLOW] Error showing modal: ${err.message}`);
        console.error(err.stack);
      });
  } catch (error) {
    console.error(`[BULK_FLOW] Critical error in handleBulkFlow for user ${interaction.user?.id || 'unknown'}: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        return interaction.reply({ 
          content: 'There was an error loading the bulk trophies form. Please try again later.',
          flags: InteractionResponseFlags.Ephemeral
        });
      } catch (responseError) {
        console.error(`[BULK_FLOW] Failed to send error message: ${responseError.message}`);
      }
    }
  }
}

// Mastery flow
async function handleMasteryFlow(interaction) {
  try {
    console.log(`[MASTERY_FLOW] Starting mastery flow for user ${interaction.user.id}`);
  
    const modal = new ModalBuilder()
      .setCustomId('modal_mastery_brawler')
      .setTitle('Mastery Boost');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('brawler_name')
          .setLabel('Which Brawler?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    // Initialize user state
    flowState.set(interaction.user.id, { 
      type: 'mastery', 
      step: 'brawler_input',
      timestamp: Date.now()
    });
    console.log(`[MASTERY_FLOW] Set initial flow state for user ${interaction.user.id}`);
    
    // Show the modal directly without deferred replies
    console.log(`[MASTERY_FLOW] Showing modal to user ${interaction.user.id}`);
    return interaction.showModal(modal)
      .then(() => console.log(`[MASTERY_FLOW] Successfully showed modal to user ${interaction.user.id}`))
      .catch(err => {
        console.error(`[MASTERY_FLOW] Error showing modal: ${err.message}`);
        console.error(err.stack);
      });
  } catch (error) {
    console.error(`[MASTERY_FLOW] Critical error in handleMasteryFlow for user ${interaction.user?.id || 'unknown'}: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        return interaction.reply({ 
          content: 'There was an error loading the mastery form. Please try again later.',
          flags: InteractionResponseFlags.Ephemeral
        });
      } catch (responseError) {
        console.error(`[MASTERY_FLOW] Failed to send error message: ${responseError.message}`);
      }
    }
  }
}

// Handle mastery selection
async function handleMasterySelection(interaction, masteryInput) {
  const userData = flowState.get(interaction.user.id);
  if (!userData) {
    console.error(`[MASTERY_FLOW] No user data found for ${interaction.user.id}`);
    return safeInteractionReply(interaction, { 
      content: 'Session data not found. Please try again.',
      ephemeral: true
    });
  }

  try {
    console.log(`[DEBUG] handleMasterySelection: masteryInput=${masteryInput}, step=${userData.step}`);

    // No need to defer update here, it will be handled by safeInteractionResponse

    let baseMasteryName = masteryInput;
    let specificMasteryNumber = null;

    if (masteryInput.includes('_')) {
      const parts = masteryInput.split('_');
      baseMasteryName = parts[0];
      specificMasteryNumber = parts[1];
    }

    if (userData.step === 'current_mastery') {
      // Ensure baseMasteryName is TitleCased for display and consistency
      let displayMasteryName = baseMasteryName;
      if (displayMasteryName && typeof displayMasteryName === 'string') {
        displayMasteryName = displayMasteryName.charAt(0).toUpperCase() + displayMasteryName.slice(1).toLowerCase();
      } else {
        console.error(`[MASTERY_FLOW_ERROR] Invalid baseMasteryName: ${baseMasteryName} for current_mastery step`);
        displayMasteryName = 'Mastery'; // A generic fallback, should not happen with valid customIDs
      }
      userData.currentMastery = displayMasteryName; // Store TitleCased version
      userData.step = 'current_mastery_specific';
      
      const masteryUIDetails = getMasteryUIDetails(displayMasteryName);
      
      // Use mastery-specific color for the embed
      const embedColor = MASTERY_COLORS[displayMasteryName] || PINK_COLOR;

      const embed = new EmbedBuilder()
        .setTitle('Specify Mastery')
        .setDescription(`Specify your exact ${displayMasteryName} Mastery.`)
        .setColor(embedColor);
        
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mastery_${displayMasteryName}_1`).setLabel(`${displayMasteryName} 1`).setEmoji(masteryUIDetails.emoji).setStyle(masteryUIDetails.style),
        new ButtonBuilder().setCustomId(`mastery_${displayMasteryName}_2`).setLabel(`${displayMasteryName} 2`).setEmoji(masteryUIDetails.emoji).setStyle(masteryUIDetails.style),
        new ButtonBuilder().setCustomId(`mastery_${displayMasteryName}_3`).setLabel(`${displayMasteryName} 3`).setEmoji(masteryUIDetails.emoji).setStyle(masteryUIDetails.style)
      );
      flowState.set(interaction.user.id, userData);
      return safeInteractionResponse(interaction, { embeds: [embed], components: [row] });

    } else if (userData.step === 'current_mastery_specific') {
      if (!specificMasteryNumber) {
        console.error(`[MASTERY_FLOW_ERROR] Expected specific mastery number for ${baseMasteryName}`);
        return safeInteractionResponse(interaction, { content: 'An error occurred. Please try again.', ephemeral: true });
      }
      // Ensure baseMasteryName (which is currentMastery here) is TitleCased
      let currentDisplayMastery = userData.currentMastery;
      if (currentDisplayMastery && typeof currentDisplayMastery === 'string') {
        currentDisplayMastery = currentDisplayMastery.charAt(0).toUpperCase() + currentDisplayMastery.slice(1).toLowerCase();
      }

      userData.currentMasterySpecific = specificMasteryNumber;
      userData.formattedCurrentMastery = `${currentDisplayMastery} ${specificMasteryNumber}`; // Use TitleCased
      userData.step = 'desired_mastery';
      
      const currentMasteryValue = getMasteryValue(userData.currentMastery, specificMasteryNumber);
      const embed = new EmbedBuilder()
        .setTitle('Desired Mastery')
        .setDescription('Please select your desired mastery.')
        .setColor(PINK_COLOR);
        
      const masteryButtons = generateMasteryButtons(currentMasteryValue, 'mastery_');

      if (masteryButtons.rows.length === 0) {
         return safeInteractionResponse(interaction, { content: 'You have selected the highest mastery or an invalid mastery. There are no higher masteries to boost to.', embeds:[], components:[], ephemeral: true });
      }
      flowState.set(interaction.user.id, userData);
      return safeInteractionResponse(interaction, { embeds: [embed], components: masteryButtons.rows });

    } else if (userData.step === 'desired_mastery') {
      // Ensure baseMasteryName (which is desiredMastery here) is TitleCased
      let displayDesiredMasteryName = baseMasteryName;
      if (displayDesiredMasteryName && typeof displayDesiredMasteryName === 'string') {
        displayDesiredMasteryName = displayDesiredMasteryName.charAt(0).toUpperCase() + displayDesiredMasteryName.slice(1).toLowerCase();
      } else {
        console.error(`[MASTERY_FLOW_ERROR] Invalid baseMasteryName: ${baseMasteryName} for desired_mastery step`);
        displayDesiredMasteryName = 'Mastery'; 
      }
      userData.desiredMastery = displayDesiredMasteryName; // Store TitleCased
      userData.step = 'desired_mastery_specific';
      
      const masteryUIDetails = getMasteryUIDetails(displayDesiredMasteryName);
      const currentMasteryValue = getMasteryValue(userData.currentMastery, userData.currentMasterySpecific);

      // Use mastery-specific color for the embed
      const embedColor = MASTERY_COLORS[displayDesiredMasteryName] || PINK_COLOR;

      const embed = new EmbedBuilder()
        .setTitle('Specify Desired Mastery')
        .setDescription(`Specify your exact desired ${displayDesiredMasteryName} Mastery.`)
        .setColor(embedColor);
        
      const specificButtons = [];
      for (let i = 1; i <= 3; i++) {
        if (getMasteryValue(displayDesiredMasteryName, i.toString()) > currentMasteryValue) {
          specificButtons.push(
            new ButtonBuilder().setCustomId(`mastery_${displayDesiredMasteryName}_${i}`).setLabel(`${displayDesiredMasteryName} ${i}`).setEmoji(masteryUIDetails.emoji).setStyle(masteryUIDetails.style)
          );
        }
      }
      if (specificButtons.length === 0) {
        return safeInteractionResponse(interaction, { content: 'There are no valid mastery options higher than your current mastery for this category.', embeds:[], components:[], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(...specificButtons);
      flowState.set(interaction.user.id, userData);
      return safeInteractionResponse(interaction, { embeds: [embed], components: [row] });

    } else if (userData.step === 'desired_mastery_specific') {
      if (!specificMasteryNumber) {
        console.error(`[MASTERY_FLOW_ERROR] Expected specific mastery number for ${baseMasteryName}`); // baseMasteryName here is desiredMastery
        return safeInteractionResponse(interaction, { content: 'An error occurred. Please try again.', ephemeral: true });
      }
      // Ensure userData.desiredMastery is TitleCased before formatting
      let finalDesiredMastery = userData.desiredMastery;
       if (finalDesiredMastery && typeof finalDesiredMastery === 'string') {
        finalDesiredMastery = finalDesiredMastery.charAt(0).toUpperCase() + finalDesiredMastery.slice(1).toLowerCase();
      }

      userData.desiredMasterySpecific = specificMasteryNumber;
      userData.formattedDesiredMastery = `${finalDesiredMastery} ${specificMasteryNumber}`;
      
      if (!isDesiredMasteryHigher(userData.currentMastery, userData.currentMasterySpecific, userData.desiredMastery, specificMasteryNumber)) {
        return safeInteractionResponse(interaction, { content: 'The desired mastery must be higher than your current mastery.', embeds:[], components:[], ephemeral: true });
      }
      flowState.set(interaction.user.id, userData);
      return showPaymentMethodSelection(interaction);
    }
  } catch (error) {
    console.error('Error in handleMasterySelection:', error);
    const errMessage = 'An error occurred while processing your mastery selection. Please try again.';
    return safeInteractionResponse(interaction, { content: errMessage, ephemeral: true });
  }
}

// Handle mastery modal submission
async function handleMasteryBrawlerModal(interaction) {
  try {
    console.log(`[MASTERY_FLOW] Processing mastery brawler modal for user ${interaction.user.id}`);
    
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[MASTERY_FLOW] No user data found for ${interaction.user.id}`);
      return interaction.reply({
        content: 'Session data not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Get brawler name from modal
    const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
    console.log(`[MASTERY_FLOW] User ${interaction.user.id} selected brawler: ${brawlerName}`);
    
    if (!brawlerName) {
      console.error(`[MASTERY_FLOW] Empty brawler name provided by user ${interaction.user.id}`);
      return interaction.reply({
        content: 'Please provide a valid brawler name.',
        ephemeral: true
      });
    }
    
    // Store the brawler name
    userData.brawler = brawlerName;
    userData.step = 'current_mastery';
    flowState.set(interaction.user.id, userData);
    console.log(`[MASTERY_FLOW] Updated flow state for user ${interaction.user.id} with brawler ${brawlerName}`);
    
    // Create embed for current mastery selection
    const embed = new EmbedBuilder()
      .setTitle('Current Mastery')
      .setDescription(`Select the current mastery level for ${brawlerName}.`)
      .setColor(PINK_COLOR);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mastery_Bronze')
        .setLabel('Bronze')
        .setEmoji('<:mastery_bronze:1357487786394914847>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('mastery_Silver')
        .setLabel('Silver')
        .setEmoji('<:mastery_silver:1357487832481923153>')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mastery_Gold')
        .setLabel('Gold')
        .setEmoji('<:mastery_gold:1357487865029722254>')
        .setStyle(ButtonStyle.Success)
    );
    
    console.log(`[MASTERY_FLOW] Sending mastery selection for user ${interaction.user.id}`);
    // Use proper ephemeral flag without InteractionResponseFlags
    return interaction.reply({ 
      embeds: [embed], 
      components: [row], 
      ephemeral: true 
    })
      .then(() => console.log(`[MASTERY_FLOW] Successfully sent mastery selection to user ${interaction.user.id}`))
      .catch(error => {
        console.error(`[MASTERY_FLOW] Error replying with mastery selection: ${error.message}`);
        console.error(error.stack);
      });
  } catch (error) {
    console.error(`[MASTERY_FLOW] Error handling mastery brawler modal for user ${interaction.user?.id || 'unknown'}: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        // Use proper ephemeral flag without InteractionResponseFlags
        return interaction.reply({
          content: 'An error occurred while processing your brawler selection. Please try again.',
          ephemeral: true
        });
      } catch (err) {
        console.error(`[MASTERY_FLOW] Failed to send error message: ${err.message}`);
        console.log('[MODAL_HANDLERS_DEBUG] djs.InteractionResponseFlags is UNDEFINED before reply in handleMasteryBrawlerModal');
      }
    }
  }
}

// Handle bulk trophies modal
async function handleBulkTrophiesModal(interaction) {
  try {
    console.log(`[BULK_FLOW] Processing bulk trophies modal for user ${interaction.user.id}`);
    
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[BULK_FLOW] No user data found for ${interaction.user.id}`);
      return interaction.reply({
        content: 'Session data not found. Please try again.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    // Get current and desired trophies
    const currentTrophiesInput = interaction.fields.getTextInputValue('current_trophies').trim();
    const desiredTrophiesInput = interaction.fields.getTextInputValue('desired_trophies').trim();
    
    console.log(`[BULK_FLOW] User ${interaction.user.id} input: current=${currentTrophiesInput}, desired=${desiredTrophiesInput}`);
    
    const currentTrophies = parseInt(currentTrophiesInput, 10);
    const desiredTrophies = parseInt(desiredTrophiesInput, 10);
    
    // Validate trophy counts
    if (isNaN(currentTrophies) || isNaN(desiredTrophies)) {
      console.error(`[BULK_FLOW] Invalid trophy numbers from user ${interaction.user.id}`);
      return interaction.reply({
        content: 'Please enter valid numbers for current and desired trophies.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    if (currentTrophies >= desiredTrophies) {
      console.error(`[BULK_FLOW] User ${interaction.user.id} entered current trophies >= desired (${currentTrophies} >= ${desiredTrophies})`);
      return interaction.reply({
        content: 'Desired trophies must be higher than current trophies.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    if (currentTrophies < 0 || desiredTrophies < 0) {
      console.error(`[BULK_FLOW] User ${interaction.user.id} entered negative trophy values (current=${currentTrophies}, desired=${desiredTrophies})`);
      return interaction.reply({
        content: 'Trophy values cannot be negative.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    // Store trophy data
    userData.currentTrophies = currentTrophies;
    userData.desiredTrophies = desiredTrophies;
    userData.step = 'payment_method';
    flowState.set(interaction.user.id, userData);
    console.log(`[BULK_FLOW] Updated flow state for user ${interaction.user.id} with trophies ${currentTrophies} to ${desiredTrophies}`);
    
    try {
      // Calculate price (do this before sending the payment selection to ensure accuracy)
      const price = calculateBulkPrice(currentTrophies, desiredTrophies);
      userData.price = price;
      flowState.set(interaction.user.id, userData);
      console.log(`[BULK_FLOW] Calculated price for user ${interaction.user.id}: €${price.toFixed(2)}`);
    } catch (priceError) {
      console.error(`[BULK_FLOW] Error calculating price for user ${interaction.user.id}: ${priceError.message}`);
      console.error(priceError.stack);
      // Continue with the flow even if price calculation fails
    }
    
    console.log(`[BULK_FLOW] Showing payment method selection for user ${interaction.user.id}`);
    // Show payment method selection
    return showPaymentMethodSelection(interaction);
  } catch (error) {
    console.error(`[BULK_FLOW] Error handling bulk trophies modal for user ${interaction.user?.id || 'unknown'}: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: 'An error occurred while processing your trophy input. Please try again.',
        flags: InteractionResponseFlags.Ephemeral
      }).catch(err => console.error(`[BULK_FLOW] Failed to send error message: ${err.message}`));
    }
  }
}

// Helper functions
function getRankEmoji(rank) {
  // Handle case where rank includes a number (like 'Pro_1')
  if (rank && rank.includes('_')) {
    // Extract the base rank from the format 'Rank_Number'
    const baseName = rank.split('_')[0];
    return getRankEmoji(baseName); // Recursively call with just the base rank
  }
  
  const emojis = {
    'Pro': '<:pro:1351687685328208003>',
    'Masters': '<:Masters:1293283897618075728>',
    'Legendary': '<:Legendary:1264709440561483818>',
    'Mythic': '<:mythic:1357482343555666181>',
    'Diamond': '<:diamond:1357482488506613920>',
    'Gold': '<:gold:1357482374048256131>',
    'Silver': '<:silver:1357482400333955132>',
    'Bronze': '<:bronze:1357482418654937332>',
    // Add numeric ranks explicitly as well
    '1': '🏆',
    '2': '🏆',
    '3': '🏆'
  };
  return emojis[rank] || '⭐'; // Return a star emoji as default
}

function getRankStyle(rank) {
  const styles = {
    'Pro': ButtonStyle.Success,
    'Masters': ButtonStyle.Success,
    'Legendary': ButtonStyle.Danger,
    'Mythic': ButtonStyle.Danger,
    'Diamond': ButtonStyle.Primary,
    'Gold': ButtonStyle.Success,
    'Silver': ButtonStyle.Primary,
    'Bronze': ButtonStyle.Secondary
  };
  return styles[rank] || ButtonStyle.Primary;
}

function getMasteryEmoji(mastery) {
  const emojis = {
    'Bronze': '<:mastery_bronze:1357487786394914847>',
    'Silver': '<:mastery_silver:1357487832481923153>',
    'Gold': '<:mastery_gold:1357487865029722254>'
  };
  return emojis[mastery] || '⭐'; // Return a star emoji as default
}

function getMasteryStyle(mastery) {
  const styles = {
    'Bronze': ButtonStyle.Danger,
    'Silver': ButtonStyle.Primary,
    'Gold': ButtonStyle.Success
  };
  return styles[mastery] || ButtonStyle.Primary;
}

// Function to get numerical value of a mastery for comparisons
function getMasteryValue(mastery, number) {
  try {
    console.log(`[HELPER] Getting mastery value for ${mastery} ${number}`);
    
    const masteryValues = {
      'Bronze': 1,
      'Silver': 2,
      'Gold': 3
    };

    // Handle undefined or lowercase mastery input
    let normalizedMastery = mastery;
    if (mastery && typeof mastery === 'string') {
      normalizedMastery = mastery.charAt(0).toUpperCase() + mastery.slice(1).toLowerCase();
    } else if (mastery === undefined) {
      console.warn('[HELPER] Mastery type is undefined');
      return 0;
    }
    
    // If mastery is not in the map, return 0
    if (!masteryValues[normalizedMastery]) {
      console.warn(`[HELPER] Invalid mastery type: ${mastery} (normalized to ${normalizedMastery})`);
      return 0;
    }
    
    // Parse the number safely
    let parsedNumber = 0;
    try {
      parsedNumber = parseInt(number || 0, 10);
      if (isNaN(parsedNumber)) parsedNumber = 0;
    } catch (parseError) {
      console.warn(`[HELPER] Error parsing mastery number '${number}': ${parseError.message}`);
      parsedNumber = 0;
    }
    
    // Calculate total value: base mastery value * 10 + specific number (1-3)
    const result = (masteryValues[normalizedMastery] * 10) + parsedNumber;
    console.log(`[HELPER] Calculated mastery value for ${mastery} ${number}: ${result}`);
    return result;
  } catch (error) {
    console.error(`[HELPER] Critical error in getMasteryValue: ${error.message}`);
    console.error(error.stack);
    return 0;
  }
}

// Get numeric value for a rank to allow comparisons
function getRankValue(rank, number) {
  console.log(`[HELPER] Getting rank value for ${rank} ${number}`);
  
  // Special case: Pro has no specific number and is the highest rank
  if (rank === 'Pro') {
    console.log(`[HELPER] Calculated rank value for Pro : 100`);
    return 100; // Make sure Pro is higher than all other ranks
  }

  const rankOrder = {
    'Bronze': 10,
    'Silver': 20,
    'Gold': 30,
    'Diamond': 40,
    'Mythic': 50,
    'Legendary': 60,
    'Masters': 70
  };

  // Handle edge cases
  if (!rank || !rankOrder[rank]) {
    console.error(`[HELPER] Invalid rank: ${rank}`);
    return 0;
  }

  const baseValue = rankOrder[rank];
  let specificValue = 0;

  // Convert string number to int, or default to 0 if not a valid number
  if (number) {
    specificValue = parseInt(number, 10);
    if (isNaN(specificValue)) {
      specificValue = 0;
    }
  }
  
  // Calculate final value (base + specific)
  const finalValue = baseValue + specificValue;
  console.log(`[HELPER] Calculated rank value for ${rank} ${number}: ${finalValue}`);
  
  return finalValue;
}

// Check if a desired rank is higher than current rank
function isDesiredRankHigher(currentRank, currentNumber, desiredRank, desiredNumber) {
  try {
    console.log(`[HELPER] Comparing ranks: ${currentRank} ${currentNumber} vs ${desiredRank} ${desiredNumber}`);
    
    // Special handling for Pro rank - it's always higher
    if (desiredRank === 'Pro') {
      console.log(`[HELPER] Special comparison: ${desiredRank} is automatically higher than ${currentRank} unless current is also Pro`);
      return currentRank !== 'Pro'; // Pro is higher than anything except Pro itself
    }
    
    const currentValue = getRankValue(currentRank, currentNumber);
    const desiredValue = getRankValue(desiredRank, desiredNumber);
    
    const result = desiredValue > currentValue;
    console.log(`[HELPER] Rank comparison result: ${currentValue} < ${desiredValue} = ${result}`);
    return result;
  } catch (error) {
    console.error(`[HELPER] Error comparing ranks: ${error.message}`);
    console.error(error.stack);
    // Default to false on error to prevent invalid boosts
    return false;
  }
}

// Check if a desired mastery is higher than current mastery
function isDesiredMasteryHigher(currentMastery, currentNumber, desiredMastery, desiredNumber) {
  try {
    console.log(`[HELPER] Comparing masteries: ${currentMastery} ${currentNumber} vs ${desiredMastery} ${desiredNumber}`);
    
    const currentValue = getMasteryValue(currentMastery, currentNumber);
    const desiredValue = getMasteryValue(desiredMastery, desiredNumber);
    
    const result = desiredValue > currentValue;
    console.log(`[HELPER] Mastery comparison result: ${currentValue} < ${desiredValue} = ${result}`);
    return result;
  } catch (error) {
    console.error(`[HELPER] Error comparing masteries: ${error.message}`);
    console.error(error.stack);
    // Default to false on error to prevent invalid boosts
    return false;
  }
}

// Helper function to update the existing message
async function updateUserMessage(interaction, userData, options) {
  try {
    // If we have a message ID stored, try to edit that message
    if (userData.lastMessageId) {
      try {
        // Try to edit the original message
        await interaction.editReply(options);
        return true;
      } catch (error) {
        console.error(`[UPDATE_MESSAGE] Failed to edit message: ${error.message}`);
        // Fall back to sending a new message if editing fails
      }
    }
    
    // If we don't have a message ID or editing failed, send a new message
    const response = await interaction.reply({
      ...options,
      flags: 64,  // Ephemeral flag
      fetchReply: true
    });
    
    // Store the new message ID
    userData.lastMessageId = response.id;
    flowState.set(interaction.user.id, userData);
    return true;
  } catch (error) {
    console.error(`[UPDATE_MESSAGE] Error updating message: ${error.message}`);
    return false;
  }
}

// Handle ranked rank selection
async function handleRankedRankSelection(interaction, rankInput) {
  const userData = flowState.get(interaction.user.id);
  if (!userData) {
    console.error(`[RANKED_FLOW] No user data found for ${interaction.user.id}`);
    return safeInteractionReply(interaction, { 
      content: 'Session data not found. Please try again.',
      flags: 64
    });
  }

  try {
    console.log(`[DEBUG] handleRankedRankSelection: rankInput=${rankInput}, step=${userData.step}`);

    // Acknowledge the interaction to prevent timeout
    await interaction.deferUpdate().catch(console.error);
    
    let baseRankName = rankInput;
    let specificRankNumber = null;

    if (rankInput.includes('_')) {
      const parts = rankInput.split('_');
      baseRankName = parts[0];
      specificRankNumber = parts[1];
    }

    if (userData.step === 'current_rank') {
      userData.currentRank = baseRankName;
      userData.step = 'current_rank_specific';
      
      const rankUIDetails = getRankUIDetails(baseRankName);
      
      // Use rank-specific color for the embed
      const embedColor = RANK_COLORS[baseRankName] || PINK_COLOR;
    
      const embed = new EmbedBuilder()
        .setTitle('Specify Rank')
        .setDescription(`Specify your exact ${baseRankName} rank.`)
        .setColor(embedColor);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ranked_${baseRankName}_1`).setLabel(`${baseRankName} 1`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style),
        new ButtonBuilder().setCustomId(`ranked_${baseRankName}_2`).setLabel(`${baseRankName} 2`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style),
        new ButtonBuilder().setCustomId(`ranked_${baseRankName}_3`).setLabel(`${baseRankName} 3`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style)
      );
      flowState.set(interaction.user.id, userData);
      
      // Edit the existing message
      return updateUserMessage(interaction, userData, { 
        embeds: [embed], 
        components: [row] 
      });

    } else if (userData.step === 'current_rank_specific') {
      if (!specificRankNumber && !baseRankName.includes('Pro')) {
        console.log(`[RANKED_FLOW_DEBUG] Expected specific rank number for ${baseRankName}, but continuing with selection`);
        // Instead of showing an error, we'll set the currentRank and move to the next step
        userData.currentRank = baseRankName;
        userData.step = 'current_rank_specific';
        flowState.set(interaction.user.id, userData);
        
        const rankUIDetails = getRankUIDetails(baseRankName);
        
        // Use rank-specific color for the embed
        const embedColor = RANK_COLORS[baseRankName] || PINK_COLOR;
      
        const embed = new EmbedBuilder()
          .setTitle('Specify Rank')
          .setDescription(`Specify your exact ${baseRankName} rank.`)
          .setColor(embedColor);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ranked_${baseRankName}_1`).setLabel(`${baseRankName} 1`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style),
          new ButtonBuilder().setCustomId(`ranked_${baseRankName}_2`).setLabel(`${baseRankName} 2`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style),
          new ButtonBuilder().setCustomId(`ranked_${baseRankName}_3`).setLabel(`${baseRankName} 3`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style)
        );
        
        // Edit the existing message
        return updateUserMessage(interaction, userData, { 
          embeds: [embed], 
          components: [row] 
        });
      }
      
      userData.currentRankSpecific = specificRankNumber;
      userData.formattedCurrentRank = `${userData.currentRank} ${specificRankNumber}`;
      userData.step = 'desired_rank';
      
      const currentRankValue = getRankValue(userData.currentRank, specificRankNumber);
      const embed = new EmbedBuilder().setTitle('Desired Rank').setDescription('Please select your desired rank below.').setColor(PINK_COLOR);
      
      const rankButtons = generateRankButtons(currentRankValue, 'ranked_');

      if (rankButtons.rows.length === 0) {
        return updateUserMessage(interaction, userData, { 
          content: 'You have selected the highest rank or an invalid rank. There are no higher ranks to boost to.', 
          embeds:[], 
          components: []
        });
      }

      flowState.set(interaction.user.id, userData);
      return updateUserMessage(interaction, userData, { 
        embeds: [embed], 
        components: rankButtons.rows 
      });

    } else if (userData.step === 'desired_rank') {
      userData.desiredRank = baseRankName;
      // If Pro is selected, skip desired_rank_specific and go straight to payment method selection
      if (baseRankName === 'Pro') {
        userData.desiredRankSpecific = null;
        userData.formattedDesiredRank = 'Pro';
        
        // Explicitly verify that Pro (value 100) is higher than current rank
        const currentRankValue = getRankValue(userData.currentRank, userData.currentRankSpecific);
        const proRankValue = getRankValue('Pro', '');
        
        if (proRankValue <= currentRankValue) {
          console.log(`[RANKED_FLOW] Pro rank value ${proRankValue} is not higher than current rank value ${currentRankValue}`);
          return updateUserMessage(interaction, userData, { 
            content: 'You cannot select Pro as your desired rank because it is not higher than your current rank.',
            embeds: [],
            components: []
          });
        }
        
        console.log(`[RANKED_FLOW] Pro rank selected with value ${proRankValue} which is higher than current rank value ${currentRankValue}`);
        flowState.set(interaction.user.id, userData);
        return showPaymentMethodSelection(interaction);
      }
      userData.step = 'desired_rank_specific';

      const rankUIDetails = getRankUIDetails(baseRankName);
      const currentRankValue = getRankValue(userData.currentRank, userData.currentRankSpecific);
      
      // Use rank-specific color for the embed
      const embedColor = RANK_COLORS[baseRankName] || PINK_COLOR;
      
      const embed = new EmbedBuilder().setTitle('Specify Desired Rank').setDescription(`Specify your exact desired ${baseRankName} rank.`).setColor(embedColor);
      const specificButtons = [];
      for (let i = 1; i <= 3; i++) {
        if (getRankValue(baseRankName, i.toString()) > currentRankValue) {
          specificButtons.push(
            new ButtonBuilder().setCustomId(`ranked_${baseRankName}_${i}`).setLabel(`${baseRankName} ${i}`).setEmoji(rankUIDetails.emoji).setStyle(rankUIDetails.style)
          );
        }
      }

      if (specificButtons.length === 0) {
        return updateUserMessage(interaction, userData, { 
          content: 'There are no valid rank options higher than your current rank for this category.', 
          embeds: [],
          components: []
        });
      }
      const row = new ActionRowBuilder().addComponents(...specificButtons);
      flowState.set(interaction.user.id, userData);
      return updateUserMessage(interaction, userData, { 
        embeds: [embed], 
        components: [row] 
      });

    } else if (userData.step === 'desired_rank_specific') {
      if (!specificRankNumber && !baseRankName.includes('Pro')) {
        console.log(`[RANKED_FLOW_DEBUG] Expected specific rank number for ${baseRankName}, but continuing with selection`);
        // Instead of showing an error, try to go back to the desired_rank step
        userData.step = 'desired_rank';
        flowState.set(interaction.user.id, userData);
        
        // Recursively call this function again with the same input
        return handleRankedRankSelection(interaction, baseRankName);
      }
      
      userData.desiredRankSpecific = specificRankNumber;
      userData.formattedDesiredRank = `${userData.desiredRank} ${specificRankNumber}`;
      
      // Special case for Pro rank which has no number
      if (userData.desiredRank === 'Pro') {
        userData.formattedDesiredRank = 'Pro';
        userData.desiredRankSpecific = null;
      }
      
      // Check if desired rank is higher than current rank
      const isHigher = isDesiredRankHigher(userData.currentRank, userData.currentRankSpecific, userData.desiredRank, userData.desiredRankSpecific);
      
      if (!isHigher) {
        return updateUserMessage(interaction, userData, { 
          content: 'The desired rank must be higher than your current rank.', 
          embeds: [],
          components: []
        });
      }
      flowState.set(interaction.user.id, userData);
      return showPaymentMethodSelection(interaction);
    }
  } catch (error) {
    console.error(`[RANKED_FLOW] Error in handleRankedRankSelection: ${error.message}`);
    console.error(error.stack);
    
    return interaction.followUp({
      content: 'An error occurred while processing your rank selection. Please try again.',
      flags: 64
    }).catch(console.error);
  }
}

// Show Dutch payment method selection
async function showDutchPaymentMethodSelection(interaction) {
  try {
    console.log(`[PAYMENT_FLOW] Showing Dutch payment selection for user ${interaction.user.id}`);
    
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[PAYMENT_FLOW] No user data found for ${interaction.user.id} in Dutch payment selection`);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ 
          content: 'Session data not found. Please try again.',
          flags: InteractionResponseFlags.Ephemeral
        });
      }
      return;
    }
    
    // Get price information for conditional rendering
    let price = 0;
    if (userData.price !== undefined) {
      price = parseFloat(userData.price);
    }
    
    // Update user state
    userData.paymentMethod = 'Dutch Payment Methods';
    userData.step = 'dutch_payment_selection';
    flowState.set(interaction.user.id, userData);
    
    const embed = new EmbedBuilder()
      .setTitle('Dutch Payment Method')
      .setDescription('Please select what type of Dutch Payment Method you will be sending.')
      .setColor(PINK_COLOR);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('dutch_method_select')
      .setPlaceholder('Select Payment Method');
      
    // Always add Tikkie option
    const options = [
      new StringSelectMenuOptionBuilder()
        .setLabel('Tikkie')
        .setValue('dutch_tikkie')
        .setEmoji('<:tikkie:1371869238259875922>')
    ];
    
    // Only add Bol.com if price is below 100 euros
    if (price < 100) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel('Bol.com Giftcard')
          .setDescription('Additional Fees may Apply - 20-50%')
          .setValue('dutch_bolcom')
          .setEmoji('<:bolcom:1371870572237160448>')
      );
    }
    
    selectMenu.addOptions(options);
    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Always edit the ephemeral message, not the ticket panel
    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error(`[PAYMENT_FLOW] Error in showDutchPaymentMethodSelection: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ 
        content: 'An error occurred while showing Dutch payment options. Please try again later.',
        flags: InteractionResponseFlags.Ephemeral 
      });
    }
  }
}

// Show purchase account payment method selection
async function showPurchaseAccountPaymentMethodSelection(interaction, price = null) {
  const embed = new EmbedBuilder()
    .setTitle('Payment Method')
    .setDescription('Please select your payment method.')
    .setColor(PINK_COLOR);

  const selectOptions = [
    new StringSelectMenuOptionBuilder()
      .setLabel('IBAN Bank Transfer')
      .setDescription('IBAN only. This only works for EU banks.')
      .setValue('purchase_account_iban')
      .setEmoji('<:bank:1371863843789209691>'),
    new StringSelectMenuOptionBuilder()
      .setLabel('Crypto')
      .setDescription('No memecoins or such.')
      .setValue('purchase_account_crypto')
      .setEmoji('<:crypto:1371863500720177314>'),
    new StringSelectMenuOptionBuilder()
      .setLabel('PayPal')
      .setDescription('10% Extra Fees - Only for Accounts, not for Boosts and such.')
      .setValue('purchase_account_paypal')
      .setEmoji('<:paypal:1371862922766192680>'),
    new StringSelectMenuOptionBuilder()
      .setLabel('Dutch Payment Methods')
      .setDescription('Only for Dutch people - the Netherlands - No other countries.')
      .setValue('purchase_account_dutch')
      .setEmoji('<:tikkie:1371869238259875922>')
  ];
  
  // Only add PayPal Giftcard option if price is below 100
  if (!price || price < 100) {
    selectOptions.splice(3, 0, 
      new StringSelectMenuOptionBuilder()
        .setLabel('PayPal Giftcard')
        .setDescription('Purchaseable on G2A.com or Eneba.com - Extra fees may apply.')
        .setValue('purchase_account_paypal_giftcard')
        .setEmoji('<:paypal:1371862922766192680>')
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('purchase_account_payment_select')
    .setPlaceholder('Select Payment Method')
    .addOptions(selectOptions);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return interaction.update({ embeds: [embed], components: [row] });
}

// Show purchase account crypto selection
async function showPurchaseAccountCryptoSelection(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Crypto Currency')
    .setDescription('Please select what type of Crypto Coin you will be sending.')
    .setColor(PINK_COLOR);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('purchase_account_crypto_select')
    .setPlaceholder('Select Crypto Currency')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Litecoin')
        .setValue('purchase_account_crypto_litecoin')
        .setEmoji('<:Litecoin:1371864997012963520>'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Solana')
        .setValue('purchase_account_crypto_solana')
        .setEmoji('<:Solana:1371865225824960633>'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Bitcoin')
        .setDescription('We will not be covering transaction fees.')
        .setValue('purchase_account_crypto_bitcoin')
        .setEmoji('<:Bitcoin:1371865397623652443>'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Other')
        .setDescription('Mainstream only - No memecoins.')
        .setValue('purchase_account_crypto_other')
        .setEmoji('<:crypto:1371863500720177314>')
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return interaction.update({ embeds: [embed], components: [row] });
}

// Show purchase account Dutch payment method selection
async function showPurchaseAccountDutchPaymentMethodSelection(interaction, price = null) {
  try {
    console.log(`[PAYMENT_FLOW] Showing Dutch payment selection for purchase account, user ${interaction.user.id}`);
    
    // Get user data from flow state
    const userData = flowState.get(interaction.user.id) || {};
    
    // Update user state
    userData.paymentMethod = 'Dutch Payment Methods';
    userData.step = 'purchase_account_dutch_payment';
    if (price) userData.price = price;
    flowState.set(interaction.user.id, userData);
    
  const embed = new EmbedBuilder()
    .setTitle('Dutch Payment Method')
    .setDescription('Please select what type of Dutch Payment Method you will be sending.')
    .setColor(PINK_COLOR);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('purchase_account_dutch_payment_select')
      .setPlaceholder('Select Payment Method');
      
    // Always add Tikkie option
    selectMenu.addOptions([
    new StringSelectMenuOptionBuilder()
      .setLabel('Tikkie')
      .setValue('purchase_account_dutch_tikkie')
        .setEmoji({ name: 'tikkie', id: '1371869238259875922' })
    ]);
  
    // Only add Bol.com Giftcard option if price is below €100
    const accountPrice = parseFloat(userData.price || price || 0);
    if (accountPrice < 100) {
      selectMenu.addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Bol.com Giftcard')
        .setDescription('Additional Fees may Apply - 20-50%')
          .setValue('purchase_account_dutch_bolcom')
          .setEmoji({ name: 'bolcom', id: '1371870572237160448' })
      ]);
  }

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return interaction.update({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error(`[PAYMENT_FLOW] Error in showPurchaseAccountDutchPaymentMethodSelection: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ 
        content: 'An error occurred while showing Dutch payment options. Please try again later.',
        ephemeral: true 
      });
    }
  }
}

// Show price embed
async function showPriceEmbed(interaction) {
  try {
    console.log(`[PRICE_EMBED] Showing price confirmation for ${interaction.user.id}, type: ${flowState.get(interaction.user.id)?.type}`);
    
    // Make sure the interaction is deferred
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 }).catch(console.error);
    }
    
    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[PRICE_EMBED] No user data found for ${interaction.user.id}`);
      return interaction.followUp({ 
        content: 'Session data not found. Please try again.',
        flags: 64
      });
    }
    
    let price = 0;
    let formattedPrice = '';
    let priceMultiplier = 1.0; // Default multiplier (no change)
    
    // Calculate price based on boost type
    if (userData.type === 'ranked') {
      price = calculateRankedPrice(userData.currentRank, userData.currentRankSpecific, userData.desiredRank, userData.desiredRankSpecific);
      console.log(`[RANKED_PRICE_DEBUG] Calculated base price from ${userData.currentRank} ${userData.currentRankSpecific} to ${userData.desiredRank} ${userData.desiredRankSpecific}: €${price.toFixed(2)}`);
      
      // Apply P11 price multiplier if applicable
      if (userData.p11Count !== undefined) {
        const p11Count = userData.p11Count;
        console.log(`[P11_PRICE_DEBUG] Applying P11 multiplier. User has ${p11Count} P11 brawlers.`);
        
        // Apply multiplier based on desired rank and P11 count
        const desiredRank = userData.desiredRank;
        
        // Bronze, Silver, or Gold: No multiplier
        if (desiredRank === 'Bronze' || desiredRank === 'Silver' || desiredRank === 'Gold') {
          priceMultiplier = 1.0;
        }
        // Diamond or Mythic: Multiplier if P11 < 15
        else if (desiredRank === 'Diamond' || desiredRank === 'Mythic') {
          if (p11Count < 15) {
            priceMultiplier = 1.5;
          }
        }
        // Legendary: Different multipliers based on P11 count
        else if (desiredRank === 'Legendary') {
          if (p11Count <= 20) {
            priceMultiplier = 1.5;
          } else if (p11Count <= 30) {
            priceMultiplier = 1.1;
          }
        }
        // Masters 1: Different multipliers based on P11 count
        else if (desiredRank === 'Masters' && userData.desiredRankSpecific === '1') {
          if (p11Count <= 20) {
            priceMultiplier = 2.0;
          } else if (p11Count <= 30) {
            priceMultiplier = 1.5;
          } else if (p11Count <= 35) {
            priceMultiplier = 1.1;
          }
        }
        // Masters 2: Different multipliers based on P11 count
        else if (desiredRank === 'Masters' && userData.desiredRankSpecific === '2') {
          if (p11Count <= 20) {
            priceMultiplier = 3.0;
          } else if (p11Count <= 30) {
            priceMultiplier = 2.0;
          } else if (p11Count <= 35) {
            priceMultiplier = 1.5;
          } else if (p11Count <= 40) {
            priceMultiplier = 1.25;
          } else if (p11Count <= 45) {
            priceMultiplier = 1.1;
          }
        }
        // Masters 3: Different multipliers based on P11 count
        else if (desiredRank === 'Masters' && userData.desiredRankSpecific === '3') {
          if (p11Count <= 20) {
            priceMultiplier = 4.0;
          } else if (p11Count <= 30) {
            priceMultiplier = 3.0;
          } else if (p11Count <= 35) {
            priceMultiplier = 2.5;
          } else if (p11Count <= 40) {
            priceMultiplier = 2.0;
          } else if (p11Count <= 45) {
            priceMultiplier = 1.5;
          } else if (p11Count <= 50) {
            priceMultiplier = 1.25;
          }
        }
        // Pro: Different multipliers based on P11 count
        else if (desiredRank === 'Pro') {
          if (p11Count <= 20) {
            priceMultiplier = 5.0;
          } else if (p11Count <= 30) {
            priceMultiplier = 4.0;
          } else if (p11Count <= 35) {
            priceMultiplier = 3.0;
          } else if (p11Count <= 40) {
            priceMultiplier = 2.75;
          } else if (p11Count <= 45) {
            priceMultiplier = 2.25;
          } else if (p11Count <= 50) {
            priceMultiplier = 1.5;
          } else if (p11Count <= 55) {
            priceMultiplier = 1.25;
          } else if (p11Count <= 60) {
            priceMultiplier = 1.15;
          }
        }
        
        // Apply the multiplier to the price
        if (priceMultiplier !== 1.0) {
          console.log(`[P11_PRICE_DEBUG] Applying multiplier ${priceMultiplier}x to price €${price.toFixed(2)}`);
          price = price * priceMultiplier;
          console.log(`[P11_PRICE_DEBUG] Final price after P11 multiplier: €${price.toFixed(2)}`);
        } else {
          console.log(`[P11_PRICE_DEBUG] No P11 multiplier applied for rank ${desiredRank} with ${p11Count} P11 brawlers`);
        }
      }
    }
    // Handle other boost types (keeping existing code)
    else if (userData.type === 'bulk') {
      price = calculateBulkPrice(userData.currentBulkTrophies, userData.desiredBulkTrophies);
      console.log(`[BULK_PRICE_DEBUG] Calculated total price from ${userData.currentBulkTrophies} to ${userData.desiredBulkTrophies}: €${price.toFixed(2)}`);
    } else if (userData.type === 'trophies') {
      console.log('[TROPHY_PRICE_DEBUG] calculateTrophyPrice imported:', typeof calculateTrophyPrice);
      price = calculateTrophyPrice(userData.currentTrophies, userData.desiredTrophies);
      console.log(`[TROPHY_PRICE_DEBUG] Calculated total price from ${userData.currentTrophies} to ${userData.desiredTrophies}: €${price.toFixed(2)}`);
    } else if (userData.type === 'mastery') {
      // Use the formattedCurrentMastery and formattedDesiredMastery instead of separate values
      const currentMasteryParts = userData.formattedCurrentMastery ? userData.formattedCurrentMastery.split(' ') : [userData.currentMastery, userData.currentMasterySpecific];
      const desiredMasteryParts = userData.formattedDesiredMastery ? userData.formattedDesiredMastery.split(' ') : [userData.desiredMastery, userData.desiredMasterySpecific];
      
      // Ensure we have proper values
      const currentMastery = currentMasteryParts[0] || userData.currentMastery;
      const currentMasterySpecific = currentMasteryParts[1] || userData.currentMasterySpecific;
      const desiredMastery = desiredMasteryParts[0] || userData.desiredMastery;
      const desiredMasterySpecific = desiredMasteryParts[1] || userData.desiredMasterySpecific;
      
      price = calculateMasteryPrice(userData.brawler, currentMastery, currentMasterySpecific, desiredMastery, desiredMasterySpecific);
      console.log(`[MASTERY_PRICE_DEBUG] Calculated total price from ${currentMastery} ${currentMasterySpecific} to ${desiredMastery} ${desiredMasterySpecific}: €${price.toFixed(2)}`);
    }
    
    if (price <= 0) {
      console.error(`[PRICE_EMBED] Invalid price calculated for type: ${userData.type}, current: ${userData.currentTrophies}, desired: ${userData.desiredTrophies}`);
      return interaction.followUp({ 
        content: 'Invalid price calculation. Please try again or contact support.',
        flags: 64
      });
    }
    
    // Format price for display
    formattedPrice = `€${price.toFixed(2)}`;
    
    // Save price to user data
    userData.price = formattedPrice;
    userData.basePrice = formattedPrice; // Store the original price before any multipliers
    userData.priceMultiplier = priceMultiplier; // Store the applied multiplier
    
    // Create a new message ID for the order confirmation
    // This ensures we don't edit the previous selection messages
    delete userData.lastMessageId;
    flowState.set(interaction.user.id, userData);
    
    // Create embed based on boost type
    const embed = new EmbedBuilder()
      .setTitle('Order Confirmation')
      .setColor(PINK_COLOR);
    
    if (userData.type === 'ranked') {
      let description = `Please confirm your order details:\n\n**Current Rank:** \`${userData.formattedCurrentRank}\`\n**Desired Rank:** \`${userData.formattedDesiredRank}\``;
      
      // Add P11 count to the description if available
      if (userData.p11Count !== undefined) {
        description += `\n**P11 Count:** \`${userData.p11Count}\``;
        
        // Add multiplier info if a multiplier was applied
        if (priceMultiplier !== 1.0) {
          description += `\n**Price Multiplier:** \`${priceMultiplier}x\``;
        }
      }
      
      description += `\n**Payment Method:** \`${userData.paymentMethod}\`\n\n**Total Price:** \`${formattedPrice}\``;
      
      embed.setDescription(description);
    }
    // Keeping existing code for other boost types
    else if (userData.type === 'bulk') {
      embed.setDescription(`Please confirm your order details:\n\n**Current Trophies:** \`${userData.currentBulkTrophies}\`\n**Desired Trophies:** \`${userData.desiredBulkTrophies}\`\n**Payment Method:** \`${userData.paymentMethod}\`\n\n**Total Price:** \`${formattedPrice}\``);
    } else if (userData.type === 'trophies') {
      let description = `Please confirm your order details:\n\n**Brawler:** \`${userData.brawler}\`\n**Current Trophies:** \`${userData.currentTrophies}\`\n**Desired Trophies:** \`${userData.desiredTrophies}\``;
      
      // Add brawler level if available
      if (userData.brawlerLevel !== undefined) {
        description += `\n**Brawler Power Level:** \`${userData.brawlerLevel}\``;
      }
      
      // Add price multiplier if available
      if (userData.priceMultiplier !== undefined && userData.priceMultiplier !== 1.0) {
        description += `\n**Price Multiplier:** \`${userData.priceMultiplier}x\``;
        
        // Add base price if available
        if (userData.basePrice) {
          description += `\n**Base Price:** \`€${userData.basePrice}\``;
        }
      }
      
      description += `\n**Payment Method:** \`${userData.paymentMethod}\`\n\n**Total Price:** \`${formattedPrice}\``;
      
      embed.setDescription(description);
    } else if (userData.type === 'mastery') {
      embed.setDescription(`Please confirm your order details:\n\n**Brawler:** \`${userData.brawler}\`\n**Current Mastery:** \`${userData.formattedCurrentMastery}\`\n**Desired Mastery:** \`${userData.formattedDesiredMastery}\`\n**Payment Method:** \`${userData.paymentMethod}\`\n\n**Total Price:** \`${formattedPrice}\``);
    }
    
    // Add confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_ticket')
        .setLabel('Confirm')
        .setEmoji('<:checkmark:1357478063616688304>')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('cancel_ticket')
        .setLabel('Cancel')
        .setEmoji('❌')  // Using a standard Unicode emoji instead of a custom one
        .setStyle(ButtonStyle.Danger)
    );
    
    // Use editReply if the interaction is deferred, otherwise use reply
    if (interaction.deferred) {
      await interaction.editReply({
      embeds: [embed], 
      components: [row], 
        flags: 64
      });
    } else if (interaction.replied) {
      await interaction.followUp({
        embeds: [embed],
        components: [row],
        flags: 64
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: 64
      });
    }
    
    return true;
  } catch (error) {
    console.error(`[PRICE_EMBED] Error in showPriceEmbed: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (interaction.deferred) {
        return interaction.editReply({
          content: 'An error occurred while showing the price confirmation. Please try again.',
          flags: 64
        });
      } else if (interaction.replied) {
        return interaction.followUp({
          content: 'An error occurred while showing the price confirmation. Please try again.',
          flags: 64
        });
      } else {
        return interaction.reply({
          content: 'An error occurred while showing the price confirmation. Please try again.',
          flags: 64
        });
      }
    } catch (responseError) {
      console.error(`[PRICE_EMBED] Error sending error response: ${responseError.message}`);
    }
  }
}

// Handle purchase boost button
async function handlePurchaseBoostClick(interaction) {
  try {
    await interaction.deferReply({ flags: 64 }); // Defer the reply immediately

    const userData = flowState.get(interaction.user.id);
    
    if (!userData) {
      return interaction.editReply({
        content: 'Session data not found. Please try again.',
      });
    }
    
    if (!userData.price || isNaN(parseFloat(userData.price))) {
      console.error(`[PURCHASE_BOOST] Invalid price for user ${interaction.user.id}: ${userData.price}`);
      userData.price = 0; 
    } else {
      userData.price = parseFloat(userData.price);
    }
    
    console.log(`[PURCHASE_BOOST] User ${interaction.user.id} clicked purchase. Payment Method: ${userData.paymentMethod}, Price: €${userData.price}`);

    const type = userData.type;
    const username = interaction.user.username;
    const channelName = getChannelNameByType(type, userData, username);
    const categoryId = getCategoryIdByType(type);
    const channel = await createTicketChannelWithOverflow(
      interaction.guild,
      interaction.user.id,
      categoryId,
      channelName,
      `User ID: ${interaction.user.id} | Price: €${userData.price} | Method: ${userData.paymentMethod}`
    );
    
    if (!channel) {
      return interaction.editReply({
        content: 'Failed to create ticket. Please try again or contact staff.',
      });
    }
    
    await interaction.editReply({
      content: `Your ticket has been created: <#${channel.id}>`,
    });
    
    await sendWelcomeEmbed(channel, interaction.user.id);
    await sendOrderRecapEmbed(channel, userData);
    
    // Send payment information based on selected method
    const paymentMethod = userData.paymentMethod;
    const userId = interaction.user.id;
    const price = parseFloat(userData.price || 0);

    console.log(`[PURCHASE_BOOST] Routing to payment embed for method: ${paymentMethod} in channel ${channel.id}`);

    if (paymentMethod === 'PayPal') {
      await sendPayPalTermsEmbed(channel, userId, interaction);
    } else if (paymentMethod === 'IBAN Bank Transfer') {
      await sendIbanEmbed(channel, userId, interaction);
    } else if (paymentMethod === 'Crypto') {
      // Send crypto payment information based on the selected crypto type
      console.log(`[PURCHASE_BOOST] Crypto selected. Type: ${userData.cryptoType}. Sending specific crypto embed...`);
      if (userData.cryptoType === 'Litecoin') {
        await sendLitecoinEmbed(channel, userId, price, interaction);
      } else if (userData.cryptoType === 'Solana') {
        await sendSolanaEmbed(channel, userId, price, interaction);
      } else if (userData.cryptoType === 'Bitcoin') {
        await sendBitcoinEmbed(channel, userId, price, interaction);
      } else {
        // Generic message for 'Other' or unspecified crypto
        await channel.send({content: `Crypto payment selected (${userData.cryptoType || 'unspecified'}). Specific instructions will follow soon or were shown prior.`});
      }
    } else if (paymentMethod === 'PayPal Giftcard') {
        await sendPayPalGiftcardEmbed(channel, userId, interaction);
    } else if (paymentMethod === 'German Apple Giftcard') {
        await sendAppleGiftcardEmbed(channel, userId, interaction);
    } else if (paymentMethod === 'Dutch Payment Methods') {
        // This would have a sub-type like Tikkie or Bol.com
        if (userData.dutchPaymentType === 'Tikkie') {
          await sendTikkieEmbed(channel, userId, interaction);
        } else if (userData.dutchPaymentType === 'Bol.com Giftcard') {
          await sendBolGiftcardEmbed(channel, userId, interaction);
        } else {
          await channel.send({content: `Dutch Payment Method (${userData.dutchPaymentType || 'unspecified'}) instructions will be shown here.`});
        }
    } else {
      console.warn(`[PURCHASE_BOOST] Unhandled payment method: ${paymentMethod} for user ${userId}. No specific embed sent.`);
      // Fallback or error message
      await channel.send({ embeds: [new EmbedBuilder().setColor(PINK_COLOR).setTitle(paymentMethod).setDescription('Payment processing information will be displayed here shortly.')] });
    }
    
    // Clear flow state after processing
    // flowState.delete(interaction.user.id); // Moved to after successful embed sending or if ticket creation failed

    return;
  } catch (error) {
    console.error(`[PURCHASE_BOOST] Error creating ticket: ${error.message}`);
    console.error(error.stack);
    // Ensure reply/followUp is possible
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ // Use editReply if deferred/replied
            content: 'An error occurred while creating your ticket. Please try again or contact staff.',
        }).catch(e => console.error("Error sending editReply in purchase boost catch:", e));
    } else {
        // This case should ideally not be reached if we defer at the start
        await interaction.reply({ 
            content: 'An error occurred while creating your ticket. Please try again or contact staff.',
            ephemeral: true 
        }).catch(e => console.error("Error sending reply in purchase boost catch:", e));
    }
    return; // Explicitly return after handling error
  }
}

// Handle payment method selection from the select menu
async function handlePaymentMethodSelect(interaction) {
  // This function is now handled directly in interactions.js
  console.log(`[PAYMENT_SELECT] This function is deprecated and now handled directly in interactions.js. Interaction ID: ${interaction.id}`);
  return;
}

// Handle Dutch payment method selection from the select menu
async function handleDutchMethodSelect(interaction) {
  try {
    await interaction.deferUpdate().catch(console.error);
    const selectedValue = interaction.values[0]; // e.g., 'dutch_tikkie'
    console.log(`[PAYMENT_FLOW] User ${interaction.user.id} selected Dutch payment method: ${selectedValue}`);

    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      return interaction.followUp({ content: 'Session data not found. Please try again.', flags: 64 });
    }

    // userData.dutchPaymentType = selectedValue.replace('dutch_', ''); // Store as 'tikkie' or 'bolcom'
    // Correctly set the dutchPaymentType based on the value
    if (selectedValue === 'dutch_tikkie') {
        userData.dutchPaymentType = 'Tikkie';
    } else if (selectedValue === 'dutch_bolcom') {
        userData.dutchPaymentType = 'Bol.com Giftcard';
    } else {
        console.warn(`[PAYMENT_FLOW] Unknown Dutch payment type: ${selectedValue}`);
        userData.dutchPaymentType = selectedValue.replace('dutch_', ''); // Fallback
    }
    flowState.set(interaction.user.id, userData);
    
    // Proceed to show price or a confirmation step
    return showPriceEmbed(interaction);

  } catch (error) {
    console.error(`[PAYMENT_FLOW] Error in handleDutchMethodSelect: ${error.message}
${error.stack}`);
    if (interaction.deferred || interaction.replied) { // deferUpdate was called
      await interaction.followUp({ content: 'An error occurred processing your selection.', flags: 64 }).catch(console.error);
    } else {
      await interaction.reply({ content: 'An error occurred processing your selection.', flags: 64 }).catch(console.error);
    }
  }
}

// Handle crypto type selection from the select menu
async function handleCryptoTypeSelect(interaction) {
  try {
    await interaction.deferUpdate().catch(console.error);
    const selectedValue = interaction.values[0]; // e.g., 'crypto_litecoin'
    console.log(`[CRYPTO_FLOW] User ${interaction.user.id} selected crypto type: ${selectedValue}`);

    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      return interaction.followUp({ content: 'Session data not found. Please try again.', flags: 64 });
    }

    // Set the cryptoType based on the selected value
    if (selectedValue === 'crypto_litecoin') {
      userData.cryptoType = 'Litecoin';
    } else if (selectedValue === 'crypto_solana') {
      userData.cryptoType = 'Solana';
    } else if (selectedValue === 'crypto_bitcoin') {
      userData.cryptoType = 'Bitcoin';
    } else if (selectedValue === 'crypto_other') {
      userData.cryptoType = 'Other';
      // TODO: In the future, we can add a modal for specifying the 'Other' crypto type
      console.log('[CRYPTO_FLOW] Crypto "Other" selected, proceeding to price confirmation.');
    } else {
      console.warn(`[CRYPTO_FLOW] Unknown crypto type: ${selectedValue}`);
      userData.cryptoType = selectedValue.replace('crypto_', ''); // Fallback
    }
    
    flowState.set(interaction.user.id, userData);

    // Proceed to show price confirmation
    return showPriceEmbed(interaction);

  } catch (error) {
    console.error(`[CRYPTO_FLOW] Error in handleCryptoTypeSelect: ${error.message}`);
    console.error(error.stack);
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'An error occurred processing your selection.', flags: 64 }).catch(console.error);
    } else {
      await interaction.reply({ content: 'An error occurred processing your selection.', flags: 64 }).catch(console.error);
    }
  }
}

// Handle ticket confirmation button
async function handleTicketConfirm(interaction) {
  try {
    const userId = interaction.user.id;
    if (!flowState.has(userId)) {
      console.warn(`[TICKET_CONFIRM] No flow state for user ${userId}`);
      return;
    }
    
    const userData = flowState.get(userId);
    
    // Check if the ticket is already being processed
    if (userData.isProcessingTicket) {
      console.log(`[TICKET_CONFIRM] Already processing ticket for ${userId}, ignoring duplicate confirm`);
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: 'Your ticket is already being created. Please wait a moment.',
          flags: 64
        }).catch(err => console.error(`[TICKET_CONFIRM] Failed to followUp: ${err.message}`));
      } else {
        try {
          await interaction.reply({
            content: 'Your ticket is already being created. Please wait a moment.',
            flags: 64
          });
        } catch (replyErr) {
          console.error(`[TICKET_CONFIRM] Could not reply with error: ${replyErr.message}`);
        }
      }
      return;
    }
    
    // Set a flag to prevent duplicate ticket creation
    userData.isProcessingTicket = true;
    flowState.set(userId, userData);
    
    // Create a ticket channel with the appropriate type and name
    let channelName = '';
    let categoryId = '';
    
    // Use the abbreviation-based naming logic
    const type = userData.type;
    const username = interaction.user.username;
    
    // Get the channel name and category ID using our helper functions
    channelName = getChannelNameByType(type, userData, username);
    categoryId = getCategoryIdByType(type);
    
    // Debug logging
    console.log(`[TICKET DEBUG] Creating ticket: User=${userId}, Category=${categoryId}, BaseName=${channelName}`);
    
    // Validate category ID - if not valid, use null to create channel without a category
    if (!categoryId || categoryId === '') {
      console.log('[TICKET DEBUG] No valid category ID found, creating channel without category');
      categoryId = null;
    }
    
    // Prepare order details for the ticket
    const orderDetails = {
      type: userData.type,
      current: '',
      desired: '',
      price: userData.price
    };
    
    // Add specific details based on type
    if (userData.type === 'ranked') {
      orderDetails.current = `${userData.currentRank} ${userData.currentRankSpecific}`;
      orderDetails.desired = `${userData.desiredRank} ${userData.desiredRankSpecific}`;
    }
    else if (userData.type === 'bulk' || userData.type === 'trophies') {
      orderDetails.current = userData.currentTrophies;
      orderDetails.desired = userData.desiredTrophies;
    }
    else if (userData.type === 'mastery') {
      orderDetails.current = `${userData.currentMastery} ${userData.currentMasterySpecific}`;
      orderDetails.desired = `${userData.desiredMastery} ${userData.desiredMasterySpecific}`;
    }
    
    if (userData.paymentMethod) {
      orderDetails.paymentMethod = userData.paymentMethod;
    }
    
    // Create the ticket channel
    try {
      const guild = interaction.guild;
      const ticketChannel = await createTicketChannelWithOverflow(
        guild,
        interaction.user.id,
        categoryId,
        channelName,
        {
          type: userData.type,
          current: '',
          desired: '',
          price: userData.price
        }
      );
      
      // Check if ticket channel creation was successful
      if (!ticketChannel) {
        console.error(`[TICKET_CONFIRM] Failed to create ticket channel for ${userId}`);
        // Reset the processing flag so they can try again
        userData.isProcessingTicket = false;
        flowState.set(userId, userData);
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Failed to create ticket channel. Please try again or contact staff.',
            flags: 64
          }).catch(err => console.error(`[TICKET_CONFIRM] Failed to followUp: ${err.message}`));
        } else {
          try {
            await interaction.reply({
              content: 'Failed to create ticket channel. Please try again or contact staff.',
              flags: 64
            });
          } catch (replyErr) {
            console.error(`[TICKET_CONFIRM] Could not reply with error: ${replyErr.message}`);
          }
        }
        return;
      }
      
      // Send welcome message first
      await sendWelcomeEmbed(ticketChannel, userId);
      
      // Send order details next
      await sendOrderDetailsEmbed(ticketChannel, orderDetails);
      
      // Now send payment-specific embeds based on payment method
      try {
        const paymentMethodRaw = userData.paymentMethodRaw || '';
        console.log(`[TICKET_CONFIRM] Processing payment method: ${paymentMethodRaw} for user ${userId}`);
        
        if (paymentMethodRaw === 'paypal') {
          console.log(`[TICKET_CONFIRM] Sending PayPal Terms of Service for user ${userId}`);
          await sendPayPalTermsEmbed(ticketChannel, userId);
        } else if (paymentMethodRaw === 'iban') {
          await sendIbanEmbed(ticketChannel, userId);
        } else if (paymentMethodRaw === 'paypal_giftcard') {
          await sendPayPalGiftcardEmbed(ticketChannel, userId);
        } else if (paymentMethodRaw === 'apple_giftcard') {
          await sendAppleGiftcardEmbed(ticketChannel, userId);
        } else if (paymentMethodRaw === 'crypto') {
          // Handle crypto payment method based on selected type
          if (userData.cryptoType) {
            await showCryptoSelection(ticketChannel, userId, userData.price, userData.cryptoType);
          } else {
            await showCryptoSelection(ticketChannel, userId, userData.price);
          }
        } else if (paymentMethodRaw === 'dutch') {
          // Handle Dutch payment method based on selected type
          if (userData.dutchPaymentType === 'Tikkie') {
            await sendTikkieEmbed(ticketChannel, userId);
          } else if (userData.dutchPaymentType === 'Bol.com Giftcard') {
            await sendBolGiftcardEmbed(ticketChannel, userId);
          } else {
            // Generic Dutch payment message
            await ticketChannel.send({
              content: `Dutch Payment Method (${userData.dutchPaymentType || 'unspecified'}) selected. A staff member will provide further instructions.`
            });
          }
        } else {
          console.log(`[TICKET_CONFIRM] Unknown payment method: ${paymentMethodRaw}`);
          await ticketChannel.send({
            content: `Payment method: ${userData.paymentMethod || 'Unknown'}. A staff member will provide further instructions.`
          });
        }
      } catch (paymentError) {
        console.error(`[TICKET_CONFIRM] Error sending payment embed: ${paymentError.message}`);
        console.error(paymentError.stack);
        await ticketChannel.send(`Error sending payment information. Please contact staff. Error: ${paymentError.message}`);
      }
      
      // Send confirmation to the user
      if (interaction.replied || interaction.deferred) {
        try {
          await interaction.followUp({
            content: `Successfully opened ticket, your ticket: <#${ticketChannel.id}>`,
            flags: 64  // Ephemeral flag
          }).catch(err => console.error(`[TICKET_CONFIRM] Failed to followUp success: ${err.message}`));
        } catch (followupErr) {
          console.error(`[TICKET_CONFIRM] Could not send followup: ${followupErr.message}`);
        }
      } else {
        try {
          await interaction.reply({
            content: `Successfully opened ticket, your ticket: <#${ticketChannel.id}>`,
            flags: 64  // Ephemeral flag
          });
        } catch (replyErr) {
          console.error(`[TICKET_CONFIRM] Could not send reply: ${replyErr.message}`);
        }
      }
      
      // Try to edit the original message, but handle errors gracefully
      try {
        if (interaction.message) {
          await interaction.message.edit({
            content: 'Boost request confirmed',
            embeds: [],
            components: []
          }).catch(err => console.error(`[TICKET_CONFIRM] Could not edit message: ${err.message}`));
        }
      } catch (editErr) {
        console.error(`[TICKET_CONFIRM] Could not edit message: ${editErr.message}`);
      }
      
      console.log(`[TICKET DEBUG] Ticket setup completed for ${channelName}`);
      
      // Clear user data after successful ticket creation
      // Don't delete the data yet, just mark the ticket as processed
      userData.ticketCreated = true;
      userData.ticketChannelId = ticketChannel.id;
      flowState.set(userId, userData);
      
    } catch (error) {
      console.error(`[TICKET_CONFIRM] Error creating ticket: ${error.message}`);
      console.error(error.stack);
      // Reset the processing flag so they can try again
      userData.isProcessingTicket = false;
      flowState.set(userId, userData);
    }
  } catch (error) {
    console.error(`[TICKET_CONFIRM] Error creating ticket: ${error.message}`);
    console.error(error.stack);
    
    try {
      // Reset the processing flag in case of error
      const userData = flowState.get(interaction.user.id);
      if (userData) {
        userData.isProcessingTicket = false;
        flowState.set(interaction.user.id, userData);
      }
      
      // If we haven't responded yet, try to reply
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while creating your ticket. Please try again or contact staff.',
          flags: 64  // Ephemeral flag
        });
      } else {
        // If we've already responded, try to followUp
        await interaction.followUp({
          content: 'An error occurred while creating your ticket. Please try again or contact staff.',
          flags: 64  // Ephemeral flag
        }).catch(err => console.error(`[TICKET_CONFIRM] Failed to followUp error: ${err.message}`));
      }
    } catch (responseErr) {
      console.error(`[TICKET_CONFIRM] Could not respond with error: ${responseErr.message}`);
    }
  }
}

// Handle ticket cancellation button
async function handleTicketCancel(interaction) {
  try {
    // Get the user ID from the interaction instead of the customId
    const userId = interaction.user.id;
    
    try {
      // Try to update the message
      await interaction.update({
        content: 'Boost cancelled',
        embeds: [],
        components: []
      });
    } catch (updateErr) {
      console.error(`[TICKET_CANCEL] Could not update: ${updateErr.message}`);
      try {
        // If update fails, try to reply
        await interaction.reply({
          content: 'Boost cancelled',
          flags: 64  // Ephemeral flag
        });
      } catch (replyErr) {
        console.error(`[TICKET_CANCEL] Could not reply: ${replyErr.message}`);
      }
    }
    
    // Clear user data
    flowState.delete(userId);
    
  } catch (error) {
    console.error(`[TICKET_CANCEL] Error canceling ticket: ${error.message}`);
    console.error(error.stack);
    
    try {
      // Only reply if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while canceling. Please try again.',
          flags: 64  // Ephemeral flag
        });
      }
    } catch (responseErr) {
      console.error(`[TICKET_CANCEL] Could not respond with error: ${responseErr.message}`);
    }
  }
}

// Safe interaction response helper
async function safeInteractionResponse(interaction, options) {
  const interactionId = interaction.id;
  console.log(`[INTERACTION_SAFETY] Attempting to respond to interaction ${interactionId}`);
  
  try {
    // If the interaction is already replied or deferred, use editReply
    if (interaction.deferred) {
      console.log(`[INTERACTION_SAFETY] Using editReply for deferred interaction ${interactionId}`);
      return await interaction.editReply(options);
    } 
    // If the interaction has already been replied to, use followUp
    else if (interaction.replied) {
      console.log(`[INTERACTION_SAFETY] Using followUp for replied interaction ${interactionId}`);
      return await interaction.followUp({
        ...options,
        flags: 64  // Ephemeral flag
      });
    } 
    // Otherwise, use reply
    else {
      console.log(`[INTERACTION_SAFETY] Using reply for new interaction ${interactionId}`);
      return await interaction.reply({
        ...options,
        flags: 64  // Ephemeral flag
      });
    }
  } catch (error) {
    console.error(`[INTERACTION_SAFETY] Error responding to interaction ${interactionId}:`, error.message);
    
    // If we get "already handled" error, try a different method
    if (error.message.includes('already been replied') || 
        error.message.includes('already been deferred') || 
        error.message.includes('already handled')) {
      console.log(`[INTERACTION_SAFETY] Interaction ${interactionId} has already been handled in safeInteractionResponse.`);
      
      // Try followUp if possible
      try {
        if (typeof interaction.followUp === 'function') {
          console.log(`[INTERACTION_SAFETY] Attempting followUp for already handled interaction ${interactionId}`);
          return await interaction.followUp({
            ...options,
            flags: 64  // Ephemeral flag
          });
        }
      } catch (followUpError) {
        console.error(`[INTERACTION_SAFETY] FollowUp failed:`, followUpError.message);
      }
      
      // Try editReply if possible
      try {
        if (typeof interaction.editReply === 'function') {
          console.log(`[INTERACTION_SAFETY] Attempting editReply for already handled interaction ${interactionId}`);
          return await interaction.editReply(options);
        }
      } catch (editError) {
        console.error(`[INTERACTION_SAFETY] EditReply failed:`, editError.message);
      }
    }
    
    // Last resort attempt
    try {
      if (typeof interaction.channel?.send === 'function') {
        console.log(`[INTERACTION_SAFETY] Falling back to channel.send for interaction ${interactionId}`);
        await interaction.channel.send({
          content: 'There was an issue with the interaction. Please try again.',
          ...options
        });
      }
    } catch (channelError) {
      console.error(`[INTERACTION_SAFETY] Final fallback failed:`, channelError.message);
    }
    
    return null;
  }
}

// Helper function to safely reply to an interaction
async function safeInteractionReply(interaction, options) {
  try {
    // If we've already tried to respond to this interaction and it failed,
    // log it but don't try to respond again
    if (interaction._responded === true) {
      console.log(`[INTERACTION_SAFETY] Interaction ${interaction.id} has already been responded to. Skipping reply.`);
      return false;
    }
    
    // Mark this interaction as responded to
    interaction._responded = true;
    
    if (!interaction.replied && !interaction.deferred) {
      // If options has ephemeral set to true, replace it with flags
      if (options.ephemeral === true) {
        const { ephemeral, ...rest } = options;
        await interaction.reply({
          ...rest,
          flags: 64  // Ephemeral flag
        });
      } else {
      await interaction.reply(options);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[INTERACTION_REPLY] Error replying to interaction: ${error.message}`);
    return false;
  }
}

// Helper function to get Rank UI details (emoji, style)
function getRankUIDetails(rankName) {
  const details = {
    'Pro': { emoji: '<:pro:1351687685328208003>', style: ButtonStyle.Success },
    'Masters': { emoji: '<:Masters:1293283897618075728>', style: ButtonStyle.Success },
    'Legendary': { emoji: '<:Legendary:1264709440561483818>', style: ButtonStyle.Danger },
    'Mythic': { emoji: '<:mythic:1357482343555666181>', style: ButtonStyle.Danger },
    'Diamond': { emoji: '<:diamond:1357482488506613920>', style: ButtonStyle.Primary },
    'Gold': { emoji: '<:gold:1357482374048256131>', style: ButtonStyle.Success },
    'Silver': { emoji: '<:silver:1357482400333955132>', style: ButtonStyle.Primary },
    'Bronze': { emoji: '<:bronze:1357482418654937332>', style: ButtonStyle.Secondary },
  };
  return details[rankName] || { emoji: '⭐', style: ButtonStyle.Secondary };
}

// Helper function to generate rank selection buttons
function generateRankButtons(currentValue, prefix) {
  const ranks = ['Pro', 'Masters', 'Legendary', 'Mythic', 'Diamond', 'Gold', 'Silver', 'Bronze'];
  const allButtons = [];
  ranks.forEach(rank => {
    if (rank === 'Pro') { // Pro has no sub-tiers 1,2,3 in this context, it's a final tier
      if (getRankValue(rank, '') > currentValue) { // Check if Pro itself is higher
        const details = getRankUIDetails(rank);
        allButtons.push(new ButtonBuilder().setCustomId(`${prefix}${rank}`).setLabel(rank).setEmoji(details.emoji).setStyle(details.style));
      }
    } else {
      // For other ranks, check if their lowest sub-tier (e.g., Masters 1) is higher
      if (getRankValue(rank, '1') > currentValue || getRankValue(rank, '2') > currentValue || getRankValue(rank, '3') > currentValue ) {
        const details = getRankUIDetails(rank);
        allButtons.push(new ButtonBuilder().setCustomId(`${prefix}${rank}`).setLabel(rank).setEmoji(details.emoji).setStyle(details.style));
      }
    }
  });

  const rows = [];
  for (let i = 0; i < allButtons.length; i += 4) {
    rows.push(new ActionRowBuilder().addComponents(...allButtons.slice(i, i + 4)));
  }
  return { rows };
}

// Helper function to get Mastery UI details
function getMasteryUIDetails(masteryNameInput) {
  let masteryName = masteryNameInput;
  if (masteryName && typeof masteryName === 'string') {
    masteryName = masteryName.charAt(0).toUpperCase() + masteryName.slice(1).toLowerCase();
  } else if (!masteryName) { 
    console.warn('[MASTERY_UI_DETAILS] masteryNameInput is null or undefined');
    return { emoji: '⭐', style: ButtonStyle.Secondary };
  }

  const details = {
    'Gold': { emoji: '<:mastery_gold:1357487865029722254>', style: ButtonStyle.Success },
    'Silver': { emoji: '<:mastery_silver:1357487832481923153>', style: ButtonStyle.Primary },
    'Bronze': { emoji: '<:mastery_bronze:1357487786394914847>', style: ButtonStyle.Danger },
  };
  return details[masteryName] || { emoji: '⭐', style: ButtonStyle.Secondary };
}

// Helper function to generate mastery selection buttons
function generateMasteryButtons(currentValue, prefix) {
  const masteries = ['Gold', 'Silver', 'Bronze'];
  const allButtons = [];
  masteries.forEach(mastery => {
    // Check if the lowest sub-tier of this mastery (e.g., Gold 1) is higher than current
    if (getMasteryValue(mastery, '1') > currentValue || getMasteryValue(mastery, '2') > currentValue || getMasteryValue(mastery, '3') > currentValue) {
      const details = getMasteryUIDetails(mastery);
      allButtons.push(new ButtonBuilder().setCustomId(`${prefix}${mastery}`).setLabel(mastery).setEmoji(details.emoji).setStyle(details.style));
    }
  });
  const rows = [];
  for (let i = 0; i < allButtons.length; i += 3) { // Max 3 mastery buttons per row
    rows.push(new ActionRowBuilder().addComponents(...allButtons.slice(i, i + 3)));
  }
  return { rows };
}

// Show payment method selection
async function showPaymentMethodSelection(interaction) {
  try {
    console.log(`[PAYMENT_FLOW] Showing payment method selection to user ${interaction.user.id}`);

    const userData = flowState.get(interaction.user.id);
    if (!userData) {
      console.error(`[PAYMENT_FLOW] No user data found for ${interaction.user.id} in payment method selection`);
      return interaction.followUp({ 
        content: 'Session data not found. Please try again.',
        flags: 64  // Ephemeral flag
      });
    }
    
    // Update user state
    userData.step = 'payment_method_selection';
    flowState.set(interaction.user.id, userData);

    const embed = new EmbedBuilder()
      .setTitle('Payment Method')
      .setDescription('Please select your payment method.')
      .setColor(PINK_COLOR);

    // Prepare option for PayPal
    const paypalOption = new StringSelectMenuOptionBuilder()
      .setValue('paypal')
      .setLabel('PayPal')
      .setDescription('Friends & Family + PayPal Balance Payments ONLY!')
      .setEmoji('<:paypal:1371862922766192680>');
    
    // Prepare option for Crypto
    const cryptoOption = new StringSelectMenuOptionBuilder()
      .setValue('crypto')
      .setLabel('Crypto')
      .setDescription('No memecoins or such.')
      .setEmoji('<:crypto:1371863500720177314>');
    
    // Prepare option for IBAN
    const ibanOption = new StringSelectMenuOptionBuilder()
      .setValue('iban')
      .setLabel('IBAN Bank Transfer')
      .setDescription('IBAN only. This only works for EU banks.')
      .setEmoji('<:bank:1371863843789209691>');
    
    // Prepare option for PayPal Giftcard
    const paypalGiftcardOption = new StringSelectMenuOptionBuilder()
      .setValue('paypal_giftcard')
      .setLabel('PayPal Giftcard')
      .setDescription('Purchaseable on G2A.com or Eneba.com - Extra fees may apply.')
      .setEmoji('<:paypal:1371862922766192680>');
    
    // Prepare option for Dutch Payment Methods
    const dutchOption = new StringSelectMenuOptionBuilder()
      .setValue('dutch')
      .setLabel('Dutch Payment Methods')
      .setDescription('Only for Dutch people - the Netherlands - No other countries.')
      .setEmoji('<:tikkie:1371869238259875922>');
    
    // Prepare option for German Apple Giftcards
    const appleGiftcardOption = new StringSelectMenuOptionBuilder()
      .setValue('apple_giftcard')
      .setLabel('German Apple Giftcard')
      .setDescription('German Apple giftcards only, other countries are not accepted.')
      .setEmoji('<:applepay:1371864533047578755>');

    // Create payment method select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('payment_method_select')
      .setPlaceholder('Select Payment Method')
      .addOptions(paypalOption, cryptoOption, ibanOption, paypalGiftcardOption, dutchOption, appleGiftcardOption);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Use updateUserMessage to update the existing message or create a new one
    return updateUserMessage(interaction, userData, { 
      embeds: [embed], 
      components: [row]
    });
  } catch (error) {
    console.error(`[PAYMENT_FLOW] Error in showPaymentMethodSelection: ${error.message}`);
    console.error(error.stack);
    
    return interaction.followUp({
      content: 'An error occurred while loading payment options.',
      flags: 64  // Ephemeral flag
    });
  }
}

// Helper: Get rank abbreviation
function getRankAbbrev(rank, specific) {
  if (!rank) return '';
  const map = { bronze: 'b', silver: 's', gold: 'g', diamond: 'd', mythic: 'my', legendary: 'l', masters: 'm', pro: 'p' };
  const base = map[rank.toLowerCase()] || rank[0].toLowerCase();
  if (!specific || specific === '1' || specific === 1) return base;
  if (specific === '2' || specific === 2) return base + '2';
  if (specific === '3' || specific === 3) return base + '3';
  return base;
}
// Helper: Get mastery abbreviation
function getMasteryAbbrev(mastery, specific) {
  if (!mastery) return '';
  const map = { bronze: 'b', silver: 's', gold: 'g' };
  const base = map[mastery.toLowerCase()] || mastery[0].toLowerCase();
  if (!specific || specific === '1' || specific === 1) return base;
  if (specific === '2' || specific === 2) return base + '2';
  if (specific === '3' || specific === 3) return base + '3';
  return base;
}
// Helper: Sanitize username
function sanitizeUsername(username) {
  return username.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
}
// Helper: Get category ID by type
function getCategoryIdByType(type) {
  if (type === 'ranked') return '1322913302921089094';
  if (type === 'trophies') return '1322947795803574343';
  if (type === 'bulk') return '1322947859561320550';
  if (type === 'mastery') return '1322947859561320550';
  return null;
}
// Helper: Get channel name by type and userData
function getChannelNameByType(type, userData, username) {
  if (type === 'ranked') {
    const start = getRankAbbrev(userData.currentRank, userData.currentRankSpecific);
    const end = getRankAbbrev(userData.desiredRank, userData.desiredRankSpecific);
    return `${start}-${end}-${sanitizeUsername(username)}`;
  }
  if (type === 'trophies' || type === 'bulk') {
    return `${userData.currentTrophies}-${userData.desiredTrophies}-${sanitizeUsername(username)}`;
  }
  if (type === 'mastery') {
    const start = getMasteryAbbrev(userData.currentMastery, userData.currentMasterySpecific);
    const end = getMasteryAbbrev(userData.desiredMastery, userData.desiredMasterySpecific);
    return `${start}-${end}-${sanitizeUsername(username)}`;
  }
  return `${type}-${sanitizeUsername(username)}`;
}

// Helper function for ticket creation
async function createFinalTicket(interaction, userData, channel) {
  try {
    // Extract base info from user data
    const baseInfo = {
      creator: interaction.user,
      type: userData.type,
      price: userData.price
    };
    
    // Add type-specific details
    if (userData.type === 'ranked') {
      baseInfo.currentRank = userData.formattedCurrentRank;
      baseInfo.desiredRank = userData.formattedDesiredRank;
      
      // Include P11 count if available
      if (userData.p11Count !== undefined) {
        baseInfo.p11Count = userData.p11Count;
      }
    }
    // Add other types here as needed
    
    // Add payment method info
    baseInfo.paymentMethod = userData.paymentMethod;
    
    // Store ticket details in channel topic for future reference
    const topicParts = [];
    topicParts.push(`Ticket Type: ${baseInfo.type}`);
    topicParts.push(`User ID: ${baseInfo.creator.id}`);
    
    if (baseInfo.price) {
      topicParts.push(`Price: ${baseInfo.price}`);
    }
    
    if (baseInfo.currentRank && baseInfo.desiredRank) {
      topicParts.push(`From: ${baseInfo.currentRank} to ${baseInfo.desiredRank}`);
    }
    
    // Include P11 count in the channel topic if available
    if (baseInfo.p11Count !== undefined) {
      topicParts.push(`P11 Count: ${baseInfo.p11Count}`);
    }
    
    // Set the channel topic
    try {
      await channel.setTopic(topicParts.join(' | '));
    } catch (topicError) {
      console.error(`[TICKET] Error setting topic: ${topicError.message}`);
    }
    
    // Create initial welcome embed
    const { sendWelcomeEmbed } = require('../../ticketPayments');
    await sendWelcomeEmbed(channel, baseInfo.creator);
    
    // Create order details embed
    const orderDetails = new EmbedBuilder()
      .setTitle('Order Details')
      .setColor(PINK_COLOR);
    
    const fields = [];
    
    if (baseInfo.type === 'ranked') {
      fields.push(
        { name: 'Boost Type', value: 'Ranked Boost', inline: true },
        { name: 'Current Rank', value: baseInfo.currentRank || 'Unknown', inline: true },
        { name: 'Desired Rank', value: baseInfo.desiredRank || 'Unknown', inline: true }
      );
      
      // Add P11 count field if available
      if (baseInfo.p11Count !== undefined) {
        fields.push({ name: 'P11 Count', value: `${baseInfo.p11Count}`, inline: true });
      }
    }
    
    fields.push(
      { name: 'Payment Method', value: baseInfo.paymentMethod || 'Unknown', inline: true },
      { name: 'Price', value: baseInfo.price || 'Unknown', inline: true }
    );
    
    orderDetails.addFields(fields);
    
    // Send the order details embed
    await channel.send({ embeds: [orderDetails] });
    
    // Return the created ticket information
    return baseInfo;
  } catch (error) {
    console.error(`[TICKET] Error creating final ticket: ${error.message}`);
    console.error(error.stack);
    throw error;
  }
}

module.exports = {
  flowState,
  handleRankedFlow,
  handleBulkFlow,
  handleMasteryFlow,
  handleRankedRankSelection,
  handleMasterySelection,
  handleTicketConfirm,
  handleTicketCancel,
  showPaymentMethodSelection,
  showCryptoSelection,
  showDutchPaymentMethodSelection,
  handlePaymentMethodSelect,
  handleDutchMethodSelect,
  handleCryptoTypeSelect,
  showPriceEmbed,
  getRankValue,
  getMasteryValue,
  isDesiredRankHigher,
  showP11Modal,
  handleP11ModalSubmit,
  safeInteractionResponse,
  createFinalTicket
}; 