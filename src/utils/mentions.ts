/**
 * Mention detection utilities for XMTP agent
 * Allows the agent to only respond in groups when mentioned
 */

// Get mention handles from environment or use defaults
const getMentionHandles = (): string[] => {
  const envHandles = process.env.MENTION_HANDLES;
  if (envHandles) {
    return envHandles.split(',').map((h) => h.trim()).filter(Boolean);
  }
  // Default handles
  return ['song.base.eth', 'songcast', 'song'];
};

// Create regex for detecting mentions
const createMentionRegex = (): RegExp => {
  const mentionAlternatives = getMentionHandles()
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special regex chars
    .join('|');
  return new RegExp(`(^|\\s)@\\s*(?:${mentionAlternatives})\\b`, 'i');
};

const mentionRegex = createMentionRegex();

/**
 * Check if a message mentions the agent
 */
export const isMentioned = (text: string): boolean => {
  if (!text) return false;
  return mentionRegex.test(text);
};

/**
 * Remove mention from text content
 */
export const removeMention = (text: string): string => {
  if (!text) return text;
  return text.replace(mentionRegex, ' ').trim();
};

/**
 * Get the list of mention handles
 */
export const getMentions = (): string[] => {
  return getMentionHandles();
};

