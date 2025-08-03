// controllers/FileController.js
import File from '../models/File.js';
import { v4 as uuidv4 } from 'uuid';

const formatFileSize = (bytes) => {
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

export const FileUpload = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const fileDocs = [];

    for (const file of req.files) {
      let transcription = '';
      let duration = '';
      let tags = [];
      let title = '';

      if (file.mimetype.startsWith('video/')) {
        duration = await transcriptionService.getVideoDuration(file.path);
        transcription = await transcriptionService.transcribeVideo(file.path);
        const labels = await transcriptionService.getLabelsAndSubtitle(transcription);
        tags = labels.labels?.split('\n') || [];
        title = labels.subtitle;
      } else if (file.mimetype.startsWith('image/')) {
        duration = 'N/A';
        transcription = await huggingFaceService.getImageCaption(file.path);
        const labels = await transcriptionService.getLabelsAndSubtitle(transcription);
        tags = labels.labels?.split('\n') || [];
        title = labels.subtitle;
      }

      const doc = await File.create({
        _id: uuidv4(),
        user_id: req.user?._id,
        title,
        file_size: formatFileSize(file.size),
        file_type: file.mimetype.startsWith('video/') ? 'video' : 'image',
        duration,
        transcription,
        tags,
        thumbnail_path: `/uploads/${file.filename}`,
        processing_status: 'completed'
      });

      fileDocs.push(doc);
    }

    return res.status(200).json({ message: 'Upload successful', files: fileDocs });
  } catch (err) {
    console.error('Upload failed:', err);
    return res.status(500).json({ error: err.message || 'Upload error' });
  }
};

export const getFiles = async (req, res) => {
  try {
    const files = await File.find({ user_id: req.user._id }).sort({ created_at: -1 });
    return res.status(200).json({ files });
  } catch (err) {
    console.error('Get files failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
