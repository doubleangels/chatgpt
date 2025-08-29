const path = require('path');
const logger = require('../logger')(path.basename(__filename));
const https = require('https');
const http = require('http');

/**
 * System message constants for OpenAI API
 */
const SYSTEM_MESSAGES = {
  BASE: (modelName, visionCapability) => `You are a helpful assistant powered by the ${modelName} model. ${visionCapability} You are aware that you are using the ${modelName} model and can reference this when appropriate. 

IMPORTANT: Keep all responses concise and focused. Aim for brevity while being helpful. Avoid unnecessary elaboration or verbose explanations. Get straight to the point and provide clear, actionable information. Format your responses using Discord markdown: use ## for headers, **bold** for emphasis, *italic* for subtle emphasis, \`code\` for inline code, \`\`\`language\ncode\`\`\` for code blocks, and -# for smaller text. Use bullet points (-) and numbered lists (1.) only when they genuinely improve readability, such as for lists of items, steps, or multiple related points. Prefer natural paragraph flow for most responses. Make your responses visually appealing and well-structured, keeping responses under 1500 characters and ensuring that the title of the response is in a correct format that describes the question asked and is in title case with appropriate punctuation.`,
  VISION_CAPABILITY: {
    SUPPORTED: "You can analyze and respond to both text and images. When users send images, provide concise, focused descriptions highlighting the key elements.",
    NOT_SUPPORTED: "You can respond to text messages. Image analysis is not supported by the current model."
  },
  IMAGE_ANALYSIS: "For image analysis, provide extremely concise, focused responses. Focus only on the most important elements and answer the user's specific question directly. Avoid unnecessary details or descriptions. Keep responses brief and to the point.",
  IMAGE_DESCRIPTION_PROMPT: "Provide a brief, focused description of this image highlighting the key elements."
};

/**
 * Configuration for message splitting functionality
 * @type {Object}
 */
const MESSAGE_CONFIG = {
  defaultLimit: 2000,
  errorMessage: 'Error splitting message'
};

/**
 * Splits a message into chunks that fit within Discord's message length limit.
 * Attempts to split at intelligent break points: paragraphs, sentences, then words.
 * 
 * @param {string} text - The text to split into chunks
 * @param {number} [limit=2000] - Maximum length for each chunk
 * @returns {string[]} Array of message chunks
 */
function splitMessage(text, limit = 2000) {
  try {
    if (!text) {
      logger.debug('Empty text provided to splitMessage, returning empty array.');
      return [''];
    }
    
    if (text.length <= limit) {
      logger.debug('Text length is within limit, no splitting needed.');
      return [text];
    }
    
    logger.debug(`Splitting message of ${text.length} characters into chunks of max ${limit} characters.`);
    
    const chunks = [];
    let remainingText = text;
    
    while (remainingText.length > limit) {
      let splitPoint = findBestSplitPoint(remainingText, limit);
      
      const chunk = remainingText.substring(0, splitPoint).trim();
      chunks.push(chunk);

      remainingText = remainingText.substring(splitPoint);
      
      remainingText = remainingText.replace(/^[\s\n\r]+/, '');
      
      logger.debug(`Chunk ${chunks.length} created with ${chunk.length} characters.`);
    }
    
    if (remainingText.length > 0) {
      const finalChunk = remainingText.trim();
      if (finalChunk.length > 0) {
        chunks.push(finalChunk);
        logger.debug(`Final chunk ${chunks.length} created with ${finalChunk.length} characters.`);
      }
    }
    
    logger.info(`Message split into ${chunks.length} chunks.`, {
      originalLength: text.length,
      chunkCount: chunks.length,
      chunkSizes: chunks.map(chunk => chunk.length),
      averageChunkSize: Math.round(text.length / chunks.length)
    });
    
    return chunks;
  } catch (error) {
    logger.error('Error in splitMessage function.', { 
      error: error.stack,
      message: error.message,
      textLength: text?.length
    });
    return ['Error splitting message'];
  }
}

/**
 * Finds the best split point within the given limit, prioritizing:
 * 1. Double newlines (paragraph breaks)
 * 2. Single newlines
 * 3. Sentence endings (.!?)
 * 4. Word boundaries
 * 5. Fallback to character limit
 * 
 * @param {string} text - The text to find a split point in
 * @param {number} limit - Maximum length for the chunk
 * @returns {number} The best split point index
 */
function findBestSplitPoint(text, limit) {
  if (text.length <= limit) {
    return text.length;
  }
  
  const paragraphBreak = findLastOccurrence(text, '\n\n', limit);
  if (paragraphBreak > limit * 0.7) {
    return paragraphBreak + 2;
  }
  
  const newlineBreak = findLastOccurrence(text, '\n', limit);
  if (newlineBreak > limit * 0.8) {
    return newlineBreak + 1;
  }
  
  const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  let bestSentenceBreak = -1;
  
  for (const ending of sentenceEndings) {
    const breakPoint = findLastOccurrence(text, ending, limit);
    if (breakPoint > bestSentenceBreak && breakPoint > limit * 0.6) {
      bestSentenceBreak = breakPoint + ending.length;
    }
  }
  
  if (bestSentenceBreak > 0) {
    return bestSentenceBreak;
  }
  
  const wordBreak = findLastOccurrence(text, ' ', limit);
  if (wordBreak > limit * 0.5) {
    return wordBreak + 1;
  }
  
  return limit;
}

/**
 * Finds the last occurrence of a substring before a given position
 * 
 * @param {string} text - The text to search in
 * @param {string} searchStr - The string to search for
 * @param {number} maxPos - Maximum position to search up to
 * @returns {number} The position of the last occurrence, or -1 if not found
 */
function findLastOccurrence(text, searchStr, maxPos) {
  const searchLength = searchStr.length;
  let lastPos = -1;
  let pos = 0;
  
  while (pos < maxPos) {
    const foundPos = text.indexOf(searchStr, pos);
    if (foundPos === -1 || foundPos >= maxPos) {
      break;
    }
    lastPos = foundPos;
    pos = foundPos + searchLength;
  }
  
  return lastPos;
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
      type: 'input_text',
      text: text.trim()
    });
  }
  
  content.push(...imageContents);
  
  return content;
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
          type: 'input_image',
          image_url: base64Image
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
 * Checks if a conversation contains images.
 * 
 * @param {Array<{role: string, content: string|Array}>} conversation - Array of conversation messages
 * @returns {boolean} True if the conversation contains images
 */
function hasImages(conversation) {
  return conversation.some(message => {
    if (Array.isArray(message.content)) {
      return message.content.some(item => item.type === 'input_image');
    }
    return false;
  });
}

/**
 * Trims conversation history to maintain maximum length while preserving system message.
 * 
 * @param {Array} channelHistory - The conversation history array
 * @param {number} maxHistoryLength - Maximum number of messages to keep
 * @returns {Array} The trimmed conversation history
 */
function trimConversationHistory(channelHistory, maxHistoryLength) {
  if (channelHistory.length > maxHistoryLength + 1) {
    logger.debug(`Trimming conversation history (current: ${channelHistory.length}, max: ${maxHistoryLength + 1}).`);
    const systemMessage = channelHistory[0];
    channelHistory.splice(1, channelHistory.length - maxHistoryLength - 1);
    channelHistory[0] = systemMessage;
  }
  return channelHistory;
}

/**
 * Creates a system message for conversation initialization.
 * 
 * @param {string} modelName - The AI model name
 * @param {boolean} supportsVision - Whether the model supports vision
 * @returns {Object} The system message object
 */
function createSystemMessage(modelName, supportsVision) {
  const visionCapability = supportsVision 
    ? SYSTEM_MESSAGES.VISION_CAPABILITY.SUPPORTED
    : SYSTEM_MESSAGES.VISION_CAPABILITY.NOT_SUPPORTED;
    
  return {
    role: 'system',
    content: SYSTEM_MESSAGES.BASE(modelName, visionCapability)
  };
}

module.exports = { 
  splitMessage,
  downloadImageAsBase64,
  createMessageContent,
  processImageAttachments,
  hasImages,
  trimConversationHistory,
  createSystemMessage,
  SYSTEM_MESSAGES
};
