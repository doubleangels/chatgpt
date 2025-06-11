const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Configuration for OpenAI API requests
 * @type {Object}
 */
const OPENAI_CONFIG = {
  maxTokens: 500,      // Maximum tokens in the response
  temperature: 0.7     // Controls randomness (0.0 to 1.0)
};

// Log message constants
const LOG_EMPTY_CONVERSATION = 'Cannot generate AI response: Empty conversation provided.';
const LOG_SENDING_CONVERSATION = 'Sending conversation to OpenAI API using model: %s.';
const LOG_API_REQUEST_FAILED = 'API request failed.';
const LOG_RECEIVED_RESPONSE = 'Received response from OpenAI API.';
const LOG_NO_CHOICES = 'OpenAI API returned no choices in the response.';
const LOG_RESPONSE_GENERATED = 'Generated AI response successfully.';
const LOG_ERROR_GENERATING = 'Error generating AI response.';

/**
 * OpenAI client instance configured with API key
 * @type {OpenAI}
 */
const openai = new OpenAI({
  apiKey: openaiApiKey
});

/**
 * Generates an AI response using OpenAI's API based on the provided conversation history.
 * 
 * @param {Array<{role: string, content: string}>} conversation - Array of conversation messages
 * @returns {Promise<string>} The generated AI response, or empty string if generation fails
 */
async function generateAIResponse(conversation) {
  if (!conversation || conversation.length === 0) {
    logger.error(LOG_EMPTY_CONVERSATION);
    return '';
  }

  try {
    logger.debug(LOG_SENDING_CONVERSATION, modelName, {
      messageCount: conversation.length,
      model: modelName
    });
    
    let response;
    try {
      response = await openai.chat.completions.create({
        model: modelName,
        messages: conversation,
        max_tokens: OPENAI_CONFIG.maxTokens,
        temperature: OPENAI_CONFIG.temperature,
      });
    } catch (apiError) {
      logger.error(LOG_API_REQUEST_FAILED, {
        error: apiError.stack,
        message: apiError.message,
        model: modelName,
        statusCode: apiError.status || 'unknown'
      });
      return '';
    }

    logger.debug(LOG_RECEIVED_RESPONSE, {
      choices: response.choices?.length || 0,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      responseId: response.id
    });
    
    if (!response.choices || response.choices.length === 0) {
      logger.warn(LOG_NO_CHOICES, {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }

    const reply = response.choices[0].message.content;
    logger.info(LOG_RESPONSE_GENERATED, {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0].finish_reason
    });
    
    return reply;
  } catch (error) {
    logger.error(LOG_ERROR_GENERATING, {
      error: error.stack,
      message: error.message,
      model: modelName,
      errorType: error.type || 'unknown',
      errorCode: error.code || 'unknown',
      statusCode: error.status || 'unknown'
    });
    return '';
  }
}

module.exports = { generateAIResponse };
