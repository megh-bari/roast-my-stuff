// api/roast-resume.js
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

// Memory storage for multer (no filesystem access needed)
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// CORS middleware handler
const corsMiddleware = cors({
  origin: [
    "http://localhost:5173",
   "https://roast-my-stuff-frontend.vercel.app",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
});

// Helper to run middleware in serverless
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

// Setup OpenRouter constants
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

module.exports = async (req, res) => {
  // Handle CORS
  await runMiddleware(req, res, corsMiddleware);

  // Only allow POST method
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Run multer to process file upload
    await runMiddleware(req, res, upload.single("resume"));

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { roastLevel } = req.body;
    let extractedText = "";
    const fileExt = req.file.originalname.split(".").pop().toLowerCase();

    if (fileExt === "pdf") {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (fileExt === "docx") {
      const data = await mammoth.extractRawText({ buffer: req.file.buffer });
      extractedText = data.value;
    } else {
      return res.status(400).json({ error: "Unsupported file format" });
    }

    let systemPrompt = "You are a professional resume reviewer.";
    if (roastLevel === "spicy") {
      systemPrompt = "You are a brutally honest resume reviewer.";
    } else if (roastLevel === "extra_burn") {
      systemPrompt = "You are a savage resume reviewer with maximum intensity.";
    }

    const userPrompt = `Roast this resume harshly. Your response must follow this exact JSON format with the following fields:
    
    {
      "roast": "A brutal overall roast (3-5 sentences max) highlighting the major flaws",
      "rating": "A rating out of 10",
      "keyIssues": ["Issue 1", "Issue 2", "Issue 3"],
      "actionItems": ["Action 1", "Action 2", "Action 3"]
    }
    
    Provide exactly 3 key issues and 3 action items. Keep your roast under 150 words. Be direct and savage.
    
    Resume Content:
    ${extractedText}`;

    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: "z-ai/glm-4.5-air:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2048,
        response_format: { type: "json_object" },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let formattedResponse;
    try {
      // Try to parse the response as JSON
      const content = response.data.choices[0].message.content;
      formattedResponse = JSON.parse(content);
      formattedResponse.title = "Resume Roast";
    } catch (parseError) {
      // Fallback to text parsing if JSON parsing fails
      const content = response.data.choices[0].message.content;

      // Create a structured response
      formattedResponse = {
        title: "Resume Roast",
        roast: content,
        rating: "N/A",
        keyIssues: [
          "Could not parse structured feedback",
          "Review the full roast for details",
          "Try submitting again for better results",
        ],
        actionItems: [
          "Consider the points mentioned in the roast",
          "Submit a clearer resume format",
          "Use the roast feedback to make improvements",
        ],
      };
    }

    return res.status(200).json(formattedResponse);
  } catch (error) {
    console.error("Error roasting resume:", error);
    return res.status(500).json({
      error: "An error occurred while processing the resume.",
    });
  }
};
