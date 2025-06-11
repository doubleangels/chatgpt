/**
 * @fileoverview Utility functions for handling Discord message formatting and splitting
 */

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
const LOG_WITHIN_LIMIT = 'Text length (%d) is within limit (%d), no splitting needed.';
const LOG_SPLITTING_MESSAGE = 'Splitting message of %d characters into chunks of max %d characters.';
const LOG_CHUNK_CREATED = 'Chunk %d created with %d characters.';
const LOG_LINE_EXCEEDS_LIMIT = 'Line %d exceeds limit (%d chars), splitting line itself.';
const LOG_CHUNK_FROM_LINE = 'Created chunk %d by splitting long line (%d chars).';
const LOG_FINAL_CHUNK = 'Final chunk %d created with %d characters.';
const LOG_SPLIT_COMPLETE = 'Message split into %d chunks.';
const LOG_SPLIT_ERROR = 'Error in splitMessage function.';

/**
 * Splits a message into chunks that fit within Discord's message length limit.
 * Attempts to split on newlines when possible, but will split mid-line if necessary.
 * 
 * @param {string} text - The text to split into chunks
 * @param {number} [limit=MESSAGE_CONFIG.defaultLimit] - Maximum length for each chunk
 * @returns {string[]} Array of message chunks
 */
function splitMessage(text, limit = MESSAGE_CONFIG.defaultLimit) {
  try {
    if (!text) {
      logger.debug(LOG_EMPTY_TEXT);
      return [''];
    }
    
    if (text.length <= limit) {
      logger.debug(LOG_WITHIN_LIMIT, text.length, limit);
      return [text];
    }
    
    logger.debug(LOG_SPLITTING_MESSAGE, text.length, limit);
    
    const chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let lineCount = 0;
    
    for (const line of lines) {
      lineCount++;
      
      if (currentChunk.length + line.length + 1 > limit) {
        if (currentChunk) {
          chunks.push(currentChunk);
          logger.debug(LOG_CHUNK_CREATED, chunks.length, currentChunk.length);
          currentChunk = line;
        } else {
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
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
    
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
    return [MESSAGE_CONFIG.errorMessage];
  }
}

module.exports = { splitMessage };
