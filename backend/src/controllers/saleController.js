import { SaleOutcome } from '../models/SaleOutcome.js';
import { Listing } from '../models/Listing.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';

/**
 * Retrieves the sale outcome record for a given listing.
 */
export const getSaleOutcome = async (req, res, next) => {
  try {
    const { listingId } = req.params;

    const outcome = await SaleOutcome.findOne({ listing: listingId })
      .populate('seller', 'name email')
      .populate('provisionalWinner', 'name email')
      .populate('winningBid');

    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found for this listing');
    }

    res.status(200).json({
      success: true,
      outcome
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns all sale outcomes where the authenticated user is the provisional winner (buyer).
 * Used by the buyer's "My Purchases" page.
 * Only returns outcomes with valid bids (provisionalWinner is set).
 */
export const getMyPurchases = async (req, res, next) => {
  try {
    const buyerId = req.user._id;

    const outcomes = await SaleOutcome.find({
      provisionalWinner: buyerId,
      // Exclude unsold/no-winner states
      outcome: { $nin: ['unsold', 'seller_cancelled'] }
    })
      .populate({
        path: 'listing',
        select: 'title photos category condition currentPrice startingPrice closingTime status'
      })
      .populate('seller', 'name')
      .populate('winningBid', 'amount createdAt')
      .sort({ updatedAt: -1 })
      .lean();

    // Filter out outcomes where listing populate failed (deleted listings)
    const validOutcomes = outcomes.filter((o) => o.listing != null);

    res.status(200).json({
      success: true,
      purchases: validOutcomes
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Seller approves winning price.
 * Transition: pending -> reserved
 */
export const approveWinningBid = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found');
    }

    // Ownership check: only seller can approve
    if (outcome.seller.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('Only the seller can approve the winning bid');
    }

    // Must be in pending state
    if (outcome.sellerDecision !== 'pending' || outcome.outcome !== 'pending') {
      throw ApiError.badRequest(
        `Cannot approve bid. Current seller decision is '${outcome.sellerDecision}' and outcome is '${outcome.outcome}'`
      );
    }

    const now = new Date();
    const previousOutcome = outcome.outcome;

    outcome.sellerDecision = 'approved';
    outcome.sellerDecisionTimestamp = now;
    outcome.outcome = 'reserved';
    outcome.reservationTimestamp = now;

    outcome.auditLog.push({
      action: 'SELLER_APPROVED_BID',
      previousOutcome,
      newOutcome: 'reserved',
      performedBy: req.user._id,
      note: req.body.note || 'Seller approved the winning bid; item reserved for winner'
    });

    await outcome.save();

    // Update listing status
    await Listing.findByIdAndUpdate(listingId, { status: 'reserved' });

    res.status(200).json({
      success: true,
      message: 'Winning bid approved. Item is now reserved for pickup/handover.',
      outcome
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Seller rejects winning price.
 * Transition: pending -> rejected
 */
export const rejectWinningBid = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found');
    }

    // Ownership check: only seller can reject
    if (outcome.seller.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('Only the seller can reject the winning bid');
    }

    // Must be in pending state
    if (outcome.sellerDecision !== 'pending' || outcome.outcome !== 'pending') {
      throw ApiError.badRequest(
        `Cannot reject bid. Current seller decision is '${outcome.sellerDecision}' and outcome is '${outcome.outcome}'`
      );
    }

    const now = new Date();
    const previousOutcome = outcome.outcome;

    outcome.sellerDecision = 'rejected';
    outcome.sellerDecisionTimestamp = now;
    outcome.outcome = 'rejected';
    outcome.failureOrCancellationReason = req.body.reason || 'Seller rejected the winning bid price';

    outcome.auditLog.push({
      action: 'SELLER_REJECTED_BID',
      previousOutcome,
      newOutcome: 'rejected',
      performedBy: req.user._id,
      note: req.body.reason || 'Seller declined to proceed at the winning bid'
    });

    await outcome.save();

    // Update listing status
    await Listing.findByIdAndUpdate(listingId, { status: 'rejected' });

    res.status(200).json({
      success: true,
      message: 'Winning bid rejected. Sale will not proceed.',
      outcome
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirms campus handover.
 * Requires confirmation from both parties (seller and buyer) to transition from reserved -> completed.
 */
export const confirmHandover = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const userId = req.user._id.toString();

    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found');
    }

    // Item must be reserved before handover confirmation
    if (outcome.outcome !== 'reserved') {
      throw ApiError.badRequest(
        `Cannot confirm handover for an item with status '${outcome.outcome}'. It must be in 'reserved' state.`
      );
    }

    const isSeller = outcome.seller.toString() === userId;
    const isBuyer = outcome.provisionalWinner && outcome.provisionalWinner.toString() === userId;

    if (!isSeller && !isBuyer) {
      throw ApiError.forbidden('Only the seller or buyer can confirm campus handover');
    }

    const now = new Date();

    if (isSeller) {
      outcome.handoverConfirmation.confirmedBySeller = true;
      outcome.handoverConfirmation.sellerConfirmedAt = now;
    }

    if (isBuyer) {
      outcome.handoverConfirmation.confirmedByBuyer = true;
      outcome.handoverConfirmation.buyerConfirmedAt = now;
    }

    if (req.body.location) {
      outcome.handoverConfirmation.handoverLocation = req.body.location;
    }
    if (req.body.notes) {
      outcome.handoverConfirmation.handoverNotes = req.body.notes;
    }

    const bothConfirmed =
      outcome.handoverConfirmation.confirmedBySeller &&
      outcome.handoverConfirmation.confirmedByBuyer;

    if (bothConfirmed) {
      const prev = outcome.outcome;
      outcome.outcome = 'completed';
      outcome.auditLog.push({
        action: 'HANDOVER_COMPLETED_BOTH_CONFIRMED',
        previousOutcome: prev,
        newOutcome: 'completed',
        performedBy: req.user._id,
        note: 'Both buyer and seller confirmed successful handover'
      });
      await Listing.findByIdAndUpdate(listingId, { status: 'completed' });
    } else {
      outcome.auditLog.push({
        action: isSeller ? 'SELLER_CONFIRMED_HANDOVER' : 'BUYER_CONFIRMED_HANDOVER',
        previousOutcome: outcome.outcome,
        newOutcome: outcome.outcome,
        performedBy: req.user._id,
        note: `Handover confirmed by ${isSeller ? 'seller' : 'buyer'}. Awaiting the other party.`
      });
    }

    await outcome.save();

    res.status(200).json({
      success: true,
      message: bothConfirmed
        ? 'Campus handover successfully completed and confirmed by both parties.'
        : `Handover confirmed by ${isSeller ? 'seller' : 'buyer'}. Awaiting counter-party confirmation.`,
      isComplete: bothConfirmed,
      outcome
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Records failed pickup (e.g. buyer or seller no-show).
 * Transition: reserved -> failed_pickup
 */
export const recordFailedPickup = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const userId = req.user._id.toString();

    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found');
    }

    // Must be in reserved state
    if (outcome.outcome !== 'reserved') {
      throw ApiError.badRequest(
        `Cannot report failed pickup for auction with status '${outcome.outcome}'. Must be 'reserved'.`
      );
    }

    const isSeller = outcome.seller.toString() === userId;
    const isBuyer = outcome.provisionalWinner && outcome.provisionalWinner.toString() === userId;
    const isAdmin = req.user.role === 'admin';

    if (!isSeller && !isBuyer && !isAdmin) {
      throw ApiError.forbidden('Only involved parties or administrators can report a failed pickup');
    }

    const prev = outcome.outcome;
    outcome.outcome = 'failed_pickup';
    outcome.failureOrCancellationReason = req.body.reason || 'Handover pickup failed / party no-show';

    outcome.auditLog.push({
      action: 'FAILED_PICKUP',
      previousOutcome: prev,
      newOutcome: 'failed_pickup',
      performedBy: req.user._id,
      note: outcome.failureOrCancellationReason
    });

    await outcome.save();
    await Listing.findByIdAndUpdate(listingId, { status: 'failed_pickup' });

    res.status(200).json({
      success: true,
      message: 'Failed pickup recorded. Sale closed as failed_pickup.',
      outcome
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permitted seller cancellation of a sale outcome.
 * Allowed only before completion (when pending or reserved).
 */
export const cancelSale = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const userId = req.user._id.toString();

    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (!outcome) {
      throw ApiError.notFound('Sale outcome record not found');
    }

    // Only seller can cancel
    if (outcome.seller.toString() !== userId && req.user.role !== 'admin') {
      throw ApiError.forbidden('Only the seller can cancel this sale outcome');
    }

    // Cannot cancel if completed or already rejected
    if (['completed', 'rejected', 'seller_cancelled'].includes(outcome.outcome)) {
      throw ApiError.badRequest(`Cannot cancel sale with status '${outcome.outcome}'`);
    }

    const prev = outcome.outcome;
    outcome.outcome = 'seller_cancelled';
    outcome.failureOrCancellationReason = req.body.reason || 'Seller cancelled the transaction';

    outcome.auditLog.push({
      action: 'SELLER_CANCELLED_SALE',
      previousOutcome: prev,
      newOutcome: 'seller_cancelled',
      performedBy: req.user._id,
      note: outcome.failureOrCancellationReason
    });

    await outcome.save();
    await Listing.findByIdAndUpdate(listingId, { status: 'cancelled' });

    res.status(200).json({
      success: true,
      message: 'Sale cancelled by seller.',
      outcome
    });
  } catch (error) {
    next(error);
  }
};
