const path = require('path');
const logger = require('../logger')(path.basename(__filename));

// Message configuration
const MESSAGE_CONFIG = {
  defaultLimit: 2000,
  errorMessage: 'Error splitting message'
};

// Log message constants
const LOG_EMPTY_TEXT = 'Empty text provided to splitMessage, returning empty array.';
const LOG_WITHIN_LIMIT = 'Text length (%d) is within limit (%d), no splitting needed.';
const LOG_SPLITTING_MESSAGE = 'Splitting message of %d characters into chunks of max %d characters.';
const LOG_CHUNK_CREATED = 'Chunk %d created with %d characters.';
const LOG_LINE_EXCEEDS_LIMIT = 'Line %d exceeds limit (%d chars), splitting line itself.';
const LOG_CHUNK_FROM_LINE = 'Created chunk %d by splitting long line (%d chars).';
const LOG_FINAL_CHUNK = 'Final chunk %d created with %d characters.';
const LOG_SPLIT_COMPLETE = 'Message split into %d chunks.';
const LOG_SPLIT_ERROR = 'Error in splitMessage function.';

/**
 * Splits a message into chunks that fit within Discord's character limit.
 * Discord has a 2000 character limit per message, so longer messages need to be split.
 * 
 * @param {string} text - The message text to split.
 * @param {number} limit - Maximum characters per chunk (default: 2000).
 * @returns {Array<string>} - Array of message chunks.
 */
function splitMessage(text, limit = MESSAGE_CONFIG.defaultLimit) {
  try {
    // Return as-is if text is empty or undefined.
    if (!text) {
      logger.debug(LOG_EMPTY_TEXT);
      return [''];
    }
    
    // Return as-is if text is within the limit.
    if (text.length <= limit) {
      logger.debug(LOG_WITHIN_LIMIT, text.length, limit);
      return [text];
    }
    
    logger.debug(LOG_SPLITTING_MESSAGE, text.length, limit);
    
    const chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let lineCount = 0;
    
    // Process each line and add to chunks as needed.
    for (const line of lines) {
      lineCount++;
      
      // Check if adding this line would exceed the limit.
      if (currentChunk.length + line.length + 1 > limit) {
        if (currentChunk) {
          // Current chunk is full, push it and start a new one.
          chunks.push(currentChunk);
          logger.debug(LOG_CHUNK_CREATED, chunks.length, currentChunk.length);
          currentChunk = line;
        } else {
          // Line itself is longer than the limit, split it.
          logger.debug(LOG_LINE_EXCEEDS_LIMIT, lineCount, line.length);
          let remainingLine = line;
          while (remainingLine.length > limit) {
            const chunkContent = remainingLine.substring(0, limit);
            chunks.push(chunkContent);
            logger.debug(LOG_CHUNK_FROM_LINE, chunks.length, chunkContent.length);
            remainingLine = remainingLine.substring(limit);
          }
          currentChunk = remainingLine.length > 0 ? remainingLine : '';
        }
      } else {
        // Add line to current chunk.
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
    
    // Add the last chunk if it's not empty.
    if (currentChunk) {
      chunks.push(currentChunk);
      logger.debug(LOG_FINAL_CHUNK, chunks.length, currentChunk.length);
    }
    
    logger.info(LOG_SPLIT_COMPLETE, chunks.length, {
      originalLength: text.length,
      chunkCount: chunks.length,
      chunkSizes: chunks.map(chunk => chunk.length),
      averageChunkSize: Math.round(text.length / chunks.length)
    });
    
    return chunks;
  } catch (error) {
    logger.error(LOG_SPLIT_ERROR, { 
      error: error.stack,
      message: error.message,
      textLength: text?.length
    });
    // Return an empty array on error.
    return [MESSAGE_CONFIG.errorMessage];
  }
}

module.exports = { splitMessage };
