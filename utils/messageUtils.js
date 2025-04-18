const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Splits a message into chunks that fit within Discord's character limit.
 * Discord has a 2000 character limit per message, so longer messages need to be split.
 * 
 * @param {string} text - The message text to split.
 * @param {number} limit - Maximum characters per chunk (default: 2000).
 * @returns {Array<string>} - Array of message chunks.
 */
function splitMessage(text, limit = 2000) {
  try {
    // Return as-is if text is empty or undefined.
    if (!text) {
      logger.debug('Empty text provided to splitMessage, returning empty array.');
      return [''];
    }
    
    // Return as-is if text is within the limit.
    if (text.length <= limit) {
      logger.debug(`Text length (${text.length}) is within limit (${limit}), no splitting needed.`);
      return [text];
    }
    
    logger.debug(`Splitting message of ${text.length} characters into chunks of max ${limit} characters.`);
    
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
          logger.debug(`Chunk ${chunks.length} created with ${currentChunk.length} characters.`);
          currentChunk = line;
        } else {
          // Line itself is longer than the limit, split it.
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
        // Add line to current chunk.
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }
    
    // Add the last chunk if it's not empty.
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
    // Return an empty array on error.
    return ['Error splitting message'];
  }
}

module.exports = { splitMessage };
