const { 
  cryptoPaymentHandlers,
  cryptoModalHandlers
} = require('../../src/handlers/cryptoPaymentHandlers.js');

const cryptoHandlers = {
  // Crypto payment selection and completion
  'crypto_select': cryptoPaymentHandlers['crypto_select'],
  
  // Crypto payment completed buttons
  'payment_completed_crypto_btc': cryptoPaymentHandlers['payment_completed_crypto_btc'],
  'payment_completed_crypto_ltc': cryptoPaymentHandlers['payment_completed_crypto_ltc'],
  'payment_completed_crypto_sol': cryptoPaymentHandlers['payment_completed_crypto_sol'],
  'payment_completed_crypto_usdt': cryptoPaymentHandlers['payment_completed_crypto_usdt'],
  
  // Crypto copy buttons (addresses and amounts)
  'copy_btc_address': cryptoPaymentHandlers['copy_btc_address'],
  'copy_ltc_address': cryptoPaymentHandlers['copy_ltc_address'],
  'copy_sol_address': cryptoPaymentHandlers['copy_sol_address'],
  'copy_usdt_address': cryptoPaymentHandlers['copy_usdt_address'],
  
  'copy_btc_amount': cryptoPaymentHandlers['copy_btc_amount'],
  'copy_ltc_amount': cryptoPaymentHandlers['copy_ltc_amount'],
  'copy_sol_amount': cryptoPaymentHandlers['copy_sol_amount'],
  'copy_usdt_amount': cryptoPaymentHandlers['copy_usdt_amount'],
  
  // Crypto resend buttons
  'resend_crypto_btc': cryptoPaymentHandlers['resend_crypto_btc'],
  'resend_crypto_ltc': cryptoPaymentHandlers['resend_crypto_ltc'],
  'resend_crypto_sol': cryptoPaymentHandlers['resend_crypto_sol'],
  'resend_crypto_usdt': cryptoPaymentHandlers['resend_crypto_usdt'],
  
  // Crypto link expired handlers
  'crypto_link_expired': cryptoPaymentHandlers['crypto_link_expired'],
  
  // Crypto specific buttons from the crypto handlers
  'crypto_ltc': cryptoPaymentHandlers['crypto_ltc'],
  'crypto_sol': cryptoPaymentHandlers['crypto_sol'],
  'crypto_btc': cryptoPaymentHandlers['crypto_btc'],
  'crypto_other': cryptoPaymentHandlers['crypto_other']
};

// Also export modal handlers for crypto transaction forms
const cryptoModalHandlers_export = {
  'crypto_tx_form_ltc': cryptoModalHandlers['crypto_tx_form_ltc'],
  'crypto_tx_form_sol': cryptoModalHandlers['crypto_tx_form_sol'],
  'crypto_tx_form_btc': cryptoModalHandlers['crypto_tx_form_btc']
};

module.exports = {
  cryptoHandlers,
  cryptoModalHandlers: cryptoModalHandlers_export
}; 