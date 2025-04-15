const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));

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
    logger.error("Cannot generate AI response: Empty conversation provided.");
    return '';
  }

  try {
    // Log the conversation being sent (sensitive data, use debug level).
    logger.debug(`Sending conversation to OpenAI API using model: ${modelName}.`, {
      messageCount: conversation.length,
      model: modelName
    });
    
    let response;
    try {
      // Make API request to OpenAI.
      response = await openai.chat.completions.create({
        model: modelName,
        messages: conversation,
        max_tokens: 500,
        temperature: 0.7,
      });
    } catch (apiError) {
      logger.error("API request failed.", {
        error: apiError.stack,
        message: apiError.message,
        model: modelName,
        statusCode: apiError.status || 'unknown'
      });
      return '';
    }

    // Log successful API response.
    logger.debug("Received response from OpenAI API.", {
      choices: response.choices?.length || 0,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      responseId: response.id
    });
    
    // Check if the response contains any choices.
    if (!response.choices || response.choices.length === 0) {
      logger.warn("OpenAI API returned no choices in the response.", {
        model: modelName,
        responseStatus: response.status,
        responseId: response.id
      });
      return '';
    }

    // Extract the reply text from the first choice.
    const reply = response.choices[0].message.content;
    logger.info("Generated AI response successfully.", {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      finishReason: response.choices[0].finish_reason
    });
    
    return reply;
  } catch (error) {
    // Log and track errors.
    logger.error("Error generating AI response.", {
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
