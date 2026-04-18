/**
 * Validates a word against a theme using the Datamuse API.
 * Uses 'means like' (ml) to check semantic relationship.
 */
async function isWordRelatedToTheme(word, theme) {
  if (theme === 'none') return true;

  try {
    const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(theme)}&sp=${encodeURIComponent(word)}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[DynamicValidator] API error: ${response.status}`);
      return false;
    }

    const data = await response.json();
    
    // If the word appears in the results with a decent score, it's related.
    // Datamuse 'ml' query with 'sp' filler usually returns the word itself if it matches.
    const match = data.find(item => item.word.toLowerCase() === word.toLowerCase());
    
    // A score of > 1000 is generally a strong relationship for 'ml'
    return match && (match.score > 1000);
  } catch (error) {
    console.error('[DynamicValidator] Fetch failed:', error);
    return false; // Fallback to false on error (will be supplemented by local sets)
  }
}

module.exports = { isWordRelatedToTheme };
