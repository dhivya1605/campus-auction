import { Listing } from '../models/Listing.js';
import { Bid } from '../models/Bid.js';
import { SaleOutcome } from '../models/SaleOutcome.js';
import { ApiError } from '../utils/ApiError.js';
import {
  notifyAuctionClosedWinner,
  notifyAuctionClosedNoWinner
} from './notificationService.js';

/**
 * Idempotently closes a single auction whose closing time has passed.
 */
export const closeAuction = async (listingId, triggeredBy = null) => {
  const listing = await Listing.findById(listingId);
  if (!listing) {
    throw ApiError.notFound('Listing not found');
  }

  const now = new Date();

  // If closingTime has not arrived yet, reject closing
  if (now < new Date(listing.closingTime)) {
    throw ApiError.badRequest('Auction cannot be closed before its closing time has passed');
  }

  // Already closed or finalized? Idempotent return
  const alreadyClosedStatuses = [
    'unsold',
    'awaiting_seller_decision',
    'reserved',
    'completed',
    'rejected',
    'cancelled',
    'failed_pickup'
  ];

  if (alreadyClosedStatuses.includes(listing.status)) {
    const existingOutcome = await SaleOutcome.findOne({ listing: listing._id });
    return {
      message: 'Auction was already closed',
      listing,
      outcome: existingOutcome,
      alreadyClosed: true
    };
  }

  // Find the highest valid bid
  const highestBid = await Bid.findOne({ listing: listing._id }).sort({
    amount: -1,
    createdAt: -1
  });

  let newListingStatus;
  let saleOutcomeData;

  if (!highestBid) {
    // No bids accepted: mark unsold
    newListingStatus = 'unsold';
    listing.status = newListingStatus;
    await listing.save();

    // Create or update single SaleOutcome
    saleOutcomeData = await SaleOutcome.findOneAndUpdate(
      { listing: listing._id },
      {
        $setOnInsert: {
          seller: listing.seller,
          provisionalWinner: null,
          winningBid: null,
          sellerDecision: 'pending'
        },
        $set: {
          outcome: 'unsold',
          failureOrCancellationReason: 'Auction ended with zero bids placed'
        },
        $push: {
          auditLog: {
            action: 'AUCTION_CLOSED_NO_BIDS',
            previousOutcome: 'none',
            newOutcome: 'unsold',
            performedBy: triggeredBy,
            note: 'Closed automatically with no bids'
          }
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
  } else {
    // Valid bids exist: mark awaiting_seller_decision
    newListingStatus = 'awaiting_seller_decision';
    listing.status = newListingStatus;
    listing.leadingBid = highestBid._id;
    listing.currentPrice = highestBid.amount;
    await listing.save();

    // Create or update single SaleOutcome
    saleOutcomeData = await SaleOutcome.findOneAndUpdate(
      { listing: listing._id },
      {
        $setOnInsert: {
          seller: listing.seller,
          provisionalWinner: highestBid.bidder,
          winningBid: highestBid._id,
          sellerDecision: 'pending',
          outcome: 'pending'
        },
        $push: {
          auditLog: {
            action: 'AUCTION_CLOSED_WITH_BIDS',
            previousOutcome: 'none',
            newOutcome: 'pending',
            performedBy: triggeredBy,
            note: `Closed with winning bid ₹${highestBid.amount}`
          }
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  // Fire notifications after successful close (never let these break the return)
  try {
    if (!highestBid) {
      await notifyAuctionClosedNoWinner({
        recipientId: listing.seller,
        listingId: listing._id,
        listingTitle: listing.title
      });
    } else {
      await notifyAuctionClosedWinner({
        recipientId: highestBid.bidder,
        listingId: listing._id,
        listingTitle: listing.title,
        amount: highestBid.amount
      });
    }
  } catch (notifErr) {
    console.error('[AuctionService] Notification error after close:', notifErr.message);
  }

  return {
    message: 'Auction closed successfully',
    listing,
    outcome: saleOutcomeData,
    alreadyClosed: false
  };
};

/**
 * Sweeps and closes all expired auctions.
 */
export const closeAllExpiredAuctions = async (triggeredBy = null) => {
  const now = new Date();

  // Find all active or scheduled listings whose closingTime has arrived
  const expiredListings = await Listing.find({
    closingTime: { $lte: now },
    status: { $in: ['active', 'scheduled'] }
  });

  const results = [];
  for (const item of expiredListings) {
    try {
      const res = await closeAuction(item._id, triggeredBy);
      results.push({ listingId: item._id, status: 'success', details: res });
    } catch (err) {
      results.push({ listingId: item._id, status: 'error', error: err.message });
    }
  }

  return {
    scannedCount: expiredListings.length,
    processedCount: results.filter((r) => r.status === 'success').length,
    results
  };
};

