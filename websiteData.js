// websiteData.js
// All the knowledge the chatbot will use to answer questions

const WEBSITE_KNOWLEDGE = {
  // ----- Agro Mart Government Service Routing -----
  agroMartGuide: [
    {
      id: "seeds",
      label: "Seeds",
      keywords: ["seed", "seeds", "seed distribution", "variety", "certified seed"],
      department: "BADC",
      departmentName: "Bangladesh Agricultural Development Corporation",
      officeName: "BADC Seed Distribution Desk",
      officeAddress: "Visit your nearest district or upazila agriculture service office for seed support.",
      phone: "Contact the local agriculture office",
      email: "info@badc.gov.bd",
      website: "https://badc.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Seed & Irrigation",
      services: ["Certified seed distribution", "Seed availability information", "Irrigation support referrals"],
      documents: ["NID", "Farmer registration", "Land documents", "Passport photo"],
      helpfulInfo: ["Bring your crop season details", "Ask for the nearest approved seed dealer or BADC office"]
    },
    {
      id: "soil-test",
      label: "Soil Test",
      keywords: ["soil", "soil test", "soil testing", "fertility", "nutrient"],
      department: "SRDI",
      departmentName: "Soil Resource Development Institute",
      officeName: "SRDI Soil Testing Service Desk",
      officeAddress: "Visit the nearest SRDI or district soil testing office.",
      phone: "Contact your district soil lab",
      email: "info@srdi.gov.bd",
      website: "https://srdi.portal.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Soil Lab",
      services: ["Soil testing", "Fertilizer recommendation", "Soil health guidance"],
      documents: ["NID", "Farmer registration", "Land documents", "Soil sample details"],
      helpfulInfo: ["Collect a clean soil sample before visiting", "Ask for crop-specific fertilizer advice"]
    },
    {
      id: "livestock",
      label: "Livestock",
      keywords: ["livestock", "cattle", "cow", "goat", "poultry", "veterinary"],
      department: "DLS",
      departmentName: "Department of Livestock Services",
      officeName: "DLS Veterinary and Livestock Service Office",
      officeAddress: "Visit the nearest district livestock office or veterinary hospital.",
      phone: "Contact the local livestock office",
      email: "info@dls.gov.bd",
      website: "https://dls.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Livestock Dept.",
      services: ["Veterinary support", "Vaccination guidance", "Livestock breeding advice"],
      documents: ["NID", "Farmer registration", "Animal history/records"],
      helpfulInfo: ["Mention the animal type and symptoms clearly", "Take photos if the animal is sick"]
    },
    {
      id: "fisheries",
      label: "Fisheries",
      keywords: ["fish", "fisheries", "pond", "aquaculture", "fish farming"],
      department: "DoF",
      departmentName: "Department of Fisheries",
      officeName: "DoF Fisheries Service Office",
      officeAddress: "Visit the nearest fisheries office or upazila fisheries center.",
      phone: "Contact the local fisheries office",
      email: "info@fisheries.gov.bd",
      website: "https://fisheries.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Fisheries Dept.",
      services: ["Fish farming support", "Pond management guidance", "Disease control advice"],
      documents: ["NID", "Farmer registration", "Pond ownership/lease papers"],
      helpfulInfo: ["Keep pond size and water source information ready", "Ask for local hatchery or fingerling support"]
    },
    {
      id: "loan",
      label: "Loan",
      keywords: ["loan", "credit", "finance", "agricultural loan", "subsidy"],
      department: "DAE / Partner Bank",
      departmentName: "Department of Agricultural Extension with government agricultural bank support",
      officeName: "Agricultural Loan Referral Desk",
      officeAddress: "Visit your local agriculture office or a government agricultural bank branch.",
      phone: "Contact the local agriculture office or bank branch",
      email: "Contact through official government channels",
      website: "https://dae.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Loan Information",
      services: ["Loan information", "Application guidance", "Subsidy and credit referrals"],
      documents: ["NID", "Farmer registration", "Bank account", "Land documents", "Passport photo"],
      helpfulInfo: ["Ask which scheme fits your crop and land size", "Check repayment terms before applying"]
    },
    {
      id: "machinery",
      label: "Machinery",
      keywords: ["machinery", "tractor", "power tiller", "equipment", "subsidy"],
      department: "DAE",
      departmentName: "Department of Agricultural Extension",
      officeName: "DAE Farm Machinery and Subsidy Desk",
      officeAddress: "Visit your nearest DAE office or agriculture service center.",
      phone: "Contact the local agriculture office",
      email: "info@dae.gov.bd",
      website: "https://dae.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Agriculture Extension",
      services: ["Machinery subsidy guidance", "Agricultural tool information", "Field service referrals"],
      documents: ["NID", "Farmer registration", "Land documents"],
      helpfulInfo: ["Ask about seasonal subsidy windows", "Keep your land and crop details ready"]
    },
    {
      id: "crop-disease",
      label: "Crop Disease",
      keywords: ["crop disease", "disease", "blight", "pest", "fungus", "insect"],
      department: "DAE",
      departmentName: "Department of Agricultural Extension",
      officeName: "DAE Plant Protection / Field Officer Desk",
      officeAddress: "Visit the nearest DAE office or agriculture field office.",
      phone: "Contact the local agriculture office",
      email: "info@dae.gov.bd",
      website: "https://dae.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Crop Disease Control",
      services: ["Disease diagnosis", "Pest control guidance", "Field officer support"],
      documents: ["NID", "Farmer registration", "Crop photos", "Land documents"],
      helpfulInfo: ["Bring clear photos of affected leaves/fruits", "Note the crop variety and field age"]
    },
    {
      id: "storage",
      label: "Storage",
      keywords: ["storage", "warehouse", "godown", "cold storage", "post-harvest"],
      department: "BADC / DAE",
      departmentName: "Bangladesh Agricultural Development Corporation and Department of Agricultural Extension",
      officeName: "Post-Harvest Storage Support Desk",
      officeAddress: "Visit your local agriculture office for storage and warehousing guidance.",
      phone: "Contact the local agriculture office",
      email: "info@badc.gov.bd",
      website: "https://badc.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Storage & Logistics",
      services: ["Storage facility information", "Post-harvest support", "Warehouse referrals"],
      documents: ["NID", "Farmer registration", "Land documents", "Production records"],
      helpfulInfo: ["Ask about moisture control and safe storage duration"]
    },
    {
      id: "disaster",
      label: "Disaster",
      keywords: ["disaster", "flood", "cyclone", "storm", "drought", "emergency"],
      department: "DAE / Disaster Management",
      departmentName: "Department of Agricultural Extension with disaster response support",
      officeName: "Agricultural Disaster Support Desk",
      officeAddress: "Visit your nearest agriculture office or local disaster management office.",
      phone: "Contact local emergency support lines",
      email: "Contact through official government channels",
      website: "https://dae.gov.bd/",
      officeHours: "24/7 for emergencies; office support during government hours",
      responsibleDepartment: "Disaster Support",
      services: ["Emergency crop support", "Damage reporting guidance", "Recovery referrals"],
      documents: ["NID", "Farmer registration", "Damage photos", "Land documents"],
      helpfulInfo: ["Report damage as soon as possible", "Keep photos and dates of the incident"]
    },
    {
      id: "training",
      label: "Training",
      keywords: ["training", "workshop", "learning", "skill", "demo", "education"],
      department: "DAE",
      departmentName: "Department of Agricultural Extension",
      officeName: "DAE Training and Extension Center",
      officeAddress: "Visit the nearest DAE office or training center.",
      phone: "Contact the local agriculture office",
      email: "info@dae.gov.bd",
      website: "https://dae.gov.bd/",
      officeHours: "Sunday to Thursday, 9:00 AM - 5:00 PM",
      responsibleDepartment: "Training",
      services: ["Government training", "Farmer workshops", "Field demonstrations"],
      documents: ["NID", "Farmer registration", "Passport photo"],
      helpfulInfo: ["Ask about seasonal training schedules", "Register early for limited-seat sessions"]
    }
  ],

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