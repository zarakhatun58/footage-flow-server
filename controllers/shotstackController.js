// /controllers/shotstackController.js
import fetch from 'node-fetch';

export const generateVideoWithShotstack = async (req, res) => {
  const { images, voiceUrl } = req.body;

  const timeline = {
    background: "#000000",
    tracks: [
      {
        clips: images.map((img, i) => ({
          asset: {
            type: "image",
            src: img,
          },
          start: i * 2,
          length: 2,
          transition: { in: "fade", out: "fade" }
        }))
      },
      {
        clips: [
          {
            asset: {
              type: "audio",
              src: voiceUrl
            },
            start: 0,
            length: images.length * 2
          }
        ]
      }
    ]
  };

  const payload = {
    timeline,
    output: {
      format: "mp4",
      resolution: "sd"
    }
  };

  try {
    const response = await fetch("https://api.shotstack.io/stage/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.SHOTSTACK_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    res.status(200).json({ success: true, renderId: data.response.id });
  } catch (err) {
    console.error("❌ Shotstack error:", err.message);
    res.status(500).json({ error: "Video generation failed" });
  }
};
