const axios = require('axios');

// Our wallet addresses
const OUR_BTC_ADDRESS = 'bc1qcxrteqq6rgr4u5s6hg9n4d27zar22ssgzx7s8v';
const OUR_LTC_ADDRESS = 'LMEBUghAdAKKdNTtUBExHyN33b6JS75TkH';

/**
 * Verify Bitcoin transaction using BlockCypher API
 */
async function verifyBitcoinTransaction(txId, senderAddress, expectedPriceEUR) {
  try {
    console.log(`[BLOCKCYPHER_BTC] Verifying Bitcoin transaction ${txId} from ${senderAddress} for €${expectedPriceEUR}`);
    
    // Get current BTC price in EUR
    const { fetchCryptoPricesFromBinance, convertEurToCrypto } = require('./cryptoPrices');
    const cryptoPrices = await fetchCryptoPricesFromBinance();
    const expectedBTCAmount = convertEurToCrypto(expectedPriceEUR, 'BTC', cryptoPrices);
    
    console.log(`[BLOCKCYPHER_BTC] Expected BTC amount: ${expectedBTCAmount} BTC`);
    
    // Call BlockCypher API to get transaction details
    const apiUrl = `https://api.blockcypher.com/v1/btc/main/txs/${txId}`;
    
    const response = await axios.get(apiUrl, {
      timeout: 10000
    });
    
    const transactionData = response.data;
    
    if (!transactionData) {
      console.log(`[BLOCKCYPHER_BTC] Transaction ${txId} not found`);
      return { success: false, reason: 'TRANSACTION_NOT_FOUND' };
    }
    
    // Check if transaction was confirmed
    const confirmations = transactionData.confirmations || 0;
    console.log(`[BLOCKCYPHER_BTC] Transaction confirmations: ${confirmations}`);
    
    // SECURITY CHECK: Validate transaction age (must be within 30 minutes)
    const transactionTime = new Date(transactionData.received);
    const now = new Date();
    const ageInMinutes = (now - transactionTime) / (1000 * 60);
    
    if (ageInMinutes > 30) {
      console.log(`[BLOCKCYPHER_BTC] Transaction too old: ${ageInMinutes.toFixed(2)} minutes`);
      return { success: false, reason: 'TRANSACTION_TOO_OLD' };
    }
    console.log(`[BLOCKCYPHER_BTC] Transaction age: ${ageInMinutes.toFixed(2)} minutes - acceptable`);
    
    // Check if sender address is in the inputs
    let senderFound = false;
    for (const input of transactionData.inputs) {
      if (input.addresses && input.addresses.includes(senderAddress)) {
        senderFound = true;
        break;
      }
    }
    
    if (!senderFound) {
      console.log(`[BLOCKCYPHER_BTC] Sender address ${senderAddress} not found in transaction inputs`);
      return { success: false, reason: 'SENDER_MISMATCH' };
    }
    
    // Check if our address received the payment
    let ourAmountReceived = 0;
    for (const output of transactionData.outputs) {
      if (output.addresses && output.addresses.includes(OUR_BTC_ADDRESS)) {
        ourAmountReceived += output.value; // Value in satoshis
      }
    }
    
    if (ourAmountReceived === 0) {
      console.log(`[BLOCKCYPHER_BTC] Our address ${OUR_BTC_ADDRESS} not found in transaction outputs`);
      return { success: false, reason: 'INVALID_RECIPIENT' };
    }
    
    // Convert satoshis to BTC (1 BTC = 100,000,000 satoshis)
    const btcReceived = ourAmountReceived / 100000000;
    console.log(`[BLOCKCYPHER_BTC] BTC received: ${btcReceived} BTC, expected: ${expectedBTCAmount} BTC`);
    
    // Allow 2% tolerance for price fluctuations and fees
    const tolerance = 0.02;
    const minAcceptableAmount = expectedBTCAmount * (1 - tolerance);
    
    if (btcReceived < minAcceptableAmount) {
      console.log(`[BLOCKCYPHER_BTC] Insufficient amount: received ${btcReceived} BTC, expected at least ${minAcceptableAmount} BTC`);
      return { success: false, reason: 'INSUFFICIENT_AMOUNT' };
    }
    
    // Return confirmation status
    if (confirmations >= 1) {
      console.log(`[BLOCKCYPHER_BTC] Transaction verification successful and confirmed!`);
      return { success: true, confirmed: true };
    } else {
      console.log(`[BLOCKCYPHER_BTC] Transaction verification successful but unconfirmed`);
      return { success: true, confirmed: false };
    }
    
  } catch (error) {
    console.error('[BLOCKCYPHER_BTC] Error verifying Bitcoin transaction:', error);
    if (error.response?.status === 404) {
      return { success: false, reason: 'TRANSACTION_NOT_FOUND' };
    } else if (error.response?.status === 429) {
      return { success: false, reason: 'RATE_LIMITED' };
    }
    return { success: false, reason: 'VERIFICATION_ERROR' };
  }
}

/**
 * Verify Litecoin transaction using BlockCypher API
 */
async function verifyLitecoinTransaction(txId, senderAddress, expectedPriceEUR) {
  try {
    console.log(`[BLOCKCYPHER_LTC] Verifying Litecoin transaction ${txId} from ${senderAddress} for €${expectedPriceEUR}`);
    
    // Get current LTC price in EUR
    const { fetchCryptoPricesFromBinance, convertEurToCrypto } = require('./cryptoPrices');
    const cryptoPrices = await fetchCryptoPricesFromBinance();
    const expectedLTCAmount = convertEurToCrypto(expectedPriceEUR, 'LTC', cryptoPrices);
    
    console.log(`[BLOCKCYPHER_LTC] Expected LTC amount: ${expectedLTCAmount} LTC`);
    
    // Call BlockCypher API to get transaction details (Litecoin endpoint)
    const apiUrl = `https://api.blockcypher.com/v1/ltc/main/txs/${txId}`;
    
    const response = await axios.get(apiUrl, {
      timeout: 10000
    });
    
    const transactionData = response.data;
    
    if (!transactionData) {
      console.log(`[BLOCKCYPHER_LTC] Transaction ${txId} not found`);
      return { success: false, reason: 'TRANSACTION_NOT_FOUND' };
    }
    
    // Check if transaction was confirmed
    const confirmations = transactionData.confirmations || 0;
    console.log(`[BLOCKCYPHER_LTC] Transaction confirmations: ${confirmations}`);
    
    // SECURITY CHECK: Validate transaction age (must be within 30 minutes)
    const transactionTime = new Date(transactionData.received);
    const now = new Date();
    const ageInMinutes = (now - transactionTime) / (1000 * 60);
    
    if (ageInMinutes > 30) {
      console.log(`[BLOCKCYPHER_LTC] Transaction too old: ${ageInMinutes.toFixed(2)} minutes`);
      return { success: false, reason: 'TRANSACTION_TOO_OLD' };
    }
    console.log(`[BLOCKCYPHER_LTC] Transaction age: ${ageInMinutes.toFixed(2)} minutes - acceptable`);
    
    // Check if sender address is in the inputs
    let senderFound = false;
    for (const input of transactionData.inputs) {
      if (input.addresses && input.addresses.includes(senderAddress)) {
        senderFound = true;
        break;
      }
    }
    
    if (!senderFound) {
      console.log(`[BLOCKCYPHER_LTC] Sender address ${senderAddress} not found in transaction inputs`);
      return { success: false, reason: 'SENDER_MISMATCH' };
    }
    
    // Check if our address received the payment
    let ourAmountReceived = 0;
    for (const output of transactionData.outputs) {
      if (output.addresses && output.addresses.includes(OUR_LTC_ADDRESS)) {
        ourAmountReceived += output.value; // Value in litoshis (like satoshis but for Litecoin)
      }
    }
    
    if (ourAmountReceived === 0) {
      console.log(`[BLOCKCYPHER_LTC] Our address ${OUR_LTC_ADDRESS} not found in transaction outputs`);
      return { success: false, reason: 'INVALID_RECIPIENT' };
    }
    
    // Convert litoshis to LTC (1 LTC = 100,000,000 litoshis)
    const ltcReceived = ourAmountReceived / 100000000;
    console.log(`[BLOCKCYPHER_LTC] LTC received: ${ltcReceived} LTC, expected: ${expectedLTCAmount} LTC`);
    
    // Allow 2% tolerance for price fluctuations and fees
    const tolerance = 0.02;
    const minAcceptableAmount = expectedLTCAmount * (1 - tolerance);
    
    if (ltcReceived < minAcceptableAmount) {
      console.log(`[BLOCKCYPHER_LTC] Insufficient amount: received ${ltcReceived} LTC, expected at least ${minAcceptableAmount} LTC`);
      return { success: false, reason: 'INSUFFICIENT_AMOUNT' };
    }
    
    // Return confirmation status
    if (confirmations >= 1) {
      console.log(`[BLOCKCYPHER_LTC] Transaction verification successful and confirmed!`);
      return { success: true, confirmed: true };
    } else {
      console.log(`[BLOCKCYPHER_LTC] Transaction verification successful but unconfirmed`);
      return { success: true, confirmed: false };
    }
    
  } catch (error) {
    console.error('[BLOCKCYPHER_LTC] Error verifying Litecoin transaction:', error);
    if (error.response?.status === 404) {
      return { success: false, reason: 'TRANSACTION_NOT_FOUND' };
    } else if (error.response?.status === 429) {
      return { success: false, reason: 'RATE_LIMITED' };
    }
    return { success: false, reason: 'VERIFICATION_ERROR' };
  }
}

module.exports = {
  verifyBitcoinTransaction,
  verifyLitecoinTransaction
}; 