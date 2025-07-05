# Brawl Stars Boosting Discord Bot

A feature-rich Discord bot designed for managing ticket systems, orders, and payment processing for Brawl Stars boosting services.

## Features

### Ticket System
- **Order Tickets**: Creates tickets for boost orders with proper categorization and permissions
- **Overflow Support**: Handles overflow when categories are full by creating channels without categories
- **Auto-close Logic**: Automatically closes inactive tickets with appropriate reminders
- **Multiple Ticket Types**: Supports different ticket types including:
  - Ranked Boosting
  - Bulk Trophies Boosting
  - Mastery Boosting
  - Custom Orders

### Payment Processing
- **Multiple Payment Methods**:
  - PayPal (with ToS acceptance)
  - IBAN Bank Transfer
  - Cryptocurrency (Bitcoin, Litecoin, Solana)
  - PayPal Giftcards
  - German Apple Giftcards
  - Dutch Payment Methods (Tikkie, Bol.com Giftcards)
- **Crypto Payment Verification**: Validates cryptocurrency transactions securely
- **Price Calculation**: Automatically calculates prices based on boost type and parameters

### Order Flow
1. User selects boost type (Ranked, Bulk Trophies, Mastery)
2. System guides user through parameters selection (current rank/trophies, desired rank/trophies)
3. User selects payment method with specific options for each type
4. System calculates and displays price
5. Upon confirmation, a ticket is created with all relevant order details
6. Payment processing is handled through the ticket with appropriate instructions

## Installation and Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with the following variables:
   ```
   BOT_TOKEN=your_discord_bot_token
   ```
4. Run the bot: `node index.js`

## Commands

- `/ticket`: Opens a ticket selection menu
- `/ticket-panel`: Creates a ticket panel (admin only)

## Technology

- Discord.js v14
- Node.js
- Environment-based configuration

## Payment Flow

### Crypto Payment Flow
1. User selects "Crypto" as payment method
2. User selects specific cryptocurrency (Bitcoin, Litecoin, Solana, Other)
3. System calculates crypto amount based on current exchange rates
4. User sends payment to provided wallet address
5. User submits transaction ID/hash for verification
6. System validates transaction and confirms payment
7. Order is marked as paid and ready for processing

### PayPal Flow
1. User selects "PayPal" as payment method
2. System displays Terms of Service that must be accepted
3. Upon acceptance, PayPal email is provided
4. User makes payment and confirms in ticket
5. Staff verifies payment and processes order

## File Structure
- `index.js`: Main bot entry point
- `src/modules/ticketFlow.js`: Core ticket flow logic
- `ticketPayments.js`: Payment handling functionality
- `tickets.js`: Ticket creation and management
- `src/handlers/`: Various handler modules for different interactions
- `src/constants.js`: Configuration constants
- `src/utils/`: Utility functions

## Contributing
Contributions are welcome. Please ensure code follows existing patterns and includes appropriate error handling.

## License
This project is proprietary software. All rights reserved. 