import mongoose from 'mongoose';
import { Question } from '../models/Question.js';
import { Listing } from '../models/Listing.js';
import { ApiError } from '../utils/ApiError.js';
import {
  notifyQuestionAsked,
  notifyQuestionAnswered
} from '../services/notificationService.js';

/**
 * GET questions for a specific listing.
 * Public endpoint (anyone can read questions on a listing).
 */
export const getListingQuestions = async (req, res, next) => {
  try {
    const listingId = req.params.listingId || req.params.id;

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      throw ApiError.badRequest('Invalid listing ID format');
    }

    const listing = await Listing.findById(listingId).select('_id title seller status closingTime');
    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    const questions = await Question.find({ listing: listingId })
      .sort({ createdAt: -1 })
      .populate('asker', 'name')
      .lean();

    const formatted = questions.map((q) => ({
      _id: q._id,
      listing: q.listing,
      asker: {
        _id: q.asker?._id,
        name: q.asker?.name || 'Anonymous Student'
      },
      seller: q.seller,
      question: q.question,
      answer: q.answer,
      answeredAt: q.answeredAt,
      status: q.status,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      questions: formatted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST a new question on a listing.
 * Requires authentication.
 */
export const askQuestion = async (req, res, next) => {
  try {
    const listingId = req.params.listingId || req.params.id;
    const askerId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      throw ApiError.badRequest('Invalid listing ID format');
    }

    const text = (req.body.question || req.body.questionText || '').trim();
    if (!text) {
      throw ApiError.badRequest('Question text is required');
    }
    if (text.length < 3) {
      throw ApiError.badRequest('Question must be at least 3 characters long');
    }
    if (text.length > 500) {
      throw ApiError.badRequest('Question cannot exceed 500 characters');
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      throw ApiError.notFound('Listing not found');
    }

    // Seller cannot ask questions on their own listing
    if (listing.seller.toString() === askerId.toString()) {
      throw ApiError.badRequest('Sellers cannot ask questions on their own listing');
    }

    // Check auction status: reject if closed or cancelled
    const closedStatuses = [
      'unsold',
      'awaiting_seller_decision',
      'reserved',
      'completed',
      'rejected',
      'cancelled',
      'failed_pickup'
    ];
    const isPastClosing = new Date() >= new Date(listing.closingTime);
    if (closedStatuses.includes(listing.status) || isPastClosing) {
      throw ApiError.badRequest(
        'Bidding has ended or this auction is closed. New questions can no longer be submitted.'
      );
    }

    // Spam & rate-limiting protection:
    // 1. Minimum 5 seconds between questions by the same user on this listing
    const recent = await Question.findOne({
      listing: listingId,
      asker: askerId,
      createdAt: { $gte: new Date(Date.now() - 5000) }
    });
    if (recent) {
      throw ApiError.badRequest('Please wait a few seconds before asking another question.');
    }

    // 2. Prevent exact duplicate question on this listing
    const duplicate = await Question.findOne({
      listing: listingId,
      asker: askerId,
      question: text
    });
    if (duplicate) {
      throw ApiError.badRequest('You have already submitted this question on this listing.');
    }

    const questionDoc = await Question.create({
      listing: listing._id,
      asker: askerId,
      seller: listing.seller,
      question: text,
      status: 'unanswered'
    });

    // Notify seller safely
    notifyQuestionAsked({
      sellerId: listing.seller,
      listingId: listing._id,
      listingTitle: listing.title,
      questionId: questionDoc._id,
      questionText: text,
      askerName: req.user.name
    }).catch((err) => console.error('[QuestionController] notifyQuestionAsked error:', err.message));

    const populated = await Question.findById(questionDoc._id).populate('asker', 'name').lean();

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully',
      question: {
        _id: populated._id,
        listing: populated.listing,
        asker: {
          _id: populated.asker?._id,
          name: populated.asker?.name || req.user.name
        },
        seller: populated.seller,
        question: populated.question,
        answer: populated.answer,
        answeredAt: populated.answeredAt,
        status: populated.status,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH answer to an existing question.
 * Only the owner/seller of the listing may answer.
 */
export const answerQuestion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id.toString();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest('Invalid question ID format');
    }

    const answerText = (req.body.answer || req.body.answerText || '').trim();
    if (!answerText) {
      throw ApiError.badRequest('Answer text is required');
    }
    if (answerText.length > 1000) {
      throw ApiError.badRequest('Answer cannot exceed 1000 characters');
    }

    const questionDoc = await Question.findById(id).populate('listing', 'title seller');
    if (!questionDoc) {
      throw ApiError.notFound('Question not found');
    }

    // Authorization check: Only the seller of this listing can answer
    const sellerId = questionDoc.seller?.toString() || questionDoc.listing?.seller?.toString();
    if (sellerId !== userId && req.user.role !== 'admin') {
      throw ApiError.forbidden('Only the seller of this listing can answer questions');
    }

    questionDoc.answer = answerText;
    questionDoc.answeredAt = new Date();
    questionDoc.status = 'answered';
    await questionDoc.save();

    // Notify the question asker safely
    notifyQuestionAnswered({
      askerId: questionDoc.asker,
      listingId: questionDoc.listing?._id || questionDoc.listing,
      listingTitle: questionDoc.listing?.title || 'item',
      questionId: questionDoc._id,
      answerText
    }).catch((err) => console.error('[QuestionController] notifyQuestionAnswered error:', err.message));

    const populated = await Question.findById(questionDoc._id).populate('asker', 'name').lean();

    res.status(200).json({
      success: true,
      message: 'Answer submitted successfully',
      question: {
        _id: populated._id,
        listing: populated.listing?._id || populated.listing,
        asker: {
          _id: populated.asker?._id,
          name: populated.asker?.name || 'Anonymous Student'
        },
        seller: populated.seller,
        question: populated.question,
        answer: populated.answer,
        answeredAt: populated.answeredAt,
        status: populated.status,
        createdAt: populated.createdAt,
        updatedAt: populated.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

