import Media from "../models/Media.js";


export const getAllFiles = async (req, res) => {
  try {
    // Fetch all media, sorted by rankScore (highest ranked first)
    const mediaFiles = await Media.find().sort({ rankScore: -1 });

    const results = mediaFiles.map((file) => ({
      id: file._id,
      title: file.filename,
      file_type: file.mediaType,
      thumbnail_path: file.filename, // or customize path
      transcription: file.transcript,
      tags: file.tags || [],
      emotions: file.emotions || [],
      likes: file.likes || 0,
      shares: file.shares || 0,
      rankScore: file.rankScore || 0,
      createdAt: file.createdAt
    }));

    res.status(200).json({ success: true, files: results });
  } catch (error) {
    console.error('❌ Error fetching files:', error.message);
    res.status(500).json({ error: 'Failed to load files' });
  }
};
