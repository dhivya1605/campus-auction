import { Listing } from '../models/Listing.js';
import { Bid } from '../models/Bid.js';
import { SaleOutcome } from '../models/SaleOutcome.js';
import { ApiError } from '../utils/ApiError.js';
import { cleanupFile, cleanupFiles } from '../middleware/uploadMiddleware.js';

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
      startingPrice,
      minimumBidIncrement,
      startTime,
      closingTime
    } = req.body;

    let photos = [];
    if (req.uploadedPhotos && req.uploadedPhotos.length > 0) {
      photos = req.uploadedPhotos;
    } else if (req.file) {
      photos = [`/uploads/${req.file.filename}`];
    } else if (req.body.photos) {
      if (Array.isArray(req.body.photos)) {
        photos = req.body.photos;
      } else if (typeof req.body.photos === 'string') {
        try {
          const parsed = JSON.parse(req.body.photos);
          photos = Array.isArray(parsed) ? parsed : [req.body.photos];
        } catch {
          photos = [req.body.photos];
        }
      }
    }

    if (photos.length > 5) {
      if (req.filesList) cleanupFiles(req.filesList);
      throw ApiError.badRequest('Maximum 5 images allowed per listing.');
    }

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
    if (req.filesList && req.filesList.length > 0) {
      cleanupFiles(req.filesList);
    } else if (req.file) {
      cleanupFile(req.file.path);
    }
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
    } else if (req.query.includeCancelled !== 'true' && req.query.includeCancelled !== true) {
      filter.status = { $ne: 'cancelled' };
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
      .populate('editHistory.editedBy', 'name')
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
      retainedPhotos,
      startingPrice,
      minimumBidIncrement,
      closingTime,
      reason
    } = req.body;

    const changes = [];

    if (hasBids) {
      // Disallow changes to critical auction terms once bidding has started
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

    // Apply & track text field updates
    if (title !== undefined && title.trim() !== listing.title) {
      changes.push({ field: 'title', oldValue: listing.title, newValue: title.trim() });
      listing.title = title.trim();
    }
    if (category !== undefined && category !== listing.category) {
      changes.push({ field: 'category', oldValue: listing.category, newValue: category });
      listing.category = category;
    }
    if (description !== undefined && description.trim() !== listing.description) {
      changes.push({ field: 'description', oldValue: listing.description, newValue: description.trim() });
      listing.description = description.trim();
    }
    if (condition !== undefined && condition !== listing.condition) {
      changes.push({ field: 'condition', oldValue: listing.condition, newValue: condition });
      listing.condition = condition;
    }

    // Handle photos (multiple images, retaining existing, adding new, or deleting)
    const oldPhotos = [...(listing.photos || [])];
    let newPhotosList = null;

    const shouldRemoveAll =
      req.body.removePhoto === 'true' ||
      req.body.removePhoto === true ||
      req.body.deletePhoto === 'true';

    const uploaded = req.uploadedPhotos || (req.file ? [`/uploads/${req.file.filename}`] : []);

    if (shouldRemoveAll) {
      // Seller requested removing all existing photos; only keep newly uploaded (if any)
      newPhotosList = [...uploaded];
    } else if (retainedPhotos !== undefined) {
      // Seller sent specific subset of existing photos to retain
      let parsedRetained = [];
      if (Array.isArray(retainedPhotos)) {
        parsedRetained = retainedPhotos;
      } else if (typeof retainedPhotos === 'string') {
        try {
          const parsed = JSON.parse(retainedPhotos);
          parsedRetained = Array.isArray(parsed) ? parsed : [retainedPhotos];
        } catch {
          parsedRetained = retainedPhotos ? [retainedPhotos] : [];
        }
      }
      // Safety filter: ensure retained photos actually belonged to the listing's photos
      const safeRetained = parsedRetained.filter((p) => oldPhotos.includes(p));
      newPhotosList = [...safeRetained, ...uploaded];
    } else if (uploaded.length > 0) {
      // If new files were uploaded and no retainedPhotos specified, replace photos with new ones
      newPhotosList = [...uploaded];
    } else if (photos !== undefined) {
      // If photos array was explicitly passed in body
      const parsedPhotos = Array.isArray(photos) ? photos : [photos];
      newPhotosList = parsedPhotos;
    }

    if (newPhotosList !== null) {
      if (newPhotosList.length > 5) {
        if (req.filesList) cleanupFiles(req.filesList);
        throw ApiError.badRequest('A listing cannot have more than 5 images.');
      }

      // Check if photos actually changed
      const hasPhotoChanges =
        oldPhotos.length !== newPhotosList.length ||
        oldPhotos.some((p, i) => p !== newPhotosList[i]);

      if (hasPhotoChanges) {
        changes.push({ field: 'photos', oldValue: oldPhotos, newValue: newPhotosList });
        listing.photos = newPhotosList;
      }
    }

    if (!hasBids) {
      if (startingPrice !== undefined && Number(startingPrice) !== listing.startingPrice) {
        const newStart = parseInt(startingPrice, 10);
        changes.push({ field: 'startingPrice', oldValue: listing.startingPrice, newValue: newStart });
        listing.startingPrice = newStart;
        listing.currentPrice = newStart;
      }
      if (
        minimumBidIncrement !== undefined &&
        Number(minimumBidIncrement) !== listing.minimumBidIncrement
      ) {
        const newInc = parseInt(minimumBidIncrement, 10);
        changes.push({
          field: 'minimumBidIncrement',
          oldValue: listing.minimumBidIncrement,
          newValue: newInc
        });
        listing.minimumBidIncrement = newInc;
      }
      if (closingTime !== undefined) {
        const newClosing = new Date(closingTime);
        if (newClosing <= new Date(listing.startTime)) {
          throw ApiError.badRequest('Closing time must be after the start time');
        }
        if (newClosing <= new Date()) {
          throw ApiError.badRequest('Closing time must be in the future');
        }
        if (newClosing.getTime() !== new Date(listing.closingTime).getTime()) {
          changes.push({
            field: 'closingTime',
            oldValue: listing.closingTime,
            newValue: newClosing
          });
          listing.closingTime = newClosing;
        }
      }
    }

    // Record edit in audit trail if any fields changed
    if (changes.length > 0) {
      if (!listing.editHistory) {
        listing.editHistory = [];
      }
      listing.editHistory.push({
        editedAt: new Date(),
        editedBy: req.user._id,
        changes,
        reason: reason || (hasBids ? 'Seller listing correction' : 'Listing update')
      });
    }

    await listing.save();

    // After successful database update, clean up unreferenced removed files from disk
    if (newPhotosList !== null) {
      const removedFiles = oldPhotos.filter((p) => !newPhotosList.includes(p));
      removedFiles.forEach((p) => {
        if (p && typeof p === 'string' && p.startsWith('/uploads/')) {
          cleanupFile(p);
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      listing
    });
  } catch (error) {
    if (req.filesList && req.filesList.length > 0) {
      cleanupFiles(req.filesList);
    } else if (req.file) {
      cleanupFile(req.file.path);
    }
    next(error);
  }
};

/**
 * Cancels an eligible listing. Only the owner can cancel.
 * Preserves bid history, images, and updates audit/outcome records.
 */
export const cancelListing = async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const listing = await Listing.findById(listingId);

    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Ownership check
    const isOwner = listing.seller.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You are not authorized to cancel this listing');
    }

    // State check - cannot cancel closed, reserved, or already finalized auctions
    const nonCancellable = ['completed', 'reserved', 'rejected', 'cancelled', 'failed_pickup'];
    if (nonCancellable.includes(listing.status)) {
      throw ApiError.badRequest(`Cannot cancel an auction with status '${listing.status}'`);
    }

    // Check if bidding has started
    const bidsCount = await Bid.countDocuments({ listing: listingId });
    const hasBids = bidsCount > 0 || listing.leadingBid !== null;

    const reason =
      req.body?.reason?.trim() ||
      req.query?.reason?.trim() ||
      (hasBids ? 'Seller cancelled active auction with bids' : 'Seller cancelled listing');

    const previousStatus = listing.status;
    listing.status = 'cancelled';

    // Record in listing edit history audit trail
    if (!listing.editHistory) {
      listing.editHistory = [];
    }
    listing.editHistory.push({
      editedAt: new Date(),
      editedBy: req.user._id,
      changes: [{ field: 'status', oldValue: previousStatus, newValue: 'cancelled' }],
      reason
    });

    await listing.save();

    // Update or upsert SaleOutcome record
    await SaleOutcome.findOneAndUpdate(
      { listing: listingId },
      {
        $setOnInsert: {
          seller: listing.seller,
          provisionalWinner: null,
          winningBid: null,
          sellerDecision: 'pending'
        },
        $set: {
          outcome: 'seller_cancelled',
          failureOrCancellationReason: reason
        },
        $push: {
          auditLog: {
            action: 'SELLER_CANCELLED',
            previousOutcome: previousStatus,
            newOutcome: 'seller_cancelled',
            performedBy: req.user._id,
            note: reason
          }
        }
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Listing cancelled successfully. Bid history and details remain preserved.',
      listing
    });
  } catch (error) {
    next(error);
  }
};

