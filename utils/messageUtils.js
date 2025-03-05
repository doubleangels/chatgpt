const logger = require('../logger')('messageUtils.js');

/**
 * Splits a message into chunks that fit within Discord's character limit
 * Discord has a 2000 character limit per message, so longer messages need to be split
 * 
 * @param {string} text - The message text to split
 * @param {number} limit - Maximum characters per chunk (default: 2000)
 * @returns {Array<string>} - Array of message chunks
 */
function splitMessage(text, limit = 2000) {
  // Return as-is if text is empty or within the limit
  if (!text || text.length <= limit) return [text];
  
  logger.debug(`Splitting message of ${text.length} characters into chunks of max ${limit} characters`);
  
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  
  // Process each line and add to chunks as needed
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > limit) {
      if (currentChunk) {
        // Current chunk is full, push it and start a new one
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        // Line itself is longer than the limit, split it
        let remainingLine = line;
        while (remainingLine.length > limit) {
          chunks.push(remainingLine.substring(0, limit));
          remainingLine = remainingLine.substring(limit);
        }
        currentChunk = remainingLine;
      }
    } else {
      // Add line to current chunk
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk) chunks.push(currentChunk);
  
  logger.debug(`Message split into ${chunks.length} chunks`);
  return chunks;
}

module.exports = { splitMessage };
