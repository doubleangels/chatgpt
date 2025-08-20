const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

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
    logger.error('Cannot generate AI response; empty conversation provided.');
    return '';
  }

  try {
    logger.debug(`Sending conversation to OpenAI API using model: ${modelName}.`, {
      messageCount: conversation.length,
      model: modelName
    });
    
    let response;
    try {
      response = await openai.chat.completions.create({
        model: modelName,
        messages: conversation,
        temperature: 0.7,
      });
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
      choices: response.choices?.length || 0,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      responseId: response.id
    });
    
    if (!response.choices || response.choices.length === 0) {
      logger.warn('OpenAI API returned no choices in the response:', {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }

    const reply = response.choices[0].message.content;
    logger.info('Generated AI response successfully:', {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0].finish_reason
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

module.exports = { generateAIResponse };
