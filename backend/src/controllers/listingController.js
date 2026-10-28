import { Listing } from '../models/Listing.js';
import { Bid } from '../models/Bid.js';
import { SaleOutcome } from '../models/SaleOutcome.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Creates a new listing for an authenticated seller.
 */
export const createListing = async (req, res, next) => {
  try {
    const {
      title,
      category,
      description,
      condition,
      photos,
      startingPrice,
      minimumBidIncrement,
      startTime,
      closingTime
    } = req.body;

    const parsedStart = startTime ? new Date(startTime) : new Date();
    const parsedClosing = new Date(closingTime);
    const now = new Date();

    const initialStatus = parsedStart <= now ? 'active' : 'scheduled';

    const listing = await Listing.create({
      seller: req.user._id,
      title,
      category,
      description,
      condition,
      photos,
      startingPrice,
      minimumBidIncrement,
      currentPrice: startingPrice,
      leadingBid: null,
      startTime: parsedStart,
      closingTime: parsedClosing,
      status: initialStatus
    });

    res.status(201).json({
      success: true,
      message: 'Listing created successfully',
      listing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Browses and filters listings with pagination and sorting.
 */
export const getListings = async (req, res, next) => {
  try {
    const {
      search,
      category,
      condition,
      status,
      minPrice,
      maxPrice,
      closingSoon,
      sort = 'newest',
      page = 1,
      limit = 10
    } = req.query;

    const filter = {};
    const now = new Date();

    // Keyword search in title and description
    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (status) {
      filter.status = status;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.currentPrice = {};
      if (minPrice !== undefined) filter.currentPrice.$gte = parseInt(minPrice, 10);
      if (maxPrice !== undefined) filter.currentPrice.$lte = parseInt(maxPrice, 10);
    }

    if (closingSoon === true || closingSoon === 'true') {
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      filter.closingTime = { $gte: now, $lte: next24Hours };
      filter.status = { $in: ['active', 'scheduled'] };
    }

    // Sorting
    let sortOptions = { createdAt: -1 };
    if (sort === 'price_asc') sortOptions = { currentPrice: 1 };
    if (sort === 'price_desc') sortOptions = { currentPrice: -1 };
    if (sort === 'closing_soon') sortOptions = { closingTime: 1 };

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 10, 100);
    const skip = (pageNum - 1) * limitNum;

    const [listings, total] = await Promise.all([
      Listing.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .populate('seller', 'name')
        .populate({
          path: 'leadingBid',
          select: 'amount createdAt bidder',
          populate: { path: 'bidder', select: 'name' }
        })
        .lean(),
      Listing.countDocuments(filter)
    ]);

    const formattedListings = listings.map((item) => ({
      ...item,
      isBiddingActive:
        new Date(item.startTime) <= now &&
        new Date(item.closingTime) > now &&
        ['active', 'scheduled'].includes(item.status)
    }));

    res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      listings: formattedListings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves single listing details and public bid history.
 */
export const getListingById = async (req, res, next) => {
  try {
    const listingId = req.params.id;

    const listing = await Listing.findById(listingId)
      .populate('seller', 'name')
      .populate({
        path: 'leadingBid',
        select: 'amount createdAt bidder',
        populate: { path: 'bidder', select: 'name' }
      });

    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Bid history with sanitized bidder info
    const bids = await Bid.find({ listing: listingId })
      .sort({ createdAt: -1 })
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

    const responseData = listing.toJSON();
    responseData.isBiddingActive = listing.isBiddingOpen();
    responseData.bids = formattedBids;

    res.status(200).json({
      success: true,
      listing: responseData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Edits an eligible listing. Only the owner can edit.
 * Critical auction terms cannot be edited once bidding has started.
 */
export const updateListing = async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const listing = await Listing.findById(listingId);

    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Ownership check
    if (listing.seller.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('You are not authorized to edit this listing');
    }

    // Status check
    const nonEditableStatuses = ['completed', 'rejected', 'cancelled', 'failed_pickup', 'unsold'];
    if (nonEditableStatuses.includes(listing.status)) {
      throw ApiError.badRequest(`Cannot edit a listing with status '${listing.status}'`);
    }

    // Check if bids have been placed
    const bidsCount = await Bid.countDocuments({ listing: listingId });
    const hasBids = bidsCount > 0 || listing.leadingBid !== null;

    const {
      title,
      category,
      description,
      condition,
      photos,
      startingPrice,
      minimumBidIncrement,
      closingTime
    } = req.body;

    if (hasBids) {
      // Disallow changes to critical auction terms
      if (
        startingPrice !== undefined ||
        minimumBidIncrement !== undefined ||
        closingTime !== undefined
      ) {
        throw ApiError.badRequest(
          'Cannot modify starting price, minimum bid increment, or closing time once bidding has started'
        );
      }
    }

    // Apply allowed updates
    if (title !== undefined) listing.title = title;
    if (category !== undefined) listing.category = category;
    if (description !== undefined) listing.description = description;
    if (condition !== undefined) listing.condition = condition;
    if (photos !== undefined) listing.photos = photos;

    if (!hasBids) {
      if (startingPrice !== undefined) {
        listing.startingPrice = startingPrice;
        listing.currentPrice = startingPrice;
      }
      if (minimumBidIncrement !== undefined) {
        listing.minimumBidIncrement = minimumBidIncrement;
      }
      if (closingTime !== undefined) {
        const newClosing = new Date(closingTime);
        if (newClosing <= new Date(listing.startTime)) {
          throw ApiError.badRequest('Closing time must be after the start time');
        }
        listing.closingTime = newClosing;
      }
    }

    await listing.save();

    res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      listing
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancels an eligible listing. Only the owner can cancel.
 * Preserves bid history and updates any associated outcome record.
 */
export const cancelListing = async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const listing = await Listing.findById(listingId);

    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Ownership check
    if (listing.seller.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden('You are not authorized to cancel this listing');
    }

    // State check
    if (['completed', 'reserved', 'rejected', 'cancelled'].includes(listing.status)) {
      throw ApiError.badRequest(`Cannot cancel an auction with status '${listing.status}'`);
    }

    listing.status = 'cancelled';
    await listing.save();

    // Update or record SaleOutcome if exists
    const outcome = await SaleOutcome.findOne({ listing: listingId });
    if (outcome && outcome.outcome === 'pending') {
      outcome.outcome = 'seller_cancelled';
      outcome.failureOrCancellationReason = 'Seller cancelled the listing';
      outcome.auditLog.push({
        action: 'SELLER_CANCELLED',
        previousOutcome: outcome.outcome,
        newOutcome: 'seller_cancelled',
        performedBy: req.user._id,
        note: 'Listing cancelled by seller'
      });
      await outcome.save();
    }

    res.status(200).json({
      success: true,
      message: 'Listing cancelled successfully. Bid history remains preserved.',
      listing
    });
  } catch (error) {
    next(error);
  }
};

