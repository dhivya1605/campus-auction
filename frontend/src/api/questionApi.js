import apiClient from './apiClient';

export const questionApi = {
  /**
   * Retrieves all questions asked on a specific listing.
   * @param {string} listingId
   */
  getQuestions: async (listingId) => {
    return apiClient.get(`/questions/listing/${listingId}`);
  },

  /**
   * Submits a new question on a listing.
   * @param {string} listingId
   * @param {string} questionText
   */
  askQuestion: async (listingId, questionText) => {
    return apiClient.post(
      `/questions/listing/${listingId}`,
      { question: questionText },
      { requiresAuth: true }
    );
  },

  /**
   * Submits or edits an answer to an existing question (seller only).
   * @param {string} questionId
   * @param {string} answerText
   */
  answerQuestion: async (questionId, answerText) => {
    return apiClient.patch(
      `/questions/${questionId}/answer`,
      { answer: answerText },
      { requiresAuth: true }
    );
  }
};

export default questionApi;

