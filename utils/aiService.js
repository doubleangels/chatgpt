const { OpenAI } = require('openai');
const { openaiApiKey, modelName } = require('../config');
const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const https = require('https');
const http = require('http');

/**
 * Determines the correct token parameter name based on the model.
 * GPT-5 models use 'max_completion_tokens' while older models use 'max_tokens'.
 * 
 * @param {string} model - The model name
 * @returns {string} The correct parameter name
 */
function getTokenParameterName(model) {
  if (model.startsWith('gpt-5')) {
    return 'max_completion_tokens';
  }
  return 'max_tokens';
}

/**
 * Determines if the model supports custom temperature values.
 * Some models like gpt-5-nano only support the default temperature value.
 * 
 * @param {string} model - The model name
 * @returns {boolean} True if the model supports custom temperature
 */
function supportsCustomTemperature(model) {
  if (model === 'gpt-5-nano' || model === 'gpt-5-micro') {
    return false;
  }
  return true;
}

/**
 * OpenAI client instance configured with API key
 * @type {OpenAI}
 */
const openai = new OpenAI({
  apiKey: openaiApiKey
});

/**
 * Checks if a conversation contains images.
 * 
 * @param {Array<{role: string, content: string|Array}>} conversation - Array of conversation messages
 * @returns {boolean} True if the conversation contains images
 */
function hasImages(conversation) {
  return conversation.some(message => {
    if (Array.isArray(message.content)) {
      return message.content.some(item => item.type === 'image_url');
    }
    return false;
  });
}

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
      const tokenParam = getTokenParameterName(modelName);
      const supportsTemp = supportsCustomTemperature(modelName);
      
      let messages = [...conversation];
      if (hasImages(conversation)) {
        messages.push({
          role: 'system',
          content: 'For image analysis, provide concise, focused responses. Focus on the most important elements and answer the user\'s specific question rather than providing exhaustive details.'
        });
      }
      
      const requestParams = {
        model: modelName,
        messages: messages
      };
      
      let temperatureValue = null;
      if (supportsCustomTemperature(modelName)) {
        requestParams.temperature = 0.7;
        temperatureValue = 0.7;
      }
      
      logger.debug(`Sending conversation to OpenAI API using model: ${modelName}.`, {
        messageCount: conversation.length,
        model: modelName,
        temperature: temperatureValue,
        requestParams: requestParams
      });
    
    let response;
    try {
      response = await openai.chat.completions.create(requestParams);
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
    const finishReason = response.choices[0].finish_reason;
    
    if (!reply || reply.trim() === '') {
      logger.warn('Response is empty.');
      return 'I apologize, but I couldn\'t generate a response. Please try again.';
    }
    
    logger.info('Generated AI response successfully:', {
      responseId: response.id,
      charCount: reply.length,
      tokensUsed: response.usage?.total_tokens,
      finishReason: finishReason,
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

/**
 * Downloads an image from a URL and converts it to base64.
 * 
 * @param {string} url - The URL of the image to download
 * @returns {Promise<string>} Base64 encoded image data with mime type
 */
async function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const mimeType = response.headers['content-type'] || 'image/jpeg';
        const base64 = buffer.toString('base64');
        resolve(`data:${mimeType};base64,${base64}`);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Processes Discord attachments and converts images to base64 format for OpenAI API.
 * 
 * @param {Array} attachments - Array of Discord message attachments
 * @returns {Promise<Array>} Array of processed image content objects
 */
async function processImageAttachments(attachments) {
  const imageContents = [];
  
  for (const attachment of attachments) {
    const isImage = attachment.contentType && attachment.contentType.startsWith('image/');
    
    if (isImage) {
      try {
        logger.debug(`Processing image attachment: ${attachment.filename} (${attachment.contentType})`);
        const base64Image = await downloadImageAsBase64(attachment.url);
        
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: base64Image
          }
        });
        
        logger.debug(`Successfully processed image: ${attachment.filename}`);
      } catch (error) {
        logger.error(`Failed to process image attachment: ${attachment.filename}`, {
          error: error.stack,
          message: error.message
        });
      }
    }
  }
  
  return imageContents;
}

/**
 * Creates a message content array that can include both text and images.
 * 
 * @param {string} text - The text content
 * @param {Array} imageContents - Array of image content objects
 * @returns {Array} Message content array for OpenAI API
 */
function createMessageContent(text, imageContents = []) {
  const content = [];
  
  if (text && text.trim()) {
    content.push({
      type: 'text',
      text: text.trim()
    });
  }
  
  content.push(...imageContents);
  
  return content;
}

module.exports = { 
  generateAIResponse, 
  processImageAttachments, 
  createMessageContent,
  hasImages
};
