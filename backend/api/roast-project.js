// api/roast-project.js
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { projectDescription, projectLink, roastLevel } = req.body;

    if (!projectDescription || !projectLink) {
      return res.status(400).json({ error: "Both project description and project link are required." });
    }

    let systemPrompt = "You are an expert at reviewing and roasting project ideas.";
    if (roastLevel === "spicy") {
      systemPrompt = "You are a brutally honest expert at roasting project ideas.";
    } else if (roastLevel === "extra_burn") {
      systemPrompt = "You are a savage expert at roasting project ideas with maximum intensity.";
    }
    
    const userPrompt = `Roast this project idea harshly. Your response must follow this exact JSON format with the following fields:
    
    {
      "roast": "A brutal overall roast (3-5 sentences max) highlighting the major flaws",
      "rating": "A rating out of 10",
      "keyIssues": ["Issue 1", "Issue 2", "Issue 3"],
      "actionItems": ["Action 1", "Action 2", "Action 3"]
    }
    
    Provide exactly 3 key issues and 3 action items. Keep your roast under 150 words. Be direct and savage.
    
    Project Description: ${projectDescription}
    Project Link: ${projectLink}`;

    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: "google/gemini-2.0-flash-lite-preview-02-05:free",
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
      formattedResponse.title = "Project Roast";
    } catch (parseError) {
      // Fallback to text parsing if JSON parsing fails
      const content = response.data.choices[0].message.content;
      
      // Create a structured response
      formattedResponse = {
        title: "Project Roast",
        roast: content,
        rating: "N/A",
        keyIssues: [
          "Could not parse structured feedback",
          "Review the full roast for details",
          "Try submitting again for better results"
        ],
        actionItems: [
          "Consider the points mentioned in the roast",
          "Provide clearer project details",
          "Use the roast feedback to improve your project"
        ]
      };
    }

    return res.status(200).json(formattedResponse);
    
  } catch (error) {
    console.error("Error roasting project:", error);
    return res.status(500).json({ 
      error: "An error occurred while roasting the project."
    });
  }
};