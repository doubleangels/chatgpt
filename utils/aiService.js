const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path')
const logger = require('../logger')(path.basename(__filename));
const Sentry = require('../sentry');

// Initialize OpenAI client with API key from config
const openai = new OpenAI({
  apiKey: openaiApiKey
});

/**
 * Generates an AI response based on conversation history
 * Sends the conversation to OpenAI API and returns the generated response
 * 
 * @param {Array} conversation - Array of message objects in OpenAI format
 * @returns {Promise<string>} - The AI generated response text
 */
async function generateAIResponse(conversation) {
  try {
    // Log the conversation being sent (sensitive data, use debug level)
    logger.debug(`Sending conversation to OpenAI API using model: ${modelName}.`);
    
    // Make API request to OpenAI
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: conversation,
      max_tokens: 500,
      temperature: 0.7,
    });
    
    // Log successful API response
    logger.debug(`Received response from OpenAI: choices: ${response.choices?.length || 0}, completion_tokens: ${response.usage?.completion_tokens}, total_tokens: ${response.usage?.total_tokens}`);
    
    // Check if the response contains any choices
    if (!response.choices || response.choices.length === 0) {
      logger.warn('OpenAI API returned no choices in the response:', {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }
    
    // Extract the reply text from the first choice
    const reply = response.choices[0].message.content;
    logger.info(`Generated AI response (${reply.length} chars) with finish_reason: ${response.choices[0].finish_reason}`, {
      responseId: response.id,
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0].finish_reason
    });
    return reply;
  } catch (error) {
    // Log and track errors
    logger.error(`Error generating AI response: ${error.message}`, {
      error: error.stack,
      model: modelName,
      errorType: error.type,
      errorCode: error.code,
      statusCode: error.status
    });
    Sentry.captureException(error, {
      extra: {
        context: 'generateAIResponse',
        conversationLength: conversation?.length,
        model: modelName,
        errorDetails: {
          type: error.type,
          code: error.code,
          status: error.status
        }
      }
    });
    return '';
  }
}

module.exports = { generateAIResponse };