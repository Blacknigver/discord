# Discord Bot Error Fixes

## Issue 1: "modalHandlers is not defined" in handlers.js

### Fix:
1. Update `src/modules/modalHandlers.js` to export modalHandlers with the necessary handlers:

```javascript
module.exports = {
  handleBulkTrophiesModal,
  handleMasteryBrawlerModal,
  handleOtherRequestModal,
  handleCryptoTxForm,
  modalHandlers: {
    'crypto_tx_form_ltc': handleCryptoTxForm,
    'crypto_tx_form_sol': handleCryptoTxForm,
    'crypto_tx_form_btc': handleCryptoTxForm
  }
}; 
```

## Issue 2: "Cannot find module './constants'" in interactions.js and commands.js

### Fix:
1. Update `interactions.js` to import constants from the correct path:

```javascript
const { EMBED_COLOR } = require('./src/constants');
```

2. Update `commands.js` to import constants from the correct path:

```javascript
const { 
  EMBED_COLOR, 
  STAFF_ROLES, 
  TICKET_CATEGORIES
} = require('./src/constants');
```

## Issue 3: "Cannot read properties of undefined (reading 'includes')" in message command handlers

### Fix:
1. Add missing constants to `config.js`:

```javascript
// Added required constants for handlers.js
TICKET_PANEL_ALLOWED_USERS: [
  '986164993080836096', // Admin role ID
  '658351335967686659'  // Owner role ID
],
LIST_COMMAND_ROLE: '1234567890123456780', // Replace with actual role ID for listing commands
STAFF_ROLES: [
  '986164993080836096', // Admin role ID
  '658351335967686659', // Owner role ID
  '1234567890123456784' // Support role ID
],
MOVE_CATEGORIES: {
  paid: '1234567890123456778',
  add: '1234567890123456777',
  sell: '1234567890123456776',
  finished: '1234567890123456775'
},
TICKET_CATEGORIES: {
  order: '1234567890123456789', // Order tickets category ID
  help: '1234567890123456788',  // Help tickets category ID
  purchase: '1234567890123456787' // Purchase tickets category ID
},
PURCHASE_ACCOUNT_CATEGORY: '1234567890123456787', // Same as TICKET_CATEGORIES.purchase
ADD_115K_ROLE: '1351281086134747298', // Role ID for 115k trophy add
MATCHERINO_WINNER_ROLE: '1351281117445099631', // Role ID for matcherino winner add
AUTO_CLOSE_LOG_CHANNEL: '1354587880382795836', // Channel ID for auto-close logs
MAX_TICKETS_PER_USER: 5 // Maximum number of tickets per user
```

2. Update the message command handling in `index.js` to better handle undefined cases:

```javascript
// Handle message commands
client.on(Events.MessageCreate, async message => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Check for command prefix
  if (!message.content.startsWith('?')) return;
  
  // Extract command and arguments
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  
  try {
    // Import message commands from handlers
    const { messageCommands } = require('./handlers');
    
    // Execute command if it exists
    if (messageCommands && messageCommands[commandName]) {
      await messageCommands[commandName](message, args);
    } else if (commandName) {
      console.log(`Command not found: ${commandName}`);
    }
  } catch (error) {
    console.error(`Error handling message command: ${error}`);
    await message.reply('There was an error executing that command!').catch(console.error);
  }
});
```

3. Improve the check for TICKET_PANEL_ALLOWED_USERS in `handlers.js`:

```javascript
ticketpanel: async (message) => {
  if (!TICKET_PANEL_ALLOWED_USERS || !Array.isArray(TICKET_PANEL_ALLOWED_USERS) || !TICKET_PANEL_ALLOWED_USERS.includes(message.author.id)) {
    return message.reply("You don't have permission!");
  }
  // Rest of the command...
}
```

## Issue 4: "No handler found for modal: modal_trophies_start"

### Fix:
1. Add a handler function for the modal_trophies_start modal in `src/modules/modalHandlers.js`:

```javascript
// Handle trophies start modal submission
async function handleTrophiesStartModal(interaction) {
  try {
    const brawlerName = interaction.fields.getTextInputValue('brawler_name').trim();
    const currentTrophies = parseInt(interaction.fields.getTextInputValue('brawler_current').trim());
    const desiredTrophies = parseInt(interaction.fields.getTextInputValue('brawler_desired').trim());
    
    // Validate inputs
    if (isNaN(currentTrophies) || isNaN(desiredTrophies)) {
      return interaction.reply({
        content: 'Please enter valid numbers for trophy counts.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    if (currentTrophies >= desiredTrophies) {
      return interaction.reply({
        content: 'The desired trophy count must be higher than the current trophy count.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
    
    // Calculate price
    const price = calculateTrophyPrice(currentTrophies, desiredTrophies);
    
    // Store the data in flowState
    flowState.set(interaction.user.id, {
      type: 'trophies',
      brawler: brawlerName,
      currentTrophies,
      desiredTrophies,
      price,
      step: 'payment_method',
      timestamp: Date.now()
    });
    
    // Show payment method selection
    return showPaymentMethodSelection(interaction);
  } catch (error) {
    console.error('Error handling trophies start modal:', error);
    return interaction.reply({
      content: 'There was an error processing your request. Please try again later.',
      flags: InteractionResponseFlags.Ephemeral
    });
  }
}
```

2. Update the modalHandlers export to include the handler:

```javascript
module.exports = {
  handleBulkTrophiesModal,
  handleMasteryBrawlerModal,
  handleOtherRequestModal,
  handleCryptoTxForm,
  handleTrophiesStartModal,
  modalHandlers: {
    'crypto_tx_form_ltc': handleCryptoTxForm,
    'crypto_tx_form_sol': handleCryptoTxForm,
    'crypto_tx_form_btc': handleCryptoTxForm,
    'modal_trophies_start': handleTrophiesStartModal,
    'modal_bulk_trophies': handleBulkTrophiesModal,
    'modal_mastery_brawler': handleMasteryBrawlerModal,
    'modal_other_request': handleOtherRequestModal
  }
};
```

## Issue 5: Deprecated "ephemeral" warning

### Fix:
1. Import InteractionResponseFlags in appropriate files:

```javascript
const { 
  /* other imports */
  InteractionResponseFlags 
} = require('discord.js');
```

2. Replace all occurrences of `ephemeral: true` with `flags: InteractionResponseFlags.Ephemeral`:

```javascript
// Before
return interaction.reply({
  content: 'Message content',
  ephemeral: true
});

// After
return interaction.reply({
  content: 'Message content',
  flags: InteractionResponseFlags.Ephemeral
});
```

## Issue 6: Editing main ticket panel instead of sending ephemeral messages, and payment method errors

### Fix:

1. Update `payment_method_select` handler in `handlers.js` to properly handle different payment types:

```javascript
'payment_method_select': async (interaction) => {
  try {
    // Don't defer immediately, we'll handle the response type based on the selection
    
    const selectedValue = interaction.values[0];
    const userData = flowState.get(interaction.user.id);
  
    if (!userData) {
      return interaction.reply({
        content: 'Session data not found. Please try again.',
        flags: InteractionResponseFlags.Ephemeral
      });
    }
  
    userData.step = 'price_display';
    
    // Set payment method based on selection
    switch (selectedValue) {
      case 'payment_paypal':
        userData.paymentMethod = 'PayPal';
        flowState.set(interaction.user.id, userData);
        if (selectedValue !== 'payment_crypto' && selectedValue !== 'payment_dutch') {
          await interaction.deferUpdate();
        }
        return showPriceEmbed(interaction);
        
      case 'payment_crypto':
        userData.paymentMethod = 'Crypto';
        flowState.set(interaction.user.id, userData);
        // For crypto, we'll defer the reply so we can use editReply in showCryptoSelection
        await interaction.deferReply({ ephemeral: true });
        return showCryptoSelection(interaction);
        
      // ... other cases
    }
  } catch (error) {
    // Error handling
  }
}
```

2. Update functions like `showCryptoSelection`, `showDutchPaymentMethodSelection`, and `showPriceEmbed` in `src/modules/ticketFlow.js` to handle both interaction types:

```javascript
// Show crypto selection
async function showCryptoSelection(interaction) {
  try {
    // ... existing code ...
    
    // Check if the interaction has already been replied to
    if (interaction.replied || interaction.deferred) {
      return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
      return interaction.update({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    // Error handling
  }
}
```

3. Fix the ticket button handlers to properly defer replies as ephemeral:

```javascript
'ticket_ranked': async (interaction) => {
  try {
    // Defer the reply with ephemeral flag
    await interaction.deferReply({ ephemeral: true });
    
    // Initialize user flow state
    flowState.set(interaction.user.id, { 
      type: 'ranked', 
      step: 'current_rank',
      timestamp: Date.now()
    });
    
    // Call the ranked flow handler
    return handleRankedFlow(interaction);
  } catch (error) {
    // Error handling
  }
}
```

These changes will fix all the referenced errors and ensure the application runs properly with ephemeral messages. 