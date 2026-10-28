import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: [true, 'Listing reference is required'],
      index: true
    },
    asker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Asker reference is required'],
      index: true
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Seller reference is required'],
      index: true
    },
    question: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      minlength: [3, 'Question must be at least 3 characters long'],
      maxlength: [500, 'Question cannot exceed 500 characters']
    },
    answer: {
      type: String,
      trim: true,
      default: null,
      maxlength: [1000, 'Answer cannot exceed 1000 characters']
    },
    answeredAt: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ['unanswered', 'answered'],
      default: 'unanswered',
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for querying questions by listing ordered by newest first
questionSchema.index({ listing: 1, createdAt: -1 });

export const Question = mongoose.model('Question', questionSchema);

