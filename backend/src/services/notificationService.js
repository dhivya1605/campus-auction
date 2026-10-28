import { Notification, NOTIFICATION_EVENTS } from '../models/Notification.js';

/**
 * Creates a single notification safely.
 * - Never throws: a failed notification must never roll back a valid auction operation.
 * - Uses an idempotencyKey to prevent duplicate notifications on retried requests.
 *
 * @param {object} opts
 * @param {mongoose.Types.ObjectId|string} opts.recipient  - User ID
 * @param {string}  opts.eventType                         - NOTIFICATION_EVENTS value
 * @param {string}  opts.title
 * @param {string}  opts.message
 * @param {mongoose.Types.ObjectId|string|null} [opts.listing]
 * @param {string}  [opts.idempotencyKey]                  - Unique key; auto-generated if omitted
 */
export const createNotification = async ({
  recipient,
  eventType,
  title,
  message,
  listing = null,
  idempotencyKey
}) => {
  try {
    const key = idempotencyKey || `${eventType}:${recipient}:${listing || 'none'}:${Date.now()}`;

    await Notification.create({
      recipient,
      eventType,
      title,
      message,
      listing,
      idempotencyKey: key,
      isRead: false
    });
  } catch (err) {
    // Duplicate key = notification already delivered — ignore silently
    if (err.code === 11000) {
      return;
    }
    // Log but do NOT re-throw — notifications must never break auction operations
    console.error('[NotificationService] Failed to create notification:', err.message);
  }
};

/**
 * Notify a bidder that their bid was accepted.
 */
export const notifyBidPlaced = async ({ recipientId, listingId, listingTitle, amount }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.BID_PLACED,
    title: 'Bid Placed Successfully',
    message: `Your bid of ₹${amount} on "${listingTitle}" was accepted. You are the current leader!`,
    listing: listingId,
    idempotencyKey: `BID_PLACED:${recipientId}:${listingId}:${amount}`
  });
};

/**
 * Notify the seller that a new valid bid has been placed on their listing.
 */
export const notifySellerNewBid = async ({ sellerId, listingId, listingTitle, amount }) => {
  await createNotification({
    recipient: sellerId,
    eventType: NOTIFICATION_EVENTS.NEW_BID_ON_LISTING,
    title: 'New Bid Received',
    message: `A new bid of ₹${amount} was placed on your listing "${listingTitle}".`,
    listing: listingId,
    idempotencyKey: `NEW_BID_ON_LISTING:${sellerId}:${listingId}:${amount}`
  });
};

/**
 * Notify the previous leading bidder that they have been outbid.
 */
export const notifyOutbid = async ({
  recipientId,
  listingId,
  listingTitle,
  newAmount,
  previousBidId
}) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.OUTBID,
    title: 'You Have Been Outbid',
    message: `Someone placed a higher bid of ₹${newAmount} on "${listingTitle}". Bid again to stay in the lead.`,
    listing: listingId,
    idempotencyKey: `OUTBID:${recipientId}:${listingId}:${previousBidId}`
  });
};

/**
 * Notify the provisional winner that the auction closed with them in the lead.
 */
export const notifyAuctionClosedWinner = async ({ recipientId, listingId, listingTitle, amount }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.AUCTION_CLOSED_WINNER,
    title: '🏆 Auction Closed — You Are the Winner!',
    message: `The auction for "${listingTitle}" has ended. Your bid of ₹${amount} is the highest. Await the seller's decision.`,
    listing: listingId,
    idempotencyKey: `AUCTION_CLOSED_WINNER:${recipientId}:${listingId}`
  });
};

/**
 * Notify the seller that the auction closed with no bids.
 */
export const notifyAuctionClosedNoWinner = async ({ recipientId, listingId, listingTitle }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.AUCTION_CLOSED_NO_WINNER,
    title: 'Auction Ended — No Bids',
    message: `Your auction for "${listingTitle}" ended with no bids placed. You may relist the item.`,
    listing: listingId,
    idempotencyKey: `AUCTION_CLOSED_NO_WINNER:${recipientId}:${listingId}`
  });
};

/**
 * Notify the buyer that the seller approved their winning bid.
 */
export const notifyBidApproved = async ({ recipientId, listingId, listingTitle, amount }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.BID_APPROVED,
    title: '✅ Seller Approved Your Bid',
    message: `Great news! The seller approved your winning bid of ₹${amount} for "${listingTitle}". Arrange a campus handover.`,
    listing: listingId,
    idempotencyKey: `BID_APPROVED:${recipientId}:${listingId}`
  });
};

/**
 * Notify the buyer that the seller rejected their winning bid.
 */
export const notifyBidRejected = async ({ recipientId, listingId, listingTitle }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.BID_REJECTED,
    title: 'Seller Rejected Your Bid',
    message: `Unfortunately the seller has declined to proceed with your bid on "${listingTitle}". The item will not be sold.`,
    listing: listingId,
    idempotencyKey: `BID_REJECTED:${recipientId}:${listingId}`
  });
};

/**
 * Notify the buyer that the seller has confirmed handover details.
 */
export const notifyHandoverConfirmedBySeller = async ({
  recipientId,
  listingId,
  listingTitle,
  location
}) => {
  const locationText = location ? ` Meeting location: ${location}.` : '';
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.HANDOVER_CONFIRMED_BY_SELLER,
    title: '📍 Seller Confirmed Handover',
    message: `The seller has confirmed the campus handover for "${listingTitle}".${locationText} Please accept to complete the purchase.`,
    listing: listingId,
    idempotencyKey: `HANDOVER_CONFIRMED_BY_SELLER:${recipientId}:${listingId}`
  });
};

/**
 * Notify the seller that the buyer has accepted the purchase.
 */
export const notifyHandoverConfirmedByBuyer = async ({ recipientId, listingId, listingTitle }) => {
  await createNotification({
    recipient: recipientId,
    eventType: NOTIFICATION_EVENTS.HANDOVER_CONFIRMED_BY_BUYER,
    title: '🛍️ Buyer Accepted the Purchase',
    message: `The buyer has confirmed acceptance of "${listingTitle}". Once both parties confirm, the sale will be complete.`,
    listing: listingId,
    idempotencyKey: `HANDOVER_CONFIRMED_BY_BUYER:${recipientId}:${listingId}`
  });
};

/**
 * Notify both parties that the sale is fully complete.
 */
export const notifyHandoverCompleted = async ({ sellerId, buyerId, listingId, listingTitle }) => {
  const base = {
    eventType: NOTIFICATION_EVENTS.HANDOVER_COMPLETED,
    listing: listingId
  };
  await createNotification({
    ...base,
    recipient: sellerId,
    title: '🎉 Sale Complete!',
    message: `Campus handover of "${listingTitle}" is confirmed by both parties. Sale successfully completed.`,
    idempotencyKey: `HANDOVER_COMPLETED:${sellerId}:${listingId}`
  });
  await createNotification({
    ...base,
    recipient: buyerId,
    title: '🎉 Purchase Complete!',
    message: `Your purchase of "${listingTitle}" is confirmed. Enjoy your item!`,
    idempotencyKey: `HANDOVER_COMPLETED:${buyerId}:${listingId}`
  });
};

/**
 * Notify both parties of a failed pickup.
 */
export const notifyFailedPickup = async ({ sellerId, buyerId, listingId, listingTitle, reason }) => {
  const reasonText = reason ? ` Reason: ${reason}.` : '';
  await createNotification({
    recipient: sellerId,
    eventType: NOTIFICATION_EVENTS.FAILED_PICKUP,
    title: '❌ Failed Pickup Recorded',
    message: `Pickup for "${listingTitle}" has been marked as failed.${reasonText}`,
    listing: listingId,
    idempotencyKey: `FAILED_PICKUP:${sellerId}:${listingId}`
  });
  if (buyerId) {
    await createNotification({
      recipient: buyerId,
      eventType: NOTIFICATION_EVENTS.FAILED_PICKUP,
      title: '❌ Handover Failed',
      message: `The handover for "${listingTitle}" has been recorded as a failed pickup.${reasonText}`,
      listing: listingId,
      idempotencyKey: `FAILED_PICKUP:${buyerId}:${listingId}`
    });
  }
};

/**
 * Notify the buyer that the seller cancelled the sale.
 */
export const notifySaleCancelled = async ({ buyerId, listingId, listingTitle, reason }) => {
  if (!buyerId) return;
  const reasonText = reason ? ` Reason: ${reason}.` : '';
  await createNotification({
    recipient: buyerId,
    eventType: NOTIFICATION_EVENTS.SALE_CANCELLED,
    title: 'Sale Cancelled by Seller',
    message: `The seller has cancelled the sale of "${listingTitle}".${reasonText}`,
    listing: listingId,
    idempotencyKey: `SALE_CANCELLED:${buyerId}:${listingId}`
  });
};

/**
 * Notify all involved bidders that an active listing was cancelled.
 * Pass an array of bidder IDs (de-duplicated by caller).
 */
export const notifyListingCancelled = async ({ bidderIds, listingId, listingTitle }) => {
  for (const bidderId of bidderIds) {
    await createNotification({
      recipient: bidderId,
      eventType: NOTIFICATION_EVENTS.LISTING_CANCELLED,
      title: 'Auction Listing Cancelled',
      message: `The seller cancelled the auction for "${listingTitle}" which you had bid on.`,
      listing: listingId,
      idempotencyKey: `LISTING_CANCELLED:${bidderId}:${listingId}`
    });
  }
};

