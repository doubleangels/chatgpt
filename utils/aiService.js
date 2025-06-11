const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

// OpenAI configuration
const OPENAI_CONFIG = {
  maxTokens: 500,
  temperature: 0.7
};

// Log message constants
const LOG_EMPTY_CONVERSATION = 'Cannot generate AI response: Empty conversation provided.';
const LOG_SENDING_CONVERSATION = 'Sending conversation to OpenAI API using model: %s.';
const LOG_API_REQUEST_FAILED = 'API request failed.';
const LOG_RECEIVED_RESPONSE = 'Received response from OpenAI API.';
const LOG_NO_CHOICES = 'OpenAI API returned no choices in the response.';
const LOG_RESPONSE_GENERATED = 'Generated AI response successfully.';
const LOG_ERROR_GENERATING = 'Error generating AI response.';

// Initialize OpenAI client with API key from config.
const openai = new OpenAI({
  apiKey: openaiApiKey
});

/**
 * Generates an AI response based on conversation history.
 * Sends the conversation to OpenAI API and returns the generated response.
 * 
 * @param {Array} conversation - Array of message objects in OpenAI format.
 * @returns {Promise<string>} - The AI generated response text.
 */
async function generateAIResponse(conversation) {
  if (!conversation || conversation.length === 0) {
    logger.error(LOG_EMPTY_CONVERSATION);
    return '';
  }

  try {
    // Log the conversation being sent (sensitive data, use debug level).
    logger.debug(LOG_SENDING_CONVERSATION, modelName, {
      messageCount: conversation.length,
      model: modelName
    });
    
    let response;
    try {
      // Make API request to OpenAI.
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

    // Log successful API response.
    logger.debug(LOG_RECEIVED_RESPONSE, {
      choices: response.choices?.length || 0,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      responseId: response.id
    });
    
    // Check if the response contains any choices.
    if (!response.choices || response.choices.length === 0) {
      logger.warn(LOG_NO_CHOICES, {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }

    // Extract the reply text from the first choice.
    const reply = response.choices[0].message.content;
    logger.info(LOG_RESPONSE_GENERATED, {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0].finish_reason
    });
    
    return reply;
  } catch (error) {
    // Log and track errors.
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
