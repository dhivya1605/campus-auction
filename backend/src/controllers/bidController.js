import mongoose from 'mongoose';
import { Listing } from '../models/Listing.js';
import { Bid } from '../models/Bid.js';
import { ApiError } from '../utils/ApiError.js';
import { notifyBidPlaced, notifyOutbid, notifySellerNewBid } from '../services/notificationService.js';

/**
 * Places a bid on an active listing with robust concurrency handling.
 */
export const placeBid = async (req, res, next) => {
  const session = await mongoose.startSession().catch(() => null);
  const useTransaction = session && mongoose.connection.transaction !== undefined;

  try {
    const listingId = req.params.id;
    const bidderId = req.user._id;
    const amount = parseInt(req.body.amount, 10);

    const now = new Date();

    // Fetch listing
    const listing = await Listing.findById(listingId);
    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // 1. Seller cannot bid on their own listing
    if (listing.seller.toString() === bidderId.toString()) {
      throw ApiError.forbidden('Sellers are not permitted to bid on their own listings');
    }

    // 2. Reject bids before auction starts
    if (now < new Date(listing.startTime)) {
      throw ApiError.badRequest('Bidding has not started yet for this auction');
    }

    // 3. Reject bids at or after closing time
    if (now >= new Date(listing.closingTime)) {
      throw ApiError.badRequest('Bidding has ended. This auction is closed');
    }

    // 4. Check if listing status allows bidding
    if (!listing.isBiddingOpen(now)) {
      throw ApiError.badRequest(`Cannot place bid. Auction status is '${listing.status}'`);
    }

    // 5. Calculate minimum required bid
    const isFirstBid = !listing.leadingBid;
    let minRequiredBid;

    if (isFirstBid) {
      minRequiredBid = listing.startingPrice;
      if (amount < minRequiredBid) {
        throw ApiError.badRequest(
          `First bid must be at least the starting price of ₹${minRequiredBid}`
        );
      }
    } else {
      minRequiredBid = listing.currentPrice + listing.minimumBidIncrement;
      if (amount < minRequiredBid) {
        throw ApiError.badRequest(
          `Bid amount of ₹${amount} is too low. Minimum required bid is ₹${minRequiredBid} (current price ₹${listing.currentPrice} + ₹${listing.minimumBidIncrement} increment)`
        );
      }
    }

    // Attempt with transaction if supported
    if (session) {
      try {
        session.startTransaction();

        // Re-read inside transaction for strict isolation
        const lockedListing = await Listing.findById(listingId).session(session);
        if (!lockedListing || !lockedListing.isBiddingOpen(now)) {
          throw ApiError.badRequest('Auction is no longer open for bidding');
        }

        const currentLockedMin = !lockedListing.leadingBid
          ? lockedListing.startingPrice
          : lockedListing.currentPrice + lockedListing.minimumBidIncrement;

        if (amount < currentLockedMin) {
          throw ApiError.badRequest(
            `A competing bid was placed. Minimum required bid is now ₹${currentLockedMin}`
          );
        }

        // Create bid
        const [bid] = await Bid.create(
          [
            {
              listing: listing._id,
              bidder: bidderId,
              amount,
              createdAt: now
            }
          ],
          { session }
        );

        // Anti-sniping policy: if valid bid arrives within final 30 seconds, extend closingTime to 60s from now
        const remainingMs = new Date(lockedListing.closingTime).getTime() - now.getTime();
        let wasExtended = false;
        if (remainingMs > 0 && remainingMs <= 30 * 1000) {
          wasExtended = true;
          const oldClosing = lockedListing.closingTime;
          lockedListing.closingTime = new Date(now.getTime() + 60 * 1000);
          if (!lockedListing.editHistory) lockedListing.editHistory = [];
          lockedListing.editHistory.push({
            editedAt: now,
            editedBy: bidderId,
            changes: [
              {
                field: 'closingTime',
                oldValue: oldClosing,
                newValue: lockedListing.closingTime
              }
            ],
            reason: 'Anti-sniping extension: bid placed within final 30 seconds of auction'
          });
        }

        // Update listing
        lockedListing.currentPrice = amount;
        lockedListing.leadingBid = bid._id;
        lockedListing.status = 'active';
        await lockedListing.save({ session });

        await session.commitTransaction();
        await session.endSession();

        const populatedBid = await Bid.findById(bid._id).populate('bidder', 'name');

        // Create notifications safely before sending response
        try {
          const prevLeadBid = listing.leadingBid
            ? await Bid.findById(listing.leadingBid).select('bidder').lean()
            : null;
          await notifyBidPlaced({
            recipientId: bidderId,
            listingId: listing._id,
            listingTitle: listing.title,
            amount
          });
          await notifySellerNewBid({
            sellerId: listing.seller,
            listingId: listing._id,
            listingTitle: listing.title,
            amount
          });
          if (prevLeadBid && prevLeadBid.bidder.toString() !== bidderId.toString()) {
            await notifyOutbid({
              recipientId: prevLeadBid.bidder,
              listingId: listing._id,
              listingTitle: listing.title,
              newAmount: amount,
              previousBidId: prevLeadBid._id
            });
          }
        } catch (notifErr) {
          console.error('[BidController] Notification error:', notifErr.message);
        }

        return res.status(201).json({
          success: true,
          message: wasExtended
            ? 'Bid placed successfully! Auction closing time extended by anti-sniping protection.'
            : 'Bid placed successfully',
          bid: {
            id: populatedBid._id,
            amount: populatedBid.amount,
            bidder: {
              id: populatedBid.bidder._id,
              name: populatedBid.bidder.name
            },
            createdAt: populatedBid.createdAt
          },
          currentPrice: lockedListing.currentPrice,
          closingTime: lockedListing.closingTime,
          extended: wasExtended
        });
      } catch (txnError) {
        await session.abortTransaction().catch(() => { });
        await session.endSession().catch(() => { });

        // If transaction failed due to write conflict, throw 409 conflict
        if (txnError.hasErrorLabel && txnError.hasErrorLabel('TransientTransactionError')) {
          throw ApiError.conflict('A competing bid was placed simultaneously. Please retry with a higher bid.');
        }

        // If transaction error was an ApiError, rethrow
        if (txnError instanceof ApiError) {
          throw txnError;
        }

        // If transactions aren't supported on this replica-less mongo, fall through to atomic CAS
      }
    }

    // Atomic Conditional Update (Compare-And-Swap fallback)
    // Anti-sniping calculation
    const remainingMs = new Date(listing.closingTime).getTime() - now.getTime();
    const shouldExtend = remainingMs > 0 && remainingMs <= 30 * 1000;
    const newClosingTime = shouldExtend ? new Date(now.getTime() + 60 * 1000) : undefined;

    // Create new bid record first
    const createdBid = await Bid.create({
      listing: listing._id,
      bidder: bidderId,
      amount,
      createdAt: now
    });

    // Match exact previous state (optimistic lock)
    const filter = {
      _id: listing._id,
      currentPrice: listing.currentPrice,
      leadingBid: listing.leadingBid,
      closingTime: { $gt: now },
      status: { $in: ['active', 'scheduled'] }
    };

    const update = {
      $set: {
        currentPrice: amount,
        leadingBid: createdBid._id,
        status: 'active'
      }
    };

    if (shouldExtend) {
      update.$set.closingTime = newClosingTime;
      update.$push = {
        editHistory: {
          editedAt: now,
          editedBy: bidderId,
          changes: [
            {
              field: 'closingTime',
              oldValue: listing.closingTime,
              newValue: newClosingTime
            }
          ],
          reason: 'Anti-sniping extension: bid placed within final 30 seconds of auction'
        }
      };
    }

    const updatedListing = await Listing.findOneAndUpdate(filter, update, {
      new: true
    });

    if (!updatedListing) {
      // Concurrency collision: another bid was accepted in between!
      // Delete the orphaned bid record to preserve consistency
      await Bid.findByIdAndDelete(createdBid._id);
      throw ApiError.conflict(
        'A competing bid was accepted concurrently. Please refresh the listing and try again with a higher bid.'
      );
    }

    const populatedBid = await Bid.findById(createdBid._id).populate('bidder', 'name');

    // Create notifications safely before sending response
    try {
      const prevLeadBid = listing.leadingBid
        ? await Bid.findById(listing.leadingBid).select('bidder').lean()
        : null;
      await notifyBidPlaced({
        recipientId: bidderId,
        listingId: listing._id,
        listingTitle: listing.title,
        amount
      });
      await notifySellerNewBid({
        sellerId: listing.seller,
        listingId: listing._id,
        listingTitle: listing.title,
        amount
      });
      if (prevLeadBid && prevLeadBid.bidder.toString() !== bidderId.toString()) {
        await notifyOutbid({
          recipientId: prevLeadBid.bidder,
          listingId: listing._id,
          listingTitle: listing.title,
          newAmount: amount,
          previousBidId: prevLeadBid._id
        });
      }
    } catch (notifErr) {
      console.error('[BidController] Notification error:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: shouldExtend
        ? 'Bid placed successfully! Auction closing time extended by anti-sniping protection.'
        : 'Bid placed successfully',
      bid: {
        id: populatedBid._id,
        amount: populatedBid.amount,
        bidder: {
          id: populatedBid.bidder._id,
          name: populatedBid.bidder.name
        },
        createdAt: populatedBid.createdAt
      },
      currentPrice: updatedListing.currentPrice,
      closingTime: updatedListing.closingTime,
      extended: shouldExtend
    });
  } catch (error) {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // ignore
      }
    }
    next(error);
  }
};

/**
 * Retrieves public bid history for a listing, sorted from highest / newest.
 * Bidder emails and passwords are never exposed.
 */
export const getListingBids = async (req, res, next) => {
  try {
    const listingId = req.params.id;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    const bids = await Bid.find({ listing: listingId })
      .sort({ amount: -1, createdAt: -1 })
      .populate('bidder', 'name')
      .lean();

    const formattedBids = bids.map((b) => ({
      id: b._id,
      amount: b.amount,
      bidder: {
        id: b.bidder?._id,
        name: b.bidder?.name || 'Anonymous Student'
      },
      createdAt: b.createdAt
    }));

    res.status(200).json({
      success: true,
      count: formattedBids.length,
      bids: formattedBids
    });
  } catch (error) {
    next(error);
  }
};

