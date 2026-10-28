import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { questionApi } from '../api/questionApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 1000;

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export const QuestionsAndAnswers = ({ listingId, isSeller, isBiddingOpen }) => {
  const { isAuthenticated, user } = useAuth();
  const { fetchNotifications } = useNotifications();

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ask Question Form
  const [questionText, setQuestionText] = useState('');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [questionSuccess, setQuestionSuccess] = useState(null);
  const [questionError, setQuestionError] = useState(null);

  // Seller Answer Form state
  const [activeAnswerId, setActiveAnswerId] = useState(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [answerError, setAnswerError] = useState(null);

  const inFlightRef = useRef(false);

  const fetchQuestions = useCallback(async () => {
    if (!listingId || inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      setError(null);
      const res = await questionApi.getQuestions(listingId);
      if (res?.success) {
        setQuestions(res.questions || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [listingId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAskSubmit = async (e) => {
    e.preventDefault();
    const trimmed = questionText.trim();
    if (!trimmed) {
      setQuestionError('Please enter a question before submitting.');
      return;
    }
    if (trimmed.length < 3) {
      setQuestionError('Question must be at least 3 characters long.');
      return;
    }
    if (trimmed.length > MAX_QUESTION_LENGTH) {
      setQuestionError(`Question cannot exceed ${MAX_QUESTION_LENGTH} characters.`);
      return;
    }

    try {
      setSubmittingQuestion(true);
      setQuestionError(null);
      setQuestionSuccess(null);

      const res = await questionApi.askQuestion(listingId, trimmed);
      if (res?.success) {
        setQuestionText('');
        setQuestionSuccess('Your question has been posted! The seller has been notified.');
        // Prepend new question to list
        setQuestions((prev) => [res.question, ...prev]);
        // Refresh notifications
        fetchNotifications();
      }
    } catch (err) {
      setQuestionError(err.message || 'Failed to submit question. Please try again.');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleOpenAnswerBox = (question) => {
    setActiveAnswerId(question._id);
    setAnswerDraft(question.answer || '');
    setAnswerError(null);
  };

  const handleCancelAnswer = () => {
    setActiveAnswerId(null);
    setAnswerDraft('');
    setAnswerError(null);
  };

  const handleAnswerSubmit = async (questionId) => {
    const trimmed = answerDraft.trim();
    if (!trimmed) {
      setAnswerError('Please enter an answer before submitting.');
      return;
    }
    if (trimmed.length > MAX_ANSWER_LENGTH) {
      setAnswerError(`Answer cannot exceed ${MAX_ANSWER_LENGTH} characters.`);
      return;
    }

    try {
      setSubmittingAnswer(true);
      setAnswerError(null);

      const res = await questionApi.answerQuestion(questionId, trimmed);
      if (res?.success) {
        setActiveAnswerId(null);
        setAnswerDraft('');
        // Update question in local state
        setQuestions((prev) =>
          prev.map((q) => (q._id === questionId ? res.question : q))
        );
        fetchNotifications();
      }
    } catch (err) {
      setAnswerError(err.message || 'Failed to submit answer.');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  return (
    <section className="qa-section" id="questions">
      <div className="qa-header">
        <h2 className="qa-title">
          💬 Questions & Answers Before Bidding
          {questions.length > 0 && <span className="qa-count-pill">{questions.length}</span>}
        </h2>
        <p className="qa-subtitle">
          Ask the seller about item condition, included accessories, or pickup arrangements before placing a bid.
        </p>
      </div>

      {/* Ask Question Box */}
      {isBiddingOpen ? (
        !isSeller ? (
          isAuthenticated ? (
            <form onSubmit={handleAskSubmit} className="qa-ask-form">
              <label htmlFor="qa-input" className="form-label" style={{ fontWeight: 600 }}>
                Have a question about this item?
              </label>

              {questionSuccess && <div className="alert alert-success">{questionSuccess}</div>}
              {questionError && <div className="alert alert-danger">{questionError}</div>}

              <div style={{ position: 'relative' }}>
                <textarea
                  id="qa-input"
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Does the cycle come with a lock and key? Any issues with gears?"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  maxLength={MAX_QUESTION_LENGTH}
                  disabled={submittingQuestion}
                  style={{ minHeight: '80px', paddingBottom: '1.75rem' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '12px',
                    fontSize: '0.75rem',
                    color:
                      questionText.length >= MAX_QUESTION_LENGTH
                        ? 'var(--danger)'
                        : 'var(--text-light)'
                  }}
                >
                  {questionText.length}/{MAX_QUESTION_LENGTH}
                </span>
              </div>

              <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingQuestion || !questionText.trim()}
                  style={{ padding: '0.45rem 1.1rem', fontSize: '0.9rem' }}
                >
                  {submittingQuestion ? 'Posting...' : 'Ask Question'}
                </button>
              </div>
            </form>
          ) : (
            <div className="qa-login-prompt">
              <span>Have a question about this item?</span>
              <Link to="/login" className="btn btn-secondary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.85rem' }}>
                Log in to ask
              </Link>
            </div>
          )
        ) : (
          <div className="qa-seller-notice">
            ℹ️ You are the seller of this listing. You can answer questions asked by prospective student buyers below.
          </div>
        )
      ) : (
        <div className="qa-closed-notice">
          ⏱️ Bidding has ended or this auction is closed. New questions can no longer be submitted, but previous Q&As remain visible below.
        </div>
      )}

      {/* Questions List */}
      <div className="qa-list-container">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem' }} />
            <span>Loading questions...</span>
          </div>
        ) : error ? (
          <div className="alert alert-danger">{error}</div>
        ) : questions.length === 0 ? (
          <div className="qa-empty-state">
            <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>💬</div>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem' }}>
              No questions asked yet
            </div>
            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {isSeller
                ? 'Questions from prospective buyers will appear here.'
                : 'Be the first to ask the seller a question before bidding!'}
            </div>
          </div>
        ) : (
          <div className="qa-list">
            {questions.map((q) => {
              const isAnswered = q.status === 'answered' && Boolean(q.answer);
              const isReplying = activeAnswerId === q._id;

              return (
                <article key={q._id} className="qa-card">
                  {/* Question Header */}
                  <div className="qa-card-header">
                    <div className="qa-asker-info">
                      <span className="qa-asker-icon">👤</span>
                      <strong className="qa-asker-name">{q.asker?.name || 'Student'}</strong>
                      <span className="qa-dot-divider">•</span>
                      <span className="qa-time">{formatTimeAgo(q.createdAt)}</span>
                    </div>

                    <span
                      className={`qa-status-badge ${isAnswered ? 'qa-status-answered' : 'qa-status-pending'
                        }`}
                    >
                      {isAnswered ? '✓ Answered' : 'Awaiting Seller Response'}
                    </span>
                  </div>

                  {/* Question Content */}
                  <div className="qa-question-text">{q.question}</div>

                  {/* Existing Answer Block */}
                  {isAnswered && (
                    <div className="qa-answer-block">
                      <div className="qa-answer-header">
                        <span className="qa-answer-tag">Seller Answer</span>
                        <span className="qa-time">{formatTimeAgo(q.answeredAt)}</span>
                      </div>
                      <div className="qa-answer-text">{q.answer}</div>
                    </div>
                  )}

                  {/* Seller Answer Controls */}
                  {isSeller && (
                    <div className="qa-seller-actions">
                      {!isReplying ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => handleOpenAnswerBox(q)}
                        >
                          {isAnswered ? '✏️ Edit Answer' : '💬 Answer Question'}
                        </button>
                      ) : (
                        <div className="qa-answer-form">
                          {answerError && <div className="alert alert-danger" style={{ padding: '0.5rem', fontSize: '0.8rem' }}>{answerError}</div>}
                          <label className="form-label" style={{ fontSize: '0.85rem' }}>
                            {isAnswered ? 'Edit your answer:' : 'Answer as Seller:'}
                          </label>
                          <div style={{ position: 'relative' }}>
                            <textarea
                              className="form-control"
                              rows={3}
                              placeholder="Type your answer clearly for all students to see..."
                              value={answerDraft}
                              onChange={(e) => setAnswerDraft(e.target.value)}
                              maxLength={MAX_ANSWER_LENGTH}
                              disabled={submittingAnswer}
                              style={{ paddingBottom: '1.75rem', fontSize: '0.9rem' }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '12px',
                                fontSize: '0.725rem',
                                color:
                                  answerDraft.length >= MAX_ANSWER_LENGTH
                                    ? 'var(--danger)'
                                    : 'var(--text-light)'
                              }}
                            >
                              {answerDraft.length}/{MAX_ANSWER_LENGTH}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem' }}
                              onClick={handleCancelAnswer}
                              disabled={submittingAnswer}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '0.35rem 0.95rem', fontSize: '0.85rem' }}
                              onClick={() => handleAnswerSubmit(q._id)}
                              disabled={submittingAnswer || !answerDraft.trim()}
                            >
                              {submittingAnswer ? 'Saving...' : isAnswered ? 'Update Answer' : 'Post Answer'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default QuestionsAndAnswers;

