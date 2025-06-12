const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Configuration for message splitting functionality
 * @type {Object}
 */
const MESSAGE_CONFIG = {
  defaultLimit: 2000,  // Discord's maximum message length
  errorMessage: 'Error splitting message'
};

// Log message constants
const LOG_EMPTY_TEXT = 'Empty text provided to splitMessage, returning empty array.';
const LOG_WITHIN_LIMIT = 'Text length is within limit, no splitting needed.';
const LOG_SPLITTING_MESSAGE = 'Splitting message of ${text.length} characters into chunks of max ${limit} characters.';
const LOG_CHUNK_CREATED = 'Chunk ${chunks.length} created with ${currentChunk.length} characters.';
const LOG_LINE_EXCEEDS_LIMIT = 'Line ${lineCount} exceeds limit (${line.length} chars), splitting line itself.';
const LOG_CHUNK_FROM_LINE = 'Created chunk ${chunks.length} by splitting long line (${chunkContent.length} chars).';
const LOG_FINAL_CHUNK = 'Final chunk ${chunks.length} created with ${currentChunk.length} characters.';
const LOG_SPLIT_COMPLETE = 'Message split into ${chunks.length} chunks.';
const LOG_SPLIT_ERROR = 'Error in splitMessage function.';

/**
 * Splits a message into chunks that fit within Discord's message length limit.
 * Attempts to split on newlines when possible, but will split mid-line if necessary.
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
    const lines = text.split('\n');
    let currentChunk = '';
    let lineCount = 0;
    
    for (const line of lines) {
      lineCount++;
      
      if (currentChunk.length + line.length + 1 > limit) {
        if (currentChunk) {
          chunks.push(currentChunk);
          logger.debug(`Chunk ${chunks.length} created with ${currentChunk.length} characters.`);
          currentChunk = line;
        } else {
          logger.debug(`Line ${lineCount} exceeds limit (${line.length} chars), splitting line itself.`);
          let remainingLine = line;
          while (remainingLine.length > limit) {
            const chunkContent = remainingLine.substring(0, limit);
            chunks.push(chunkContent);
            logger.debug(`Created chunk ${chunks.length} by splitting long line (${chunkContent.length} chars).`);
            remainingLine = remainingLine.substring(limit);
          }
          currentChunk = remainingLine.length > 0 ? remainingLine : '';
        }
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
      logger.debug(`Final chunk ${chunks.length} created with ${currentChunk.length} characters.`);
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

module.exports = { splitMessage };
