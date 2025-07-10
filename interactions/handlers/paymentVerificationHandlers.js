const { 
  staffOperationsHandlers 
} = require('../../src/handlers/staffOperationsHandlers.js');

// Import PayPal verification handlers
const {
  handlePayPalPaymentReceived,
  handlePayPalPaymentNotReceived
} = require('../../src/handlers/paypalButtonHandler.js');

const paymentVerificationHandlers = {
  // Staff payment verification buttons
  'payment_received': handlePayPalPaymentReceived,
  'payment_not_received': handlePayPalPaymentNotReceived,
  
  // Payment confirmation buttons (post-countdown)
  'confirm_payment': staffOperationsHandlers['confirm_payment'],
  'cancel_payment_confirm': staffOperationsHandlers['cancel_payment_confirm'],
  
  // Staff operations for different payment methods
  'confirm_payment_paypal': staffOperationsHandlers['confirm_payment_paypal'],
  'confirm_payment_iban': staffOperationsHandlers['confirm_payment_iban'],
  'confirm_payment_tikkie': staffOperationsHandlers['confirm_payment_tikkie'],
  'confirm_payment_crypto_btc': staffOperationsHandlers['confirm_payment_crypto_btc'],
  
  'cancel_payment_paypal': staffOperationsHandlers['cancel_payment_paypal'],
  'cancel_payment_iban': staffOperationsHandlers['cancel_payment_iban'],
  'cancel_payment_tikkie': staffOperationsHandlers['cancel_payment_tikkie'],
  'cancel_payment_crypto_btc': staffOperationsHandlers['cancel_payment_crypto_btc'],
  
  // Staff confirmation/rejection handlers
  'staff_confirm_payment': staffOperationsHandlers['staff_confirm_payment'],
  'payment_confirmed': staffOperationsHandlers['payment_confirmed'],
  'payment_cancelled': staffOperationsHandlers['payment_cancelled'],
  'payment_confirmed_done': staffOperationsHandlers['payment_confirmed_done'],
  'payment_cancelled_done': staffOperationsHandlers['payment_cancelled_done'],
  
  // PayPal verification handlers  
  'paypal_verify_approve_': async (interaction) => {
    const paypalVerifier = interaction.client.handlers.get('paypalVerifier');
    if (paypalVerifier) {
      return paypalVerifier.handleVerificationResponse(interaction);
    }
  },
  
  'paypal_verify_reject_': async (interaction) => {
    const paypalVerifier = interaction.client.handlers.get('paypalVerifier');
    if (paypalVerifier) {
      return paypalVerifier.handleVerificationResponse(interaction);
    }
  }
};

module.exports = paymentVerificationHandlers; 