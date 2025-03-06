const path = require('path');
const logger = require('../logger')(path.basename(__filename));

/**
 * Splits a message into chunks that fit within Discord's character limit.
 * Discord has a 2000 character limit per message, so longer messages need to be split.
 * 
 * @param {string} text - The message text to split.
 * @param {number} [limit=2000] - Maximum characters per chunk (default: 2000).
 * @returns {Array<string>} - Array of message chunks.
 */
function splitMessage(text, limit = 2000) {
  // Return as-is if text is empty or within the limit
  if (!text) {
    logger.debug('Empty text provided to splitMessage, returning empty array.');
    return [text];
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
  
  // Process each line and add to chunks as needed
  for (const line of lines) {
    lineCount++;
    
    if (currentChunk.length + line.length + 1 > limit) {
      if (currentChunk) {
        // Current chunk is full, push it and start a new one
        chunks.push(currentChunk);
        logger.debug(`Chunk ${chunks.length} created with ${currentChunk.length} characters.`);
        currentChunk = line;
      } else {
        // Line itself is longer than the limit, split it
        logger.debug(`Line ${lineCount} exceeds limit (${line.length} chars), splitting line itself.`);
        let remainingLine = line;
        while (remainingLine.length > limit) {
          chunks.push(remainingLine.substring(0, limit));
          logger.debug(`Created chunk ${chunks.length} by splitting long line.`);
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
  if (currentChunk) {
    chunks.push(currentChunk);
    logger.debug(`Final chunk ${chunks.length} created with ${currentChunk.length} characters.`);
  }
  
  logger.info(`Message split into ${chunks.length} chunks:`, {
    originalLength: text.length,
    chunkCount: chunks.length,
    chunkSizes: chunks.map(chunk => chunk.length),
    averageChunkSize: Math.round(text.length / chunks.length)
  });
  
  return chunks;
}

/**
 * Formats AI responses in Discord-compatible markdown.
 * This function applies various markdown styles to the response text
 * to ensure proper formatting in Discord messages.
 * 
 * @param {string} response - The AI response text to format.
 * @returns {string} - The formatted response text.
 */
function formatResponseForDiscord(response) {
  // Format bold text
  response = response.replace(/(\*\*|__)(.*?)\1/g, '**$2**');
  // Format italic text
  response = response.replace(/(\*|_)(.*?)\1/g, '*$2*');
  // Format underline text
  response = response.replace(/(_)(.*?)\1/g, '*$2*');
  // Format strikethrough text
  response = response.replace(/~~(.*?)~~/g, '~~$1~~');
  // Format inline code
  response = response.replace(/`([^`]+)`/g, '`$1`');
  // Format code blocks
  response = response.replace(/```([\s\S]*?)```/g, '```\n$1\n```');
  // Format blockquotes
  response = response.replace(/(^|\n)>(.*?)($|\n)/g, '\n> $2\n');
  // Format unordered lists
  response = response.replace(/(^|\n)([\*\-\+]) (.*?)(?=\n|$)/g, '$1- $3');
  // Format ordered lists
  response = response.replace(/(^|\n)(\d+)\. (.*?)(?=\n|$)/g, '$1$2. $3');
  // Format links
  response = response.replace(/\[(.*?)\]\((.*?)\)/g, '[$1]($2)');
  
  return response;
}

module.exports = { splitMessage, formatResponseForDiscord };
