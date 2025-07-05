// PayPal Verifier Handler
const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder
} = require('discord.js');
const { EMBED_COLOR, PAYMENT_STAFF, EMOJIS } = require('../constants');
const config = require('../../config');

// Constant for the new PayPal verifier channel ID
const PAYPAL_VERIFICATION_CHANNEL_ID = '1346034712627646524';

/**
 * Handler for PayPal payment verification
 */
class PayPalVerifierHandler {
  constructor(client) {
    this.client = client;
    this.pendingVerifications = new Map();
    this.verifierId = config.PAYMENT_STAFF?.PAYPAL_VERIFIER || '986164993080836096';
    console.log('[PAYPAL_VERIFIER] Handler initialized');
  }

  /**
   * Submit a payment for verification
   * @param {string} channelId - The channel ID where the payment was made
   * @param {string} userId - The user ID who made the payment
   * @param {Object} paymentDetails - Details about the payment
   */
  async submitPaymentForVerification(channelId, userId, paymentDetails) {
    try {
      console.log(`[PAYPAL_VERIFIER] Submitting payment for verification: Channel ${channelId}, User ${userId}`);
      
      // Store verification details
      this.pendingVerifications.set(channelId, {
        userId,
        channelId,
        timestamp: Date.now(),
        paymentDetails,
        status: 'pending'
      });
      
      // Notify verifier if they're online
      const verifier = await this.client.users.fetch(this.verifierId).catch(() => null);
      if (verifier) {
        try {
          // Try to DM the verifier
          const embed = new EmbedBuilder()
            .setTitle('Payment Verification Needed')
            .setDescription(`A PayPal payment needs verification in <#${channelId}> from <@${userId}>.
            
Amount: ${paymentDetails.amount || 'Not specified'}
Order: ${paymentDetails.orderDetails?.type || 'Not specified'}

Please check the channel to verify the payment.`)
            .setColor(0xe68df2)
            .setTimestamp();
          
          await verifier.send({ embeds: [embed] }).catch(() => {
            console.log(`[PAYPAL_VERIFIER] Could not DM verifier ${this.verifierId}`);
          });
        } catch (dmError) {
          console.error(`[PAYPAL_VERIFIER] Error sending DM to verifier: ${dmError.message}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`[PAYPAL_VERIFIER] Error submitting payment for verification: ${error.message}`);
      console.error(error.stack);
      return false;
    }
  }
  
  /**
   * Mark a payment as verified
   * @param {string} channelId - The channel ID where the payment was made
   * @param {string} verifierId - The ID of the staff who verified the payment
   */
  async markPaymentAsVerified(channelId, verifierId) {
    try {
      const verification = this.pendingVerifications.get(channelId);
      if (!verification) {
        return false;
      }
      
      verification.status = 'verified';
      verification.verifiedBy = verifierId;
      verification.verifiedAt = Date.now();
      
      this.pendingVerifications.set(channelId, verification);
      
      // Clean up after 24 hours
      setTimeout(() => {
        this.pendingVerifications.delete(channelId);
      }, 24 * 60 * 60 * 1000);
      
      return true;
    } catch (error) {
      console.error(`[PAYPAL_VERIFIER] Error marking payment as verified: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Mark a payment as rejected
   * @param {string} channelId - The channel ID where the payment was made
   * @param {string} verifierId - The ID of the staff who rejected the payment
   * @param {string} reason - The reason for rejection
   */
  async markPaymentAsRejected(channelId, verifierId, reason) {
    try {
      const verification = this.pendingVerifications.get(channelId);
      if (!verification) {
        return false;
      }
      
      verification.status = 'rejected';
      verification.rejectedBy = verifierId;
      verification.rejectedAt = Date.now();
      verification.rejectionReason = reason || 'No reason provided';
      
      this.pendingVerifications.set(channelId, verification);
      
      // Clean up after 24 hours
      setTimeout(() => {
        this.pendingVerifications.delete(channelId);
      }, 24 * 60 * 60 * 1000);
      
      return true;
    } catch (error) {
      console.error(`[PAYPAL_VERIFIER] Error marking payment as rejected: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Get the verification status for a channel
   * @param {string} channelId - The channel ID to check
   */
  getVerificationStatus(channelId) {
    return this.pendingVerifications.get(channelId) || null;
  }
}

module.exports = PayPalVerifierHandler; 