const { OpenAI } = require('openai');
const { openaiApiKey, modelName, getTemperature, reasoningEffort, responsesVerbosity } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const { hasImages, SYSTEM_MESSAGES } = require('./aiUtils');

/**
 * Determines if the model supports custom temperature values.
 * All models support custom temperature in the Responses API.
 * 
 * @param {string} model - The model name
 * @returns {boolean} True if the model supports custom temperature
 */
function supportsCustomTemperature(model) {
  return true;
}

/**
 * Determines if the model supports reasoning effort configuration.
 *
 * @param {string} model - The model name
 * @returns {boolean} True if the model supports reasoning effort
 */
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
 * @param {Array<{role: string, content: string|Array}>} conversation - Array of conversation messages
 * @returns {Promise<string>} The generated AI response, or empty string if generation fails
 */
async function generateAIResponse(conversation) {
  if (!conversation || conversation.length === 0) {
    logger.error('Cannot generate AI response; empty conversation provided.');
    return '';
  }

      try {
      const supportsTemp = supportsCustomTemperature(modelName);
      
      let messages = [...conversation];
      if (hasImages(conversation)) {
        messages.push({
          role: 'system',
          content: SYSTEM_MESSAGES.IMAGE_ANALYSIS
        });
      }
      
      const requestParams = {
        model: modelName,
        input: messages
      };

      const normalizedReasoningEffort = typeof reasoningEffort === 'string'
        ? reasoningEffort.trim().toLowerCase()
        : '';

      if (['low', 'medium', 'high'].includes(normalizedReasoningEffort)) {
        requestParams.reasoning = { effort: normalizedReasoningEffort };
      }

      const normalizedVerbosity = typeof responsesVerbosity === 'string'
        ? responsesVerbosity.trim().toLowerCase()
        : '';

      if (['low', 'medium', 'high'].includes(normalizedVerbosity)) {
        requestParams.text = {
          ...(requestParams.text || {}),
          verbosity: normalizedVerbosity
        };
      }

      // Let the API determine output length; no explicit max token limit is set.
      
      let temperatureValue = null;
      if (supportsCustomTemperature(modelName)) {
        const temperature = getTemperature();
        requestParams.temperature = temperature;
        temperatureValue = temperature;
      }
      
      logger.debug(`Sending conversation to OpenAI API using model: ${modelName}.`, {
        messageCount: conversation.length,
        model: modelName,
        temperature: temperatureValue,
        requestParams: requestParams
      });
    
    let response;
    try {
      response = await openai.responses.create(requestParams);
    } catch (apiError) {
      logger.error('API request failed.', {
        error: apiError.stack,
        message: apiError.message,
        model: modelName,
        statusCode: apiError.status || 'unknown'
      });
      return '';
    }

    logger.debug('Received response from OpenAI API:', {
      responseId: response.id,
      status: response.status,
      totalTokens: response.usage?.total_tokens
    });
    
    if (response.status !== 'completed') {
      logger.warn('OpenAI API response not completed:', {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }

    const reply = response.output_text || '';
    
    if (!reply || reply.trim() === '') {
      logger.warn('Response is empty.');
      return 'I apologize, but I couldn\'t generate a response. Please try again.';
    }
    
    logger.info('Generated AI response successfully:', {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      rawReply: reply
    });
    
    return reply;
  } catch (error) {
    logger.error('Error generating AI response:', {
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



module.exports = { 
  generateAIResponse
};
