import mongoose from 'mongoose';

/**
 * Notification event types — one constant per auction workflow step.
 */
export const NOTIFICATION_EVENTS = {
  BID_PLACED: 'BID_PLACED',             // You placed a bid (confirm to bidder)
  NEW_BID_ON_LISTING: 'NEW_BID_ON_LISTING', // Seller notified of new bid
  OUTBID: 'OUTBID',                     // Someone outbid you
  AUCTION_CLOSED_WINNER: 'AUCTION_CLOSED_WINNER', // You won the auction
  AUCTION_CLOSED_NO_WINNER: 'AUCTION_CLOSED_NO_WINNER', // Auction ended, no bids
  BID_APPROVED: 'BID_APPROVED',         // Seller approved your winning bid
  BID_REJECTED: 'BID_REJECTED',         // Seller rejected your winning bid
  HANDOVER_CONFIRMED_BY_SELLER: 'HANDOVER_CONFIRMED_BY_SELLER', // Seller confirmed handover/location
  HANDOVER_CONFIRMED_BY_BUYER: 'HANDOVER_CONFIRMED_BY_BUYER',   // Buyer accepted purchase
  HANDOVER_COMPLETED: 'HANDOVER_COMPLETED', // Both confirmed — sale complete
  FAILED_PICKUP: 'FAILED_PICKUP',       // Handover failed
  SALE_CANCELLED: 'SALE_CANCELLED',     // Seller cancelled sale
  LISTING_CANCELLED: 'LISTING_CANCELLED' // Seller cancelled the active listing
};

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventType: {
      type: String,
      enum: Object.values(NOTIFICATION_EVENTS),
      required: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      maxlength: 400
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      default: null
    },
    // Idempotency key: prevents duplicate notifications for the same event+recipient
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast unread-count queries per user
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);

