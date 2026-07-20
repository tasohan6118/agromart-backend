// websiteData.js
// All the knowledge the chatbot will use to answer questions

const WEBSITE_KNOWLEDGE = {
  // ----- Government Schemes (from your report) -----
  schemes: [
    { 
      name: "PM Kisan Samman Nidhi", 
      benefit: "6,000 per year sent directly to bank accounts", 
      eligibility: "All small and marginal farmers" 
    },
    { 
      name: "Soil Health Card Scheme", 
      benefit: "Free soil testing and nutrient recommendations", 
      eligibility: "All farmers" 
    },
    { 
      name: "Pradhan Mantri Fasal Bima Yojana", 
      benefit: "Crop insurance against natural calamities", 
      eligibility: "Farmers availing crop loans" 
    },
    { 
      name: "E-NAM (National Agriculture Market)", 
      benefit: "Online trading platform for farm produce", 
      eligibility: "All farmers and traders" 
    }
  ],

  // ----- Crop Calendar (from your report) -----
  cropCalendar: [
    { crop: "Wheat", sowing: "November - December", harvesting: "March - April" },
    { crop: "Rice (Kharif)", sowing: "June - July", harvesting: "October - November" },
    { crop: "Sugarcane", sowing: "February - March", harvesting: "December - January" },
    { crop: "Cotton", sowing: "April - May", harvesting: "October - December" },
    { crop: "Mustard", sowing: "October - November", harvesting: "February - March" }
  ],

  // ----- Market Prices (from your report) -----
  marketPrices: [
    { item: "Wheat", price: "₹2,400 per quintal" },
    { item: "Rice", price: "₹2,200 per quintal" },
    { item: "Tomatoes", price: "₹30 per kg" },
    { item: "Potatoes", price: "₹20 per kg" },
    { item: "Sugarcane", price: "₹3,800 per quintal" },
    { item: "Cotton", price: "₹7,500 per quintal" }
  ],

  // ----- PROJECT INFORMATION (from your full Defense Report) -----
  projectInfo: {
    name: "Agro Mart - Sustainable Agricultural Solution Platform",
    overview: "Agro Mart is a web-based platform that aims to promote sustainable agriculture by connecting farmers directly with buyers, eliminating middlemen, and providing modern agricultural features. It educates farmers about modern techniques, smart irrigation, weather forecasting, AI-based crop planning, and community support. The platform also enables farmers to sell their products at fair market prices and customers to buy fresh produce without middleman intervention.",
    
    background: "The project was developed to address the challenges of climate change, water scarcity, and the middleman problem in Bangladesh. Farmers often sell products at very low prices while customers in cities pay 10–15 times higher due to intermediaries. Agro Mart provides a direct marketplace and modern tools to improve productivity and profitability.",
    
    objectives: [
      "Develop modern agricultural environments through software.",
      "Educate rural farmers about modern software and machinery.",
      "Provide a community platform for problem-solving.",
      "Eliminate middlemen by enabling direct selling and buying at fair prices.",
      "Implement smart pricing systems and market price transparency.",
      "Integrate AI-based crop planning, weather forecasting, and a smart chatbot."
    ],
    
    features: [
      {
        name: "AI Crop Planning",
        description: "Users answer a few questions about their land, season, and preferences, and the system suggests suitable crops, optimal sowing time, estimated cost, and expected yield using AI algorithms."
      },
      {
        name: "Weather Forecasting",
        description: "Displays real-time weather for 64 major districts in Bangladesh, including temperature, humidity, wind speed, and pressure, helping farmers plan their activities."
      },
      {
        name: "Daily Market Prices",
        description: "Shows the current market rates for various agricultural products across different districts. This helps both farmers and buyers negotiate fair prices without middlemen."
      },
      {
        name: "AI Assistant (Chatbot)",
        description: "A conversational AI that answers questions about the website's content, including schemes, crop calendar, market prices, and project details. It provides instant support and guidance."
      },
      {
        name: "Community Support",
        description: "A forum where farmers can post questions, share experiences, and get answers from other community members. It encourages peer-to-peer learning and problem-solving."
      },
      {
        name: "Direct Marketplace",
        description: "Farmers can list their products with prices, and customers can buy directly. The system includes a shopping cart, payment, and order tracking."
      },
      {
        name: "Admin Dashboard",
        description: "Admins can monitor all activities, manage users, products, payments, and community posts. Provides analytics and insights."
      }
    ],
    
    technologyStack: {
      frontend: "React.js with Tailwind CSS, Daisy UI, Framer Motion",
      backend: "Node.js with Express, JWT authentication",
      database: "MongoDB",
      deployment: "Vercel (frontend), Supabase (backend)",
      aiIntegration: "Google Gemini API for chatbot, custom AI models for crop planning"
    },
    
    methodology: "The project followed an iterative Waterfall model with agile feedback loops. Requirements were gathered via interviews and field observations. The system was designed with a client-server architecture. Development was done in phases, with continuous testing (unit, integration, UAT). Deployment was done on Vercel and Supabase.",
    
    futureWorks: [
      "Mobile application development for iOS and Android.",
      "Real-time chat and interview scheduling between farmers and buyers.",
      "AI-based resume builder for farmers to showcase their skills.",
      "Advanced analytics with machine learning for price prediction.",
      "Multilingual support and location-based filters.",
      "Continuous security audits and performance improvements."
    ],
    
    conclusion: "Agro Mart successfully bridges the gap between farmers and consumers, promotes sustainable practices, and empowers rural farmers with modern technology. It is a scalable, secure, and user-friendly platform that has great potential for future enhancements."
  }
};

module.exports = { WEBSITE_KNOWLEDGE };