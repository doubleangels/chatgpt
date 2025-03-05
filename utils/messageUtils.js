const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../logger')('messageUtils.js');
const Sentry = require('../sentry');

// Precompiled regex pattern for detecting Tenor and Giphy URLs
const TENOR_GIPHY_PATTERN = /https?:\/\/(?:tenor\.com|giphy\.com)\/\S+/g;

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

/**
 * Extracts the direct GIF URL from a Tenor or Giphy link
 * Uses web scraping to extract the og:image meta tag from the page
 * 
 * @param {string} url - The Tenor or Giphy URL
 * @returns {Promise<string|null>} - The direct GIF URL or null if not found
 */
async function extractDirectGifUrl(url) {
  try {
    logger.debug(`Attempting to extract direct GIF URL from: ${url}`);
    
    // Fetch the HTML content of the page
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Look for the og:image meta tag
    const ogImage = $('meta[property="og:image"]').attr('content');
    
    if (ogImage) {
      logger.debug(`Successfully extracted OG image URL: ${ogImage}`);
      return ogImage;
    }
    
    logger.warn(`No og:image meta tag found for URL: ${url}`);
    return null;
  } catch (error) {
    // Log and track errors
    logger.error(`Error extracting GIF URL from ${url}: ${error.message}`);
    Sentry.captureException(error, {
      extra: {
        context: 'extractDirectGifUrl',
        url: url
      }
    });
    return null;
  }
}

/**
 * Processes a message to find and extract GIF URLs
 * Searches for Tenor/Giphy links and extracts the direct GIF URLs
 * 
 * @param {string} content - The message content
 * @returns {Promise<Array<string>>} - Array of direct GIF URLs
 */
async function processGifUrls(content) {
  const gifUrls = [];
  
  // Skip processing if content is empty
  if (!content) return gifUrls;
  
  // Find all Tenor/Giphy URLs in the content
  const matches = content.match(TENOR_GIPHY_PATTERN);
  
  if (matches) {
    logger.info(`Found ${matches.length} potential GIF URLs in message`);
    
    // Process each URL to extract the direct GIF URL
    for (const url of matches) {
      const directUrl = await extractDirectGifUrl(url);
      if (directUrl) {
        gifUrls.push(directUrl);
        logger.debug(`Added direct GIF URL: ${directUrl}`);
      }
    }
  }
  
  logger.info(`Processed ${matches?.length || 0} GIF URLs, extracted ${gifUrls.length} direct URLs`);
  return gifUrls;
}

module.exports = {
  splitMessage,
  processGifUrls,
  TENOR_GIPHY_PATTERN
};
