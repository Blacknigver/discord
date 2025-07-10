// Re-export the canonical ticket implementation so every part of the codebase
// uses ONE shared TicketDataMap and helper set.  This eliminates subtle bugs
// that arose from multiple copies of ticket logic being loaded in memory.
//
// If older modules import specific helpers that only existed in the previous
// utils/ticketManager.js implementation (e.g. createTicket, checkTicketTimeouts),
// we forward them to equivalent functions from tickets.js or implement thin
// wrappers so nothing breaks.

const core = require('../../tickets.js');

// ----- Compatibility helpers -----

/**
 * Legacy wrapper used by paymentMethodHandlers.js to create a ticket using only
 * the interaction object, a `category` key (or ID), and optional Q&A pairs.
 */
async function createTicket(interaction, categoryKeyOrId, answers = []) {
  const { guild, user } = interaction;
  try {
    // Resolve category ID: if a raw ID was passed, use it; otherwise look up in constants
    const { TICKET_CATEGORIES } = require('../constants');
    const categoryId = TICKET_CATEGORIES[categoryKeyOrId] || categoryKeyOrId || null;

    // Build a simple channel name: <category>-<username>-XXXX
    const random = Math.floor(Math.random() * 1000);
    const baseName = `${categoryKeyOrId}-${user.username}-${random}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

    // Combine answers into an order-details object (name/value pairs → embed fields)
    const orderDetails = {};
    for (const [name, value] of answers) {
      orderDetails[name] = value;
    }

    // Create the channel via the canonical helper
    const channel = await core.createTicketChannelWithOverflow(guild, user.id, categoryId, baseName, orderDetails);

    // core helper returns the TextChannel. Match the expectation of older code
    return channel;
  } catch (err) {
    console.error('[TICKET_PROXY] Failed to create ticket via proxy:', err);
    return null;
  }
}

// Older code expected a `checkTicketTimeouts` loop – alias to core.checkAutoClose if present
const checkTicketTimeouts = core.checkAutoClose || core.checkTicketTimeouts;

module.exports = {
  ...core,
  createTicket,
  checkTicketTimeouts,
}; 