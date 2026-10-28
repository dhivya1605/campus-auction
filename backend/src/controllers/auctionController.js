import { closeAuction, closeAllExpiredAuctions } from '../services/auctionService.js';
import { Listing } from '../models/Listing.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Triggers batch closure of all expired auctions.
 * Administrative endpoint.
 */
export const triggerCloseExpiredAuctions = async (req, res, next) => {
  try {
    const summary = await closeAllExpiredAuctions(req.user?._id);
    res.status(200).json({
      success: true,
      message: `Processed ${summary.processedCount} expired auctions`,
      summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Closes a specific auction by ID once its closing time has passed.
 * Allowed for admin or the listing's seller.
 */
export const triggerCloseSingleAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Must be either an admin or the seller
    const isOwner = listing.seller.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('Only an admin or the listing owner can process auction closure');
    }

    const result = await closeAuction(id, req.user._id);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

