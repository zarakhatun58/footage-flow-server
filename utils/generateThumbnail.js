import ffmpeg from "fluent-ffmpeg";
import path from "path";

/**
 * Extracts a thumbnail from a video
 * @param {string} videoPath - Full path to the video file
 * @param {string} outputPath - Full path to save the thumbnail (e.g., /uploads/thumb-123.jpg)
 * @param {number} [seconds=1] - The time in seconds from which to grab the frame
 * @returns {Promise<void>}
 */
export const generateThumbnail = (videoPath, outputPath, seconds = 1) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on("end", () => {
        console.log(`✅ Thumbnail saved at ${outputPath}`);
        resolve();
      })
      .on("error", (err) => {
        console.error("❌ Thumbnail generation failed:", err);
        reject(err);
      })
      .screenshots({
        timestamps: [seconds],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "640x?"
      });
  });
};
