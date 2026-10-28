import mongoose from 'mongoose';

export const SELLER_DECISIONS = ['pending', 'approved', 'rejected'];
export const SALE_OUTCOMES = [
  'pending',
  'reserved',
  'completed',
  'rejected',
  'seller_cancelled',
  'failed_pickup',
  'unsold'
];

const handoverConfirmationSchema = new mongoose.Schema(
  {
    confirmedBySeller: {
      type: Boolean,
      default: false
    },
    sellerConfirmedAt: {
      type: Date,
      default: null
    },
    confirmedByBuyer: {
      type: Boolean,
      default: false
    },
    buyerConfirmedAt: {
      type: Date,
      default: null
    },
    handoverLocation: {
      type: String,
      trim: true,
      default: ''
    },
    handoverNotes: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { _id: false }
);

const auditEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true
    },
    previousOutcome: {
      type: String
    },
    newOutcome: {
      type: String
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    }
  },
  { _id: false }
);

const saleOutcomeSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: [true, 'Listing reference is required'],
      unique: true, // Prevent duplicate sale outcome records for the same listing
      index: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller reference is required'],
      index: true
    },
    provisionalWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    winningBid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bid',
      default: null
    },
    sellerDecision: {
      type: String,
      enum: SELLER_DECISIONS,
      default: 'pending'
    },
    outcome: {
      type: String,
      enum: SALE_OUTCOMES,
      default: 'pending',
      index: true
    },
    reservationTimestamp: {
      type: Date,
      default: null
    },
    sellerDecisionTimestamp: {
      type: Date,
      default: null
    },
    handoverConfirmation: {
      type: handoverConfirmationSchema,
      default: () => ({})
    },
    failureOrCancellationReason: {
      type: String,
      default: ''
    },
    auditLog: {
      type: [auditEntrySchema],
      default: []
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

export const SaleOutcome = mongoose.model('SaleOutcome', saleOutcomeSchema);

