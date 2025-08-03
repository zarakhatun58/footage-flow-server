
export const extractTags = (text) => {
  const keywords = ['family', 'vacation', 'birthday', 'celebration', 'school', 'friends'];
  return keywords.filter((kw) => text.toLowerCase().includes(kw));
};

