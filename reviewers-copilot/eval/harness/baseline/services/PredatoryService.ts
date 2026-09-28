import predatoryData from '../vendors/predatoryList.json';

// Normalize string for better matching (lowercase, remove punctuation, extra spaces)
const normalize = (str: string): string => {
    return str.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
};

const publishers = predatoryData.publishers.map(normalize);
const journals = predatoryData.journals.map(normalize);

/**
 * Check if a given journal name or publisher matches the predatory list
 * @param name The name of the journal or publisher
 * @returns boolean True if found in the predatory list
 */
export const isPredatory = (name?: string): boolean => {
    if (!name) return false;
    const normalizedName = normalize(name);
    
    // Check for exact matches or if the input string contains the predatory name
    // (e.g. if name is "OMICS Publishing Group Ltd", it should match "OMICS Publishing Group")
    
    const isPredatoryPublisher = publishers.some(p => normalizedName.includes(p));
    if (isPredatoryPublisher) return true;
    
    const isPredatoryJournal = journals.some(j => normalizedName.includes(j));
    return isPredatoryJournal;
};
