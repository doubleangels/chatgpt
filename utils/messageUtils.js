/**
 * @fileoverview Utility functions for handling Discord message formatting and splitting
 */

const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Splits a message into chunks that fit within Discord's message length limit
 * Preserves line breaks and tries to split at natural boundaries
 * @param {string} text - The text to split into chunks
 * @param {number} [limit=2000] - Maximum length of each chunk (Discord's limit is 2000)
 * @returns {string[]} Array of message chunks
 */
function splitMessage(text, limit = 2000) {
  try {
    if (!text) {
      logger.debug('Empty text provided to splitMessage, returning empty array.');
      return [''];
    }
    
    if (text.length <= limit) {
      logger.debug(`Text length (${text.length}) is within limit (${limit}), no splitting needed.`);
      return [text];
    }
    
    logger.debug(`Splitting message of ${text.length} characters into chunks of max ${limit} characters.`);
    
    const chunks = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let lineCount = 0;
    
    // Process each line of the message
    for (const line of lines) {
      lineCount++;
      
      // Check if adding this line would exceed the limit
      if (currentChunk.length + line.length + 1 > limit) {
        if (currentChunk) {
          // Save current chunk and start a new one
          chunks.push(currentChunk);
          logger.debug(`Chunk ${chunks.length} created with ${currentChunk.length} characters.`);
          currentChunk = line;
        } else {
          // If a single line is too long, split it
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
        // Add line to current chunk
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
    
    // Add any remaining text as the final chunk
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
    logger.error("Error in splitMessage function.", { 
      error: error.stack,
      message: error.message,
      textLength: text?.length
    });
    return ['Error splitting message'];
  }
}

module.exports = { splitMessage };
