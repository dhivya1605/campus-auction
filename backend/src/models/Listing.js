import mongoose from 'mongoose';

export const LISTING_CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
export const LISTING_CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];
export const LISTING_STATUSES = [
  'scheduled',
  'active',
  'unsold',
  'awaiting_seller_decision',
  'reserved',
  'completed',
  'rejected',
  'cancelled',
  'failed_pickup'
];

const editHistoryEntrySchema = new mongoose.Schema(
  {
    editedAt: {
      type: Date,
      default: Date.now
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    changes: [
      {
        field: { type: String, required: true },
        oldValue: { type: mongoose.Schema.Types.Mixed },
        newValue: { type: mongoose.Schema.Types.Mixed }
      }
    ],
    reason: {
      type: String,
      default: ''
    }
  },
  { _id: true }
);

const listingSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller reference is required'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: LISTING_CATEGORIES,
        message: 'Invalid category. Allowed: {VALUES}'
      },
      index: true
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters long'],
      maxlength: [3000, 'Description cannot exceed 3000 characters']
    },
    condition: {
      type: String,
      required: [true, 'Condition is required'],
      enum: {
        values: LISTING_CONDITIONS,
        message: 'Invalid condition. Allowed: {VALUES}'
      },
      index: true
    },
    photos: {
      type: [String],
      default: []
    },
    startingPrice: {
      type: Number,
      required: [true, 'Starting price is required'],
      min: [0, 'Starting price must be a non-negative integer'],
      validate: {
        validator: Number.isInteger,
        message: 'Starting price must be an integer rupee amount'
      }
    },
    minimumBidIncrement: {
      type: Number,
      required: [true, 'Minimum bid increment is required'],
      min: [1, 'Minimum bid increment must be at least 1 rupee'],
      validate: {
        validator: Number.isInteger,
        message: 'Minimum bid increment must be an integer rupee amount'
      }
    },
    currentPrice: {
      type: Number,
      required: [true, 'Current price is required'],
      min: [0, 'Current price must be a non-negative integer'],
      validate: {
        validator: Number.isInteger,
        message: 'Current price must be an integer rupee amount'
      }
    },
    leadingBid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bid',
      default: null
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      default: Date.now,
      index: true
    },
    closingTime: {
      type: Date,
      required: [true, 'Closing time is required'],
      index: true
    },
    status: {
      type: String,
      enum: LISTING_STATUSES,
      default: 'scheduled',
      index: true
    },
    editHistory: {
      type: [editHistoryEntrySchema],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound indexes for searching, filtering, and closing queries
listingSchema.index({ status: 1, closingTime: 1 });
listingSchema.index({ category: 1, currentPrice: 1 });
listingSchema.index({ title: 'text', description: 'text' });

/**
 * Checks if bidding is currently open for this listing based on both
 * server clock and persisted auction state.
 */
listingSchema.methods.isBiddingOpen = function (atDate = new Date()) {
  const now = atDate.getTime();
  const start = new Date(this.startTime).getTime();
  const closing = new Date(this.closingTime).getTime();

  // Non-biddable persisted statuses
  const closedStatuses = [
    'unsold',
    'awaiting_seller_decision',
    'reserved',
    'completed',
    'rejected',
    'cancelled',
    'failed_pickup'
  ];
  if (closedStatuses.includes(this.status)) {
    return false;
  }

  // Must be after or at start time, and strictly before closing time
  if (now < start || now >= closing) {
    return false;
  }

  // Persisted status must be 'active' or 'scheduled' (which transitions to open once startTime passes)
  return this.status === 'active' || this.status === 'scheduled';
};

/**
 * Virtual to show whether bidding is actively open right now
 */
listingSchema.virtual('isBiddingActive').get(function () {
  return this.isBiddingOpen();
});

export const Listing = mongoose.model('Listing', listingSchema);

