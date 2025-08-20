const path = require('path');
const logger = require('../logger')(path.basename(__filename));

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
      
      // Remove the split portion and trim any leading whitespace/newlines
      remainingText = remainingText.substring(splitPoint);
      
      // Remove leading whitespace, newlines, and blank lines from remaining text
      remainingText = remainingText.replace(/^[\s\n\r]+/, '');
      
      logger.debug(`Chunk ${chunks.length} created with ${chunk.length} characters.`);
    }
    
    if (remainingText.length > 0) {
      // Trim the final chunk as well to ensure consistency
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

module.exports = { splitMessage };
