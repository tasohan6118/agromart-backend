require('dotenv').config(); // Must be FIRST so env vars load before anything else

const Groq = require('groq-sdk');
const { WEBSITE_KNOWLEDGE } = require('./websiteData');

const express=require('express');
const cors=require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const SSLCommerzPayment = require('sslcommerz-lts');
const app=express();
const port= process.env.PORT || 5000;


app.use(cors({
    origin: ['http://localhost:5173', 'https://agromart-frontend-md3e0tw6q-tasohan6118s-projects.vercel.app/','https://agromart-frontend-lime.vercel.app','https://agromart-frontend-git-main-tasohan6118s-projects.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));



app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

// ==================== OTP / SMS SUPPORT ====================
// OTPs are kept in memory for this small application. For a multi-instance
// deployment, move this store to Redis so all server instances share it.
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function normalizeBangladeshPhone(value) {
    const raw = String(value || '').trim().replace(/[\s()-]/g, '');
    if (/^01[3-9][0-9]{8}$/.test(raw)) return `+880${raw.slice(1)}`;
    if (/^8801[3-9][0-9]{8}$/.test(raw)) return `+${raw}`;
    if (/^\+8801[3-9][0-9]{8}$/.test(raw)) return raw;
    return null;
}

async function sendOtpSms(to, otp) {
    const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();

    if (provider === 'console' && process.env.NODE_ENV !== 'production') {
        console.log(`🔐 Development OTP for ${to}: ${otp}`);
        return { provider: 'console' };
    }

    if (provider !== 'twilio') {
        throw new Error('SMS is not configured. Set SMS_PROVIDER=twilio and provide TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
    }

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
        throw new Error('Twilio SMS configuration is incomplete. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
    }

    const body = new URLSearchParams({
        To: to,
        From: TWILIO_FROM_NUMBER,
        Body: `Your Agromart verification code is ${otp}. It expires in 5 minutes.`
    });
    await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`,
        body.toString(),
        {
            auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        }
    );
    return { provider: 'twilio' };
}

function otpErrorMessage(error) {
    const status = error?.response?.status;
    const providerMessage = error?.response?.data?.message;
    if (status === 401 || status === 403) return 'SMS provider authentication failed. Check the Twilio account SID and auth token.';
    if (providerMessage) return `SMS provider error: ${providerMessage}`;
    return error.message || 'Unable to send OTP.';
}

app.post(['/api/send-otp', '/send-otp'], async (req, res) => {
    const phone = normalizeBangladeshPhone(req.body?.phone || req.body?.mobileNumber || req.body?.mobile);
    if (!phone) return res.status(400).json({ success: false, message: 'Enter a valid Bangladesh mobile number, for example 01619880970.' });

    const previous = otpStore.get(phone);
    if (previous && Date.now() - previous.createdAt < OTP_RESEND_COOLDOWN_MS) {
        return res.status(429).json({ success: false, message: 'Please wait 60 seconds before requesting another OTP.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    try {
        const delivery = await sendOtpSms(phone, otp);
        otpStore.set(phone, { hash: crypto.createHash('sha256').update(otp).digest('hex'), createdAt: Date.now(), attempts: 0 });
        const response = { success: true, message: 'OTP sent successfully.', expiresIn: 300, delivery: delivery.provider };
        if (delivery.provider === 'console') response.devOtp = otp;
        return res.json(response);
    } catch (error) {
        console.error('OTP delivery failed:', error.message);
        return res.status(503).json({ success: false, message: otpErrorMessage(error) });
    }
});

app.post(['/api/verify-otp', '/verify-otp'], (req, res) => {
    const phone = normalizeBangladeshPhone(req.body?.phone || req.body?.mobileNumber || req.body?.mobile);
    const otp = String(req.body?.otp || req.body?.code || '').trim();
    if (!phone || !/^\d{6}$/.test(otp)) return res.status(400).json({ success: false, message: 'Phone number and a 6-digit OTP are required.' });

    const record = otpStore.get(phone);
    if (!record || Date.now() - record.createdAt > OTP_TTL_MS) {
        otpStore.delete(phone);
        return res.status(400).json({ success: false, message: 'OTP expired. Please request a new OTP.' });
    }
    if (record.attempts >= 5) {
        otpStore.delete(phone);
        return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
    }
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    if (hash !== record.hash) {
        record.attempts += 1;
        return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
    }
    otpStore.delete(phone);
    return res.json({ success: true, message: 'OTP verified successfully.', phone });
});

if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY is missing from .env file!");
} else {
    console.log("✅ GROQ API Key loaded successfully.");
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});


// app.use(cors({
//     origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'https://agromart-frontend-4p9e1tohj-tasohan6118s-projects.vercel.app/','https://agromart-frontend-lime.vercel.app/','https://agromart-frontend-git-main-tasohan6118s-projects.vercel.app/'],
//     credentials: true,
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization']
// }));






// Serve static files from uploads directory with proper headers
app.use('/uploads', express.static(uploadsDir, {
    setHeaders: (res, path) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Origin', '*');
    }
}));

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_PASS}@cluster0.jex3ft8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ============ 365-DAY REAL MARKET SIMULATION ============

// Base reference prices for different seasons
const seasonalBasePrices = {
    'Potato': {
        'peak_harvest': { // Nov-Feb (high supply, low price)
            'Dhaka': 22, 'Chittagong': 20, 'Rajshahi': 18, 'Chapainawabganj': 16, 'Dinajpur': 19, 'default': 20
        },
        'lean_season': { // Jun-Sep (low supply, high price)
            'Dhaka': 38, 'Chittagong': 36, 'Rajshahi': 32, 'Chapainawabganj': 30, 'Dinajpur': 33, 'default': 35
        },
        'normal': { // Other months
            'Dhaka': 30, 'Chittagong': 28, 'Rajshahi': 25, 'Chapainawabganj': 23, 'Dinajpur': 26, 'default': 27
        }
    },
    'Onion': {
        'peak_harvest': {
            'Dhaka': 35, 'Chittagong': 33, 'Rajshahi': 30, 'Chapainawabganj': 28, 'Dinajpur': 29, 'default': 32
        },
        'lean_season': {
            'Dhaka': 65, 'Chittagong': 62, 'Rajshahi': 58, 'Chapainawabganj': 55, 'Dinajpur': 57, 'default': 60
        },
        'normal': {
            'Dhaka': 48, 'Chittagong': 46, 'Rajshahi': 42, 'Chapainawabganj': 40, 'Dinajpur': 41, 'default': 44
        }
    },
    'Rice': {
        'peak_harvest': {
            'Dhaka': 45, 'Chittagong': 43, 'Rajshahi': 40, 'Chapainawabganj': 38, 'Dinajpur': 39, 'default': 42
        },
        'lean_season': {
            'Dhaka': 65, 'Chittagong': 63, 'Rajshahi': 58, 'Chapainawabganj': 56, 'Dinajpur': 57, 'default': 60
        },
        'normal': {
            'Dhaka': 55, 'Chittagong': 53, 'Rajshahi': 48, 'Chapainawabganj': 46, 'Dinajpur': 47, 'default': 50
        }
    },
    'Tomato': {
        'peak_harvest': {
            'Dhaka': 20, 'Chittagong': 18, 'Rajshahi': 15, 'Chapainawabganj': 12, 'Dinajpur': 14, 'default': 16
        },
        'lean_season': {
            'Dhaka': 80, 'Chittagong': 75, 'Rajshahi': 70, 'Chapainawabganj': 65, 'Dinajpur': 68, 'default': 72
        },
        'normal': {
            'Dhaka': 40, 'Chittagong': 38, 'Rajshahi': 35, 'Chapainawabganj': 32, 'Dinajpur': 34, 'default': 36
        }
    },
    'default': {
        'peak_harvest': { 'default': 25 },
        'lean_season': { 'default': 45 },
        'normal': { 'default': 35 }
    }
};

// Real historical events that affect prices (based on Bangladesh agriculture)
const marketEvents = {
    '2024-01-15': { type: 'festival_demand', impact: 1.25, description: 'Poush Parbon increased demand' },
    '2024-02-21': { type: 'festival_demand', impact: 1.30, description: 'International Mother Language Day' },
    '2024-03-17': { type: 'festival_demand', impact: 1.20, description: 'Sheikh Mujib Birthday' },
    '2024-03-26': { type: 'festival_demand', impact: 1.15, description: 'Independence Day' },
    '2024-04-14': { type: 'festival_demand', impact: 1.40, description: 'Bengali New Year - High demand' },
    '2024-05-01': { type: 'holiday', impact: 1.10, description: 'May Day' },
    '2024-06-15': { type: 'monsoon_start', impact: 0.85, description: 'Monsoon season begins - supply chain issues' },
    '2024-08-15': { type: 'flood_risk', impact: 0.70, description: 'Flood season - production uncertainty' },
    '2024-09-06': { type: 'festival_demand', impact: 1.35, description: 'Eid-ul-Adha - High meat and vegetable demand' },
    '2024-10-03': { type: 'festival_demand', impact: 1.25, description: 'Durga Puja' },
    '2024-11-07': { type: 'festival_demand', impact: 1.20, description: 'Eid-e-Milad-un-Nabi' },
    '2024-12-16': { type: 'festival_demand', impact: 1.15, description: 'Victory Day' },
    '2024-12-25': { type: 'festival_demand', impact: 1.10, description: 'Christmas' }
};

// Weather patterns affecting agriculture
const weatherPatterns = {
    '01': { pattern: 'winter', impact: 1.15 }, // January - winter, lower production
    '02': { pattern: 'late_winter', impact: 1.10 },
    '03': { pattern: 'spring', impact: 1.00 }, // Spring - good production
    '04': { pattern: 'summer', impact: 0.95 }, // Summer - some heat stress
    '05': { pattern: 'pre_monsoon', impact: 0.90 },
    '06': { pattern: 'monsoon', impact: 0.85 }, // Monsoon - logistics issues
    '07': { pattern: 'monsoon', impact: 0.80 },
    '08': { pattern: 'monsoon', impact: 0.75 }, // Peak monsoon - flood risks
    '09': { pattern: 'post_monsoon', impact: 0.85 },
    '10': { pattern: 'autumn', impact: 0.95 }, // Autumn - good conditions
    '11': { pattern: 'late_autumn', impact: 1.05 },
    '12': { pattern: 'early_winter', impact: 1.10 } // Winter - lower supply
};

function getSeasonalPhase(date) {
    const month = date.getMonth() + 1; // 1-12
    if (month >= 11 || month <= 2) return 'peak_harvest';    // Nov-Feb
    if (month >= 6 && month <= 9) return 'lean_season';      // Jun-Sep
    return 'normal';                                         // Mar-May, Oct
}

function get365DayPrice(category, district, date) {
    const dateKey = date.toISOString().split('T')[0];
    const monthKey = date.getMonth() + 1 < 10 ? `0${date.getMonth() + 1}` : `${date.getMonth() + 1}`;
    
    // 1. Get base price for current season
    const seasonalData = seasonalBasePrices[category] || seasonalBasePrices['default'];
    const season = getSeasonalPhase(date);
    const districtData = seasonalData[season][district] || seasonalData[season]['default'];
    let price = districtData;
    
    // 2. Apply weather patterns
    const weather = weatherPatterns[monthKey];
    price *= weather.impact;
    
    // 3. Apply specific market events
    if (marketEvents[dateKey]) {
        price *= marketEvents[dateKey].impact;
    }
    
    // 4. Day-of-week effect (markets closed on Friday)
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5) { // Friday - limited market activity
        price *= 1.08; // 8% higher on Fridays
    }
    
    // 5. Realistic daily fluctuations (based on date hash for consistency)
    const dateHash = date.getTime() % 1000;
    const dailyFluctuation = 0.9 + (dateHash / 1000) * 0.2; // 10% daily variation
    price *= dailyFluctuation;
    
    return Math.round(price * 100) / 100;
}

// Get comprehensive market analysis
function getMarketAnalysis(category, district, date) {
    const currentPrice = get365DayPrice(category, district, date);
    
    // Calculate 7-day trend
    const pricesLastWeek = [];
    for (let i = 6; i >= 0; i--) {
        const pastDate = new Date(date);
        pastDate.setDate(pastDate.getDate() - i);
        pricesLastWeek.push(get365DayPrice(category, district, pastDate));
    }
    
    const trend = pricesLastWeek[6] - pricesLastWeek[0];
    const trendPercentage = ((trend / pricesLastWeek[0]) * 100).toFixed(1);
    
    return {
        currentPrice,
        trend: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
        trendAmount: Math.abs(trend).toFixed(2),
        trendPercentage: Math.abs(trendPercentage),
        weeklyHigh: Math.max(...pricesLastWeek).toFixed(2),
        weeklyLow: Math.min(...pricesLastWeek).toFixed(2)
    };
}

// Helper function to validate product data
function validateProductData(product) {
    const errors = [];
    
    if (!product.name || product.name.trim().length === 0) {
        errors.push('Product name is required');
    }
    if (!product.category || product.category.trim().length === 0) {
        errors.push('Category is required');
    }
    if (!product.price || isNaN(product.price) || product.price <= 0) {
        errors.push('Valid price is required');
    }
    if (product.offerPrice && (isNaN(product.offerPrice) || product.offerPrice < 0)) {
        errors.push('Invalid offer price');
    }
    if (!product.district || product.district.trim().length === 0) {
        errors.push('District is required');
    }
    if (!product.sellerEmail || !product.sellerEmail.includes('@')) {
        errors.push('Valid seller email is required');
    }
    
    return errors;
}


// ========== CHATBOT ROUTE ==========
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        reply: "Please enter a message.",
      });
    }

    const systemPrompt = `
You are "AgriBot", the official virtual assistant for the Agro Mart website.

Your job is to answer user questions STRICTLY based on the data provided below.

If the user asks something that is NOT in the data, politely say:

"I'm sorry, I can only answer questions about the Agro Mart project, its features, government schemes, crop calendars, and market prices shown on this website."

-----------------------
OFFICIAL WEBSITE DATA
-----------------------

Government Schemes:
${JSON.stringify(WEBSITE_KNOWLEDGE.schemes, null, 2)}

Crop Calendar:
${JSON.stringify(WEBSITE_KNOWLEDGE.cropCalendar, null, 2)}

Market Prices:
${JSON.stringify(WEBSITE_KNOWLEDGE.marketPrices, null, 2)}

Project Information:

Name:
${WEBSITE_KNOWLEDGE.projectInfo.name}

Overview:
${WEBSITE_KNOWLEDGE.projectInfo.overview}

Background:
${WEBSITE_KNOWLEDGE.projectInfo.background}

Objectives:
${WEBSITE_KNOWLEDGE.projectInfo.objectives.join(", ")}

Features:
${WEBSITE_KNOWLEDGE.projectInfo.features
  .map((item) => `- ${item.name}: ${item.description}`)
  .join("\n")}

Technology Stack:

Frontend:
${WEBSITE_KNOWLEDGE.projectInfo.technologyStack.frontend}

Backend:
${WEBSITE_KNOWLEDGE.projectInfo.technologyStack.backend}

Database:
${WEBSITE_KNOWLEDGE.projectInfo.technologyStack.database}

Deployment:
${WEBSITE_KNOWLEDGE.projectInfo.technologyStack.deployment}

AI:
${WEBSITE_KNOWLEDGE.projectInfo.technologyStack.aiIntegration}

Methodology:
${WEBSITE_KNOWLEDGE.projectInfo.methodology}

Future Works:
${WEBSITE_KNOWLEDGE.projectInfo.futureWorks.join(", ")}

Conclusion:
${WEBSITE_KNOWLEDGE.projectInfo.conclusion}

Rules:

1. Never invent information.

2. Only answer using the website data.

3. Use bullet points whenever appropriate.

4. Keep answers short and helpful.
`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: message,
        },
      ],

      temperature: 0.4,
      max_tokens: 1024,
    });

    const aiReply = completion.choices[0].message.content;

    res.status(200).json({
      reply: aiReply,
    });
  } catch (error) {
    console.error("Chatbot Error:", error);

    res.status(500).json({
      reply: "I'm facing a technical issue. Please try again later.",
    });
  }
});
// ========== END CHATBOT ROUTE ==========



async function run() {
  try {
    await client.connect();

    const userCollection=client.db('final-year-project').collection('users');
    const sellerCollection=client.db('final-year-project').collection('sellers');
    const productCollection=client.db('final-year-project').collection('products');
    const paymentCollection=client.db('final-year-project').collection('payments');
    const contactMessageCollection=client.db('final-year-project').collection('contactMessages');
    const communityPostCollection=client.db('final-year-project').collection('communityPosts');
    const communityCommentCollection=client.db('final-year-project').collection('communityComments');
    const marketplaceConversationCollection = client.db('final-year-project').collection('marketplaceConversations');
    const schemeCollection = client.db('final-year-project').collection('schemes');


        // ==================== JWT SECRET ====================
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

    // ==================== LOGIN / JWT ENDPOINT ====================
    app.post('/jwt', async (req, res) => {
        try {
            const { email, role } = req.body;
            if (!email || !role) {
                return res.status(400).json({ success: false, message: 'Email and role required' });
            }
            let user = null;
            if (role === 'seller') {
                user = await sellerCollection.findOne({ email });
            } else {
                user = await userCollection.findOne({ email });
            }
            if (!user) {
                return res.status(401).json({ success: false, message: 'Account not found for this role' });
            }
            const token = jwt.sign({ email: user.email, role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({
                success: true,
                token,
                role,
                user: { email: user.email, name: user.fullName || user.name || user.businessName || email.split('@')[0] }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Login failed' });
        }
    });

    // ==================== AUTHENTICATION MIDDLEWARE ====================
    const verifyJWT = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Unauthorized - no token' });
        }
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userEmail = decoded.email;
            req.userRole = decoded.role;
            next();
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
    };

      // ==================== USER AUTHENTICATION ====================
    app.post('/users',async(req,res)=>{
        const email=req.body.email;
        const userExists=await userCollection.findOne({email})
        if(userExists){
            return res.status(200).send({message:'user already exists',inserted:false});
        }
        const user=req.body;
        const result=await userCollection.insertOne(user);
        res.send(result);
    })

    // ==================== SELLER AUTHENTICATION ====================
    app.post('/sellers',async(req,res)=>{
        const email=req.body.email;
        const sellerExists=await sellerCollection.findOne({email})
        if(sellerExists){
            return res.status(200).send({message:'seller already exists',inserted:false});
        }
        const seller=req.body;
        const result=await sellerCollection.insertOne(seller);
        res.send(result);
    })


    // ==================== SELLER PROFILE ENDPOINTS (INDIVIDUAL ACCOUNTS) ====================
    
    // Get all sellers with their profile images
    app.get('/sellers', async(req, res) => {
        try {
            const { limit = 50, page = 1 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [sellers, totalCount] = await Promise.all([
                sellerCollection.find({})
                    .project({
                        email: 1,
                        fullName: 1,
                        businessName: 1,
                        businessType: 1,
                        profileImage: 1,
                        country: 1,
                        district: 1,
                        created_at: 1,
                        bio: 1
                    })
                    .sort({ created_at: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                sellerCollection.countDocuments({})
            ]);
            
            console.log(`✅ Fetched ${sellers.length} sellers`);
            res.json({ 
                success: true,
                sellers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalSellers: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching all sellers:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch sellers',
                error: error.message 
            });
        }
    });
    //     app.get('/sellers/:email', verifyJWT, async (req, res) => {
    //     try {
    //         const email = req.params.email;
    //         if (email !== req.userEmail) {
    //             return res.status(403).json({ success: false, message: 'Access denied' });
    //         }
    //         if (req.userRole !== 'seller') {
    //             return res.status(403).json({ success: false, message: 'Not a seller account' });
    //         }
    //         const seller = await sellerCollection.findOne({ email });
    //         if (seller) {
    //             await sellerCollection.updateOne({ email }, { $set: { last_log_in: new Date().toISOString() } });
    //             res.json({ success: true, ...seller });
    //         } else {
    //             res.status(404).json({ message: 'Seller profile not found', success: false });
    //         }
    //     } catch (error) {
    //         console.error('Error fetching seller profile:', error);
    //         res.status(500).json({ success: false, message: 'Failed to fetch seller profile' });
    //     }
    // });
    
    // Get seller profile by email - INDIVIDUAL ACCOUNT ACCESS
    app.get('/sellers/:email', async(req, res) => {
        try {
            const email = req.params.email;
            const seller = await sellerCollection.findOne({ email });
            
            if (seller) {
                // Update last access time
                await sellerCollection.updateOne(
                    { email },
                    { $set: { last_log_in: new Date().toISOString() } }
                );
                
                console.log(`✅ Seller profile accessed: ${email}`);
                res.json({ 
                    success: true,
                    ...seller 
                });
            } else {
                res.status(404).json({ 
                    message: 'Seller profile not found', 
                    success: false 
                });
            }
        } catch (error) {
            console.error('Error fetching seller profile:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch seller profile',
                error: error.message 
            });
        }
    });

    // Update seller profile - INDIVIDUAL ACCOUNT UPDATE
    app.put('/sellers/:email', async(req, res) => {
        try {
            const email = req.params.email;
            const updates = req.body;
            
            // Check if seller exists
            const existingSeller = await sellerCollection.findOne({ email });
            
            if (!existingSeller) {
                // Create new seller profile if doesn't exist
                const newSeller = {
                    ...updates,
                    email,
                    created_at: new Date().toISOString(),
                    last_log_in: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                const result = await sellerCollection.insertOne(newSeller);
                console.log(`✅ New seller profile created: ${email}`);
                
                return res.json({ 
                    success: true,
                    message: 'Seller profile created successfully', 
                    seller: newSeller
                });
            }
            
            // Prepare update data (don't update email - it's the identifier)
            const updateData = {
                ...updates,
                updated_at: new Date().toISOString()
            };
            
            // Remove email from updates to prevent changing it
            delete updateData.email;
            
            // Update existing seller profile
            const result = await sellerCollection.updateOne(
                { email },
                { $set: updateData }
            );
            
            if (result.modifiedCount === 0) {
                return res.status(304).json({ 
                    success: false,
                    message: 'No changes made to profile'
                });
            }
            
            // Get updated seller data
            const updatedSeller = await sellerCollection.findOne({ email });
            
            console.log(`✅ Seller profile updated: ${email}`);
            res.json({ 
                success: true,
                message: 'Seller profile updated successfully', 
                seller: updatedSeller
            });
            
        } catch (error) {
            console.error('Error updating seller profile:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to update seller profile',
                error: error.message 
            });
        }
    });

    // Delete seller account - INDIVIDUAL ACCOUNT DELETION (optional)
    app.delete('/sellers/:email', async(req, res) => {
        try {
            const email = req.params.email;
            
            // Check if seller has products
            const sellerProducts = await productCollection.countDocuments({ sellerEmail: email });
            
            if (sellerProducts > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: `Cannot delete account. You have ${sellerProducts} active products. Please delete them first.`
                });
            }
            
            const result = await sellerCollection.deleteOne({ email });
            
            if (result.deletedCount === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Seller not found'
                });
            }
            
            console.log(`🗑️ Seller account deleted: ${email}`);
            res.json({ 
                success: true,
                message: 'Seller account deleted successfully'
            });
            
        } catch (error) {
            console.error('Error deleting seller:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to delete seller account',
                error: error.message 
            });
        }
    });

    // ==================== PRODUCT ENDPOINTS ====================

    // ==================== MARKETPLACE BUYER/SELLER CHAT ====================
    app.get('/marketplace-conversations', async (req, res) => {
        try {
            const email = String(req.query.email || '').trim().toLowerCase();
            if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
            const conversations = await marketplaceConversationCollection
                .find({ $or: [{ buyerEmail: email }, { sellerEmail: email }] })
                .sort({ updatedAt: -1 }).toArray();
            res.json({ success: true, conversations });
        } catch (error) {
            console.error('Error loading marketplace conversations:', error);
            res.status(500).json({ success: false, message: 'Failed to load conversations' });
        }
    });

    app.post('/marketplace-conversations', async (req, res) => {
        try {
            const { productId, buyerEmail, buyerName, message } = req.body;
            const cleanBuyerEmail = String(buyerEmail || '').trim().toLowerCase();
            const cleanMessage = String(message || '').trim();
            if (!ObjectId.isValid(productId) || !cleanBuyerEmail || !cleanMessage) return res.status(400).json({ success: false, message: 'Product, buyer, and message are required' });
            if (cleanMessage.length > 2000) return res.status(400).json({ success: false, message: 'Messages must be 2000 characters or fewer' });

            const product = await productCollection.findOne({ _id: new ObjectId(productId) });
            if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
            if (product.sellerEmail?.toLowerCase() === cleanBuyerEmail) return res.status(400).json({ success: false, message: 'You cannot start a chat about your own product' });

            const existing = await marketplaceConversationCollection.findOne({ productId, buyerEmail: cleanBuyerEmail });
            const chatMessage = { senderEmail: cleanBuyerEmail, senderName: buyerName || cleanBuyerEmail.split('@')[0], text: cleanMessage, sentAt: new Date().toISOString() };
            if (existing) {
                await marketplaceConversationCollection.updateOne({ _id: existing._id }, { $push: { messages: chatMessage }, $set: { updatedAt: chatMessage.sentAt } });
                return res.json({ success: true, conversation: await marketplaceConversationCollection.findOne({ _id: existing._id }) });
            }

            const sellerEmail = product.sellerEmail.toLowerCase();
            const conversation = { productId, productName: product.name, productImage: product.imageUrl || '', buyerEmail: cleanBuyerEmail, buyerName: buyerName || cleanBuyerEmail.split('@')[0], sellerEmail, sellerName: product.sellerName || sellerEmail.split('@')[0], messages: [chatMessage], createdAt: chatMessage.sentAt, updatedAt: chatMessage.sentAt };
            const result = await marketplaceConversationCollection.insertOne(conversation);
            await productCollection.updateOne({ _id: new ObjectId(productId) }, { $inc: { inquiries: 1 } });
            res.status(201).json({ success: true, conversation: { ...conversation, _id: result.insertedId } });
        } catch (error) {
            console.error('Error starting marketplace conversation:', error);
            res.status(500).json({ success: false, message: 'Failed to start conversation' });
        }
    });


    app.post('/marketplace-conversations/:id/messages', async (req, res) => {
        try {
            const cleanEmail = String(req.body.senderEmail || '').trim().toLowerCase();
            const cleanMessage = String(req.body.message || '').trim();
            if (!ObjectId.isValid(req.params.id) || !cleanEmail || !cleanMessage) return res.status(400).json({ success: false, message: 'Sender and message are required' });
            if (cleanMessage.length > 2000) return res.status(400).json({ success: false, message: 'Messages must be 2000 characters or fewer' });
            const conversation = await marketplaceConversationCollection.findOne({ _id: new ObjectId(req.params.id) });
            if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
            if (cleanEmail !== conversation.buyerEmail && cleanEmail !== conversation.sellerEmail) return res.status(403).json({ success: false, message: 'You are not part of this conversation' });
            const chatMessage = { senderEmail: cleanEmail, senderName: req.body.senderName || cleanEmail.split('@')[0], text: cleanMessage, sentAt: new Date().toISOString() };
            await marketplaceConversationCollection.updateOne({ _id: conversation._id }, { $push: { messages: chatMessage }, $set: { updatedAt: chatMessage.sentAt } });
            res.json({ success: true, conversation: await marketplaceConversationCollection.findOne({ _id: conversation._id }) });
        } catch (error) {
            console.error('Error sending marketplace message:', error);
            res.status(500).json({ success: false, message: 'Failed to send message' });
        }
    });

    // Get all products with filtering and pagination
    app.get('/products', async(req, res) => {
        try {
            const { category, district, minPrice, maxPrice, status, search, page = 1, limit = 20 } = req.query;
            
            // Build filter query
            const filter = {};
            
            if (category) filter.category = category;
            if (district) filter.district = district;
            if (status) filter.status = status;
            
            if (minPrice || maxPrice) {
                filter.finalPrice = {};
                if (minPrice) filter.finalPrice.$gte = parseFloat(minPrice);
                if (maxPrice) filter.finalPrice.$lte = parseFloat(maxPrice);
            }
            
            // Search in name and description
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ];
            }
            
            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [products, totalCount] = await Promise.all([
                productCollection.find(filter)
                    .sort({ postedDate: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                productCollection.countDocuments(filter)
            ]);
            
            res.send({ 
                success: true,
                products,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalProducts: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Error fetching products:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to fetch products',
                error: error.message 
            });
        }
    })

    // Upload product image
    app.post('/upload', upload.single('image'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'No image file uploaded' 
                });
            }
            
            // Get the protocol and host from the request
            const protocol = req.protocol;
            const host = req.get('host');
            const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
            
            res.json({
                success: true,
                message: 'Image uploaded successfully',
                imageUrl: imageUrl,
                filename: req.file.filename,
                // Also provide relative path as fallback
                relativePath: `/uploads/${req.file.filename}`
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to upload image',
                error: error.message 
            });
        }
    });

    // Add new product (now supports imageUrl from upload)
    app.post('/products', async (req, res) => {
        try {
            const newProduct = req.body;
            
            // Validate required fields
            const validationErrors = validateProductData(newProduct);
            if (validationErrors.length > 0) {
                return res.status(400).send({ 
                    success: false,
                    message: 'Validation failed',
                    errors: validationErrors
                });
            }
            
            // Verify seller exists
            const sellerExists = await sellerCollection.findOne({ email: newProduct.sellerEmail });
            if (!sellerExists) {
                return res.status(404).send({ 
                    success: false,
                    message: 'Seller not found. Please register as a seller first.'
                });
            }
            
            // Add automatic fields
            newProduct.finalPrice = newProduct.offerPrice || newProduct.price;
            newProduct.postedDate = new Date().toISOString();
            newProduct.lastPriceUpdate = new Date().toISOString();
            newProduct.status = 'available';
            newProduct.views = 0;
            newProduct.inquiries = 0;
            newProduct.sellerName = sellerExists.name || sellerExists.fullName || 'Unknown Seller';
            newProduct.sellerPhone = sellerExists.phone || sellerExists.phoneNumber || '';

            console.log('Adding product:', { name: newProduct.name, seller: newProduct.sellerEmail });
            const result = await productCollection.insertOne(newProduct);
            
            // Send proper success response
            res.status(201).send({ 
                success: true,
                message: 'Product added successfully',
                inserted: true,
                productId: result.insertedId,
                product: { ...newProduct, _id: result.insertedId }
            });
        } catch (error) {
            console.error('Error adding product:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to add product',
                error: error.message 
            });
        }
    });

    // Get single product by ID
    app.get('/products/:id', async (req, res) => {
        try {
            const productId = req.params.id;
            
            if (!ObjectId.isValid(productId)) {
                return res.status(400).send({ 
                    success: false,
                    message: 'Invalid product ID'
                });
            }
            
            const product = await productCollection.findOne({ _id: new ObjectId(productId) });
            
            if (!product) {
                return res.status(404).send({ 
                    success: false,
                    message: 'Product not found'
                });
            }
            
            // Increment view count
            await productCollection.updateOne(
                { _id: new ObjectId(productId) },
                { $inc: { views: 1 } }
            );
            
            res.send({ success: true, product });
        } catch (error) {
            console.error('Error fetching product:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to fetch product',
                error: error.message 
            });
        }
    });

    // Get products by seller email
    app.get('/products/seller/:email', async (req, res) => {
        try {
            const sellerEmail = req.params.email;
            const products = await productCollection.find({ sellerEmail }).toArray();
            
            res.send({ 
                success: true,
                count: products.length,
                products 
            });
        } catch (error) {
            console.error('Error fetching seller products:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to fetch seller products',
                error: error.message 
            });
        }
    });

    // Update product
    app.put('/products/:id', async (req, res) => {
        try {
            const productId = req.params.id;
            const updates = req.body;
            
            if (!ObjectId.isValid(productId)) {
                return res.status(400).send({ 
                    success: false,
                    message: 'Invalid product ID'
                });
            }
            
            // Verify product exists
            const existingProduct = await productCollection.findOne({ _id: new ObjectId(productId) });
            if (!existingProduct) {
                return res.status(404).send({ 
                    success: false,
                    message: 'Product not found'
                });
            }
            
            // Verify seller owns the product
            if (updates.sellerEmail && existingProduct.sellerEmail !== updates.sellerEmail) {
                return res.status(403).send({ 
                    success: false,
                    message: 'Not authorized to update this product'
                });
            }
            
            // Prepare update object
            const updateData = {};
            const allowedFields = ['name', 'description', 'category', 'price', 'offerPrice', 'district', 'imageUrl', 'status', 'quantity'];
            
            allowedFields.forEach(field => {
                if (updates[field] !== undefined) {
                    updateData[field] = updates[field];
                }
            });
            
            // Update finalPrice if price changed
            if (updates.price || updates.offerPrice) {
                updateData.finalPrice = updates.offerPrice || updates.price || existingProduct.price;
                updateData.lastPriceUpdate = new Date().toISOString();
            }
            
            const result = await productCollection.updateOne(
                { _id: new ObjectId(productId) },
                { $set: updateData }
            );
            
            if (result.modifiedCount === 0) {
                return res.status(304).send({ 
                    success: false,
                    message: 'No changes made to product'
                });
            }
            
            const updatedProduct = await productCollection.findOne({ _id: new ObjectId(productId) });
            
            res.send({ 
                success: true,
                message: 'Product updated successfully',
                product: updatedProduct
            });
        } catch (error) {
            console.error('Error updating product:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to update product',
                error: error.message 
            });
        }
    });

    // Delete product
    app.delete('/products/:id', async (req, res) => {
        try {
            const productId = req.params.id;
            const { sellerEmail } = req.body;
            
            if (!ObjectId.isValid(productId)) {
                return res.status(400).send({ 
                    success: false,
                    message: 'Invalid product ID'
                });
            }
            
            // Verify product exists and seller owns it
            const product = await productCollection.findOne({ _id: new ObjectId(productId) });
            if (!product) {
                return res.status(404).send({ 
                    success: false,
                    message: 'Product not found'
                });
            }
            
            if (product.sellerEmail !== sellerEmail) {
                return res.status(403).send({ 
                    success: false,
                    message: 'Not authorized to delete this product'
                });
            }
            
            // Delete the product image if it exists
            if (product.imageUrl && product.imageUrl.includes('/uploads/')) {
                const filename = product.imageUrl.split('/uploads/')[1];
                const imagePath = path.join(uploadsDir, filename);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                    console.log('Deleted image:', filename);
                }
            }
            
            const result = await productCollection.deleteOne({ _id: new ObjectId(productId) });
            
            res.send({ 
                success: true,
                message: 'Product deleted successfully',
                deletedCount: result.deletedCount
            });
        } catch (error) {
            console.error('Error deleting product:', error);
            res.status(500).send({ 
                success: false,
                message: 'Failed to delete product',
                error: error.message 
            });
        }
    });

    // ==================== PAYMENT ENDPOINTS ====================

    // Save payment details (called after successful payment)
    app.post('/payments', async (req, res) => {
        try {
            const paymentData = req.body;
            
            // Validate required fields
            if (!paymentData.transactionId) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Transaction ID is required'
                });
            }
            
            if (!paymentData.customerInfo || !paymentData.customerInfo.email) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Customer information is required'
                });
            }
            
            if (!paymentData.orderTotal || paymentData.orderTotal <= 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Valid order total is required'
                });
            }
            
            // Check if transaction ID already exists
            const existingPayment = await paymentCollection.findOne({ 
                transactionId: paymentData.transactionId 
            });
            
            if (existingPayment) {
                return res.status(409).json({ 
                    success: false,
                    message: 'Transaction ID already exists'
                });
            }
            
            // Prepare payment document
            const paymentDocument = {
                transactionId: paymentData.transactionId,
                customerInfo: {
                    name: paymentData.customerInfo.name,
                    email: paymentData.customerInfo.email,
                    phone: paymentData.customerInfo.phone,
                    address: paymentData.customerInfo.address,
                    city: paymentData.customerInfo.city,
                    district: paymentData.customerInfo.district,
                    postalCode: paymentData.customerInfo.postalCode
                },
                orderItems: paymentData.orderItems || [],
                orderTotal: parseFloat(paymentData.orderTotal),
                subtotal: parseFloat(paymentData.subtotal || paymentData.orderTotal),
                deliveryFee: parseFloat(paymentData.deliveryFee || 0),
                tax: parseFloat(paymentData.tax || 0),
                paymentMethod: paymentData.paymentMethod || 'Unknown',
                paymentType: paymentData.paymentType || 'dummy', // 'dummy' or 'real'
                paymentStatus: paymentData.paymentStatus || 'completed',
                orderStatus: paymentData.orderStatus || 'processing',
                orderDate: paymentData.orderDate || new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                
                // Additional payment details for mobile banking
                mobileNumber: paymentData.mobileNumber || null,
                
                // Additional fields
                notes: paymentData.notes || '',
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            };
            
            // Insert payment record
            const result = await paymentCollection.insertOne(paymentDocument);
            
            console.log(`💳 Payment saved: ${paymentData.transactionId} - ৳${paymentData.orderTotal}`);
            
            res.status(201).json({ 
                success: true,
                message: 'Payment details saved successfully',
                paymentId: result.insertedId,
                transactionId: paymentData.transactionId
            });
            
        } catch (error) {
            console.error('Error saving payment:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to save payment details',
                error: error.message 
            });
        }
    });

    // Get all payments (admin) with filtering and pagination - MUST COME FIRST
    app.get('/payments', async (req, res) => {
        try {
            const { 
                page = 1, 
                limit = 50, 
                status, 
                paymentMethod, 
                startDate, 
                endDate,
                minAmount,
                maxAmount 
            } = req.query;
            
            // Build filter
            const filter = {};
            if (status) filter.paymentStatus = status;
            if (paymentMethod) filter.paymentMethod = paymentMethod;
            
            // Date range filter
            if (startDate || endDate) {
                filter.createdAt = {};
                if (startDate) filter.createdAt.$gte = new Date(startDate).toISOString();
                if (endDate) filter.createdAt.$lte = new Date(endDate).toISOString();
            }
            
            // Amount range filter
            if (minAmount || maxAmount) {
                filter.orderTotal = {};
                if (minAmount) filter.orderTotal.$gte = parseFloat(minAmount);
                if (maxAmount) filter.orderTotal.$lte = parseFloat(maxAmount);
            }
            
            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [payments, totalCount, totalRevenue] = await Promise.all([
                paymentCollection.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                paymentCollection.countDocuments(filter),
                paymentCollection.aggregate([
                    { $match: filter },
                    { $group: { _id: null, total: { $sum: '$orderTotal' } } }
                ]).toArray()
            ]);
            
            res.json({ 
                success: true,
                payments,
                statistics: {
                    totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPayments: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
            
        } catch (error) {
            console.error('Error fetching all payments:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch payments',
                error: error.message 
            });
        }
    });

    // Get payment history by customer email
    app.get('/payments/customer/:email', async (req, res) => {
        try {
            const email = req.params.email;
            const { page = 1, limit = 20, status, paymentMethod } = req.query;
            
            // Build filter
            const filter = { 'customerInfo.email': email };
            if (status) filter.paymentStatus = status;
            if (paymentMethod) filter.paymentMethod = paymentMethod;
            
            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [payments, totalCount] = await Promise.all([
                paymentCollection.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                paymentCollection.countDocuments(filter)
            ]);
            
            res.json({ 
                success: true,
                payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPayments: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
            
        } catch (error) {
            console.error('Error fetching customer payments:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch payment history',
                error: error.message 
            });
        }
    });

    // Get payment by transaction ID
    app.get('/payments/:transactionId', async (req, res) => {
        try {
            const transactionId = req.params.transactionId;
            
            const payment = await paymentCollection.findOne({ transactionId });
            
            if (!payment) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Payment not found'
                });
            }
            
            res.json({ 
                success: true,
                payment 
            });
            
        } catch (error) {
            console.error('Error fetching payment:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch payment details',
                error: error.message 
            });
        }
    });

    // Update payment status (for order tracking)
    app.patch('/payments/:transactionId/status', async (req, res) => {
        try {
            const transactionId = req.params.transactionId;
            const { orderStatus, paymentStatus } = req.body;
            
            if (!orderStatus && !paymentStatus) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Order status or payment status is required'
                });
            }
            
            const updateData = { 
                updatedAt: new Date().toISOString() 
            };
            
            if (orderStatus) updateData.orderStatus = orderStatus;
            if (paymentStatus) updateData.paymentStatus = paymentStatus;
            
            const result = await paymentCollection.updateOne(
                { transactionId },
                { $set: updateData }
            );
            
            if (result.matchedCount === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Payment not found'
                });
            }
            
            const updatedPayment = await paymentCollection.findOne({ transactionId });
            
            console.log(`📦 Payment status updated: ${transactionId} - ${orderStatus || paymentStatus}`);
            
            res.json({ 
                success: true,
                message: 'Payment status updated successfully',
                payment: updatedPayment
            });
            
        } catch (error) {
            console.error('Error updating payment status:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to update payment status',
                error: error.message 
            });
        }
    });

    // Get payment statistics (for dashboard)
    app.get('/payments/stats/summary', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate).toISOString();
                if (endDate) dateFilter.createdAt.$lte = new Date(endDate).toISOString();
            }
            
            const [
                totalPayments,
                totalRevenue,
                paymentsByMethod,
                paymentsByStatus,
                recentPayments
            ] = await Promise.all([
                paymentCollection.countDocuments(dateFilter),
                paymentCollection.aggregate([
                    { $match: dateFilter },
                    { $group: { _id: null, total: { $sum: '$orderTotal' } } }
                ]).toArray(),
                paymentCollection.aggregate([
                    { $match: dateFilter },
                    { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$orderTotal' } } }
                ]).toArray(),
                paymentCollection.aggregate([
                    { $match: dateFilter },
                    { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
                ]).toArray(),
                paymentCollection.find(dateFilter)
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .toArray()
            ]);
            
            res.json({ 
                success: true,
                statistics: {
                    totalPayments,
                    totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
                    paymentsByMethod,
                    paymentsByStatus,
                    recentPayments
                }
            });
            
        } catch (error) {
            console.error('Error fetching payment statistics:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch payment statistics',
                error: error.message 
            });
        }
    });

    // ==================== CONTACT MESSAGE ENDPOINTS ====================

    // Save contact message (called when user submits contact form)
    app.post('/contact-messages', async (req, res) => {
        try {
            const { name, email, phone, subject, message } = req.body;
            
            // Validate required fields
            if (!name || !email || !phone || !subject || !message) {
                return res.status(400).json({ 
                    success: false,
                    message: 'All fields are required'
                });
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid email format'
                });
            }
            
            // Validate phone format (Bangladesh: 01XXXXXXXXX)
            const phoneRegex = /^01[0-9]{9}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid phone number format. Use: 01XXXXXXXXX'
                });
            }
            
            // Prepare contact message document
            const contactMessage = {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone.trim(),
                subject: subject.trim(),
                message: message.trim(),
                status: 'new', // 'new', 'read', 'replied'
                createdAt: new Date().toISOString(),
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            };
            
            // Insert contact message
            const result = await contactMessageCollection.insertOne(contactMessage);
            
            console.log(`📧 Contact message received from: ${name} (${email})`);
            
            res.status(201).json({ 
                success: true,
                message: 'Message sent successfully! We will get back to you soon.',
                messageId: result.insertedId
            });
            
        } catch (error) {
            console.error('Error saving contact message:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to send message. Please try again.',
                error: error.message 
            });
        }
    });

    // Get all contact messages (for admin)
    app.get('/contact-messages', async (req, res) => {
        try {
            const { page = 1, limit = 50, status, search } = req.query;
            
            // Build filter
            const filter = {};
            if (status) filter.status = status;
            
            // Search in name, email, or subject
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { subject: { $regex: search, $options: 'i' } }
                ];
            }
            
            // Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const [messages, totalCount] = await Promise.all([
                contactMessageCollection.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                contactMessageCollection.countDocuments(filter)
            ]);
            
            res.json({ 
                success: true,
                messages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalMessages: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
            
        } catch (error) {
            console.error('Error fetching contact messages:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch contact messages',
                error: error.message 
            });
        }
    });

    // Get single contact message by ID (for admin)
    app.get('/contact-messages/:id', async (req, res) => {
        try {
            const messageId = req.params.id;
            
            if (!ObjectId.isValid(messageId)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid message ID'
                });
            }
            
            const message = await contactMessageCollection.findOne({ _id: new ObjectId(messageId) });
            
            if (!message) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Message not found'
                });
            }
            
            res.json({ 
                success: true,
                message 
            });
            
        } catch (error) {
            console.error('Error fetching contact message:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch message',
                error: error.message 
            });
        }
    });

    // Update contact message status (for admin)
    app.patch('/contact-messages/:id/status', async (req, res) => {
        try {
            const messageId = req.params.id;
            const { status } = req.body;
            
            if (!ObjectId.isValid(messageId)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid message ID'
                });
            }
            
            if (!['new', 'read', 'replied'].includes(status)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid status. Must be: new, read, or replied'
                });
            }
            
            const result = await contactMessageCollection.updateOne(
                { _id: new ObjectId(messageId) },
                { 
                    $set: { 
                        status,
                        updatedAt: new Date().toISOString()
                    } 
                }
            );
            
            if (result.matchedCount === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Message not found'
                });
            }
            
            const updatedMessage = await contactMessageCollection.findOne({ _id: new ObjectId(messageId) });
            
            console.log(`📬 Contact message status updated: ${messageId} - ${status}`);
            
            res.json({ 
                success: true,
                message: 'Status updated successfully',
                data: updatedMessage
            });
            
        } catch (error) {
            console.error('Error updating message status:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to update status',
                error: error.message 
            });
        }
    });

    // Delete contact message (for admin)
    app.delete('/contact-messages/:id', async (req, res) => {
        try {
            const messageId = req.params.id;
            
            if (!ObjectId.isValid(messageId)) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Invalid message ID'
                });
            }
            
            const result = await contactMessageCollection.deleteOne({ _id: new ObjectId(messageId) });
            
            if (result.deletedCount === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Message not found'
                });
            }
            
            console.log(`🗑️ Contact message deleted: ${messageId}`);
            
            res.json({ 
                success: true,
                message: 'Message deleted successfully'
            });
            
        } catch (error) {
            console.error('Error deleting contact message:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to delete message',
                error: error.message 
            });
        }
    });

    // Get contact message statistics (for admin dashboard)
    app.get('/contact-messages/stats/summary', async (req, res) => {
        try {
            const [
                totalMessages,
                newMessages,
                readMessages,
                repliedMessages,
                recentMessages
            ] = await Promise.all([
                contactMessageCollection.countDocuments({}),
                contactMessageCollection.countDocuments({ status: 'new' }),
                contactMessageCollection.countDocuments({ status: 'read' }),
                contactMessageCollection.countDocuments({ status: 'replied' }),
                contactMessageCollection.find({})
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .toArray()
            ]);
            
            res.json({ 
                success: true,
                statistics: {
                    totalMessages,
                    newMessages,
                    readMessages,
                    repliedMessages,
                    recentMessages
                }
            });
            
        } catch (error) {
            console.error('Error fetching contact message statistics:', error);
            res.status(500).json({ 
                success: false,
                message: 'Failed to fetch statistics',
                error: error.message 
            });
        }
    });

    // ============ 365-DAY DYNAMIC PRICING API ============
    app.post('/api/price-suggestion', async (req, res) => {
        try {
            const { category, district, qualityGrade } = req.body;
            const today = new Date();
            
            console.log('365-Day Price suggestion requested:', { category, district, qualityGrade, date: today });

            // Get comprehensive market analysis
            const marketAnalysis = getMarketAnalysis(category, district, today);
            
            // Apply quality adjustments
            const qualityMultipliers = { 
                'A': 1.15, 'B': 1.00, 'C': 0.85
            };
            const qualityMultiplier = qualityMultipliers[qualityGrade] || 1.0;
            
            // Competitive pricing (5% below market)
            const suggestedPrice = (marketAnalysis.currentPrice * qualityMultiplier * 0.95).toFixed(2);
            
            // Get season information
            const season = getSeasonalPhase(today);
            const seasonNames = {
                'peak_harvest': 'Peak Harvest Season (Lower Prices)',
                'lean_season': 'Lean Season (Higher Prices)', 
                'normal': 'Normal Season'
            };
            
            res.json({
                success: true,
                data: {
                    suggestedPrice: parseFloat(suggestedPrice),
                    marketPrice: parseFloat(marketAnalysis.currentPrice.toFixed(2)),
                    qualityAdjustment: ((qualityMultiplier - 1) * 100).toFixed(0),
                    district: district,
                    category: category,
                    explanation: `Based on current ${district} market conditions with ${qualityGrade} quality`,
                    marketTrend: marketAnalysis.trend,
                    trendAmount: marketAnalysis.trendAmount,
                    trendPercentage: marketAnalysis.trendPercentage,
                    weeklyHigh: marketAnalysis.weeklyHigh,
                    weeklyLow: marketAnalysis.weeklyLow,
                    season: seasonNames[season],
                    date: today.toISOString().split('T')[0],
                    note: 'Realistic 365-day market simulation with seasonal patterns'
                }
            });

        } catch (error) {
            console.error('Price suggestion error:', error);
            res.status(500).json({
                success: false,
                message: 'Unable to fetch price suggestion'
            });
        }
    });

    // New API: Get 30-day price forecast
    app.get('/api/price-forecast/:category/:district', async (req, res) => {
        try {
            const { category, district } = req.params;
            const today = new Date();
            
            const forecast = [];
            for (let i = 0; i < 30; i++) {
                const futureDate = new Date(today);
                futureDate.setDate(futureDate.getDate() + i);
                
                const price = get365DayPrice(category, district, futureDate);
                forecast.push({
                    date: futureDate.toISOString().split('T')[0],
                    price: parseFloat(price.toFixed(2)),
                    day: futureDate.toLocaleDateString('en-US', { weekday: 'short' }),
                    season: getSeasonalPhase(futureDate)
                });
            }
            
            res.json({
                success: true,
                data: {
                    category,
                    district,
                    forecast,
                    generated: today.toISOString()
                }
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Unable to generate price forecast'
            });
        }
    });

    // New API: Get seasonal price ranges
    app.get('/api/seasonal-prices/:category/:district', async (req, res) => {
        try {
            const { category, district } = req.params;
            const today = new Date();
            const currentYear = today.getFullYear();
            
            const seasonalData = {};
            const seasons = ['peak_harvest', 'lean_season', 'normal'];
            
            seasons.forEach(season => {
                // Sample prices for each season
                const sampleDates = [
                    new Date(currentYear, 0, 15),   // Jan - peak_harvest
                    new Date(currentYear, 6, 15),   // Jul - lean_season  
                    new Date(currentYear, 3, 15)    // Apr - normal
                ];
                
                seasonalData[season] = sampleDates.map(date => ({
                    date: date.toISOString().split('T')[0],
                    price: parseFloat(get365DayPrice(category, district, date).toFixed(2)),
                    month: date.toLocaleDateString('en-US', { month: 'long' })
                }));
            });
            
            res.json({
                success: true,
                data: {
                    category,
                    district,
                    seasonalData,
                    note: 'Price variations across different seasons'
                }
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Unable to fetch seasonal prices'
            });
        }
    });

// ==================== GOVERNMENT SCHEMES ENDPOINTS ====================

// Helper: build filter object from query
const buildSchemeFilter = (query) => {
  const filter = {};
  
  // Status: default to 'active' unless 'all' is requested
  if (query.status === 'all') {
    // no status filter
  } else if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = 'active'; // default
  }
  
  // Basic filters
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.district && query.district !== 'all') {
    // Allow 'All districts' or specific district
    filter.district = { $in: ['All districts', query.district] };
  }
  if (query.cropType && query.cropType !== 'all') filter.cropType = query.cropType;
  if (query.farmerType && query.farmerType !== 'all') filter.farmerType = query.farmerType;
  if (query.ministry && query.ministry !== 'all') filter.ministry = query.ministry;
  
  // Featured filter
  if (query.featured === 'true') filter.isFeatured = true;
  
  // Search
  if (query.search) {
    filter.$or = [
      { schemeName: { $regex: query.search, $options: 'i' } },
      { description: { $regex: query.search, $options: 'i' } }
    ];
  }
  
  return filter;
};

// Helper: build sort object
const buildSort = (sortParam, orderParam = 'desc') => {
  const order = orderParam === 'asc' ? 1 : -1;
  switch (sortParam) {
    case 'createdAt':
      return { createdAt: order };
    case 'popularity':
      return { popularity: order };
    case 'deadline':
      return { deadline: order };
    case 'featured':
      return { isFeatured: -1, createdAt: -1 }; // featured first, then recent
    default:
      return { postedDate: -1 }; // default: newest first
  }
};

// 1. GET all schemes (with full filtering, sorting, pagination)
app.get('/api/schemes', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = 'postedDate',
      order = 'desc',
      ...queryParams
    } = req.query;

    const filter = buildSchemeFilter(queryParams);
    const sortObj = buildSort(sort, order);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const [schemes, totalCount] = await Promise.all([
      schemeCollection.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      schemeCollection.countDocuments(filter)
    ]);

    res.json({
      success: true,
      schemes,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch schemes' });
  }
});

// 2. GET single scheme by ID
app.get('/api/schemes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    
    const scheme = await schemeCollection.findOne({ _id: new ObjectId(id) });
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    
    // Increment view count (optional)
    await schemeCollection.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { views: 1 } }
    );
    
    res.json({ success: true, scheme });
  } catch (error) {
    console.error('Error fetching scheme:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scheme' });
  }
});

// 3. GET featured schemes (limit 4)
app.get('/api/schemes/featured', async (req, res) => {
  try {
    const { limit = 4 } = req.query;
    const schemes = await schemeCollection
      .find({ isFeatured: true, status: 'active' })
      .sort({ postedDate: -1 })
      .limit(parseInt(limit))
      .toArray();
    res.json({ success: true, schemes });
  } catch (error) {
    console.error('Error fetching featured schemes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch featured schemes' });
  }
});

// 4. GET recent schemes (limit 4)
app.get('/api/schemes/recent', async (req, res) => {
  try {
    const { limit = 4 } = req.query;
    const schemes = await schemeCollection
      .find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .toArray();
    res.json({ success: true, schemes });
  } catch (error) {
    console.error('Error fetching recent schemes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent schemes' });
  }
});

// 5. GET popular schemes (by popularity field, default 4)
app.get('/api/schemes/popular', async (req, res) => {
  try {
    const { limit = 4 } = req.query;
    const schemes = await schemeCollection
      .find({ status: 'active' })
      .sort({ popularity: -1, views: -1 }) // fallback to views if popularity missing
      .limit(parseInt(limit))
      .toArray();
    res.json({ success: true, schemes });
  } catch (error) {
    console.error('Error fetching popular schemes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch popular schemes' });
  }
});

// 6. GET expiring soon schemes (limit 4)
app.get('/api/schemes/expiring', async (req, res) => {
  try {
    const { limit = 4 } = req.query;
    const now = new Date().toISOString();
    const schemes = await schemeCollection
      .find({ status: 'active', deadline: { $gte: now } })
      .sort({ deadline: 1 }) // ascending = soonest first
      .limit(parseInt(limit))
      .toArray();
    res.json({ success: true, schemes });
  } catch (error) {
    console.error('Error fetching expiring schemes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch expiring schemes' });
  }
});

// 7. POST - Add new scheme (admin only)
app.post('/api/schemes', async (req, res) => {
  try {
    const schemeData = req.body;
    
    // Validate required fields
    const required = ['schemeName', 'category', 'description', 'eligibility', 'deadline'];
    for (const field of required) {
      if (!schemeData[field]) {
        return res.status(400).json({ 
          success: false, 
          message: `Missing required field: ${field}` 
        });
      }
    }
    
    // Add timestamps and defaults
    schemeData.postedDate = new Date().toISOString();
    schemeData.createdAt = new Date().toISOString();
    schemeData.updatedAt = new Date().toISOString();
    schemeData.status = schemeData.status || 'active';
    schemeData.views = 0;
    schemeData.applications = 0;
    schemeData.popularity = schemeData.popularity || 0;
    schemeData.isFeatured = schemeData.isFeatured || false;
    
    // Ensure arrays are arrays
    ['eligibility', 'benefits', 'documents', 'applicationSteps', 'faqs'].forEach(field => {
      if (schemeData[field] && !Array.isArray(schemeData[field])) {
        schemeData[field] = [schemeData[field]];
      } else if (!schemeData[field]) {
        schemeData[field] = [];
      }
    });
    
    const result = await schemeCollection.insertOne(schemeData);
    res.status(201).json({ 
      success: true, 
      message: 'Scheme added successfully',
      schemeId: result.insertedId 
    });
  } catch (error) {
    console.error('Error adding scheme:', error);
    res.status(500).json({ success: false, message: 'Failed to add scheme' });
  }
});

// 8. PUT - Update scheme (admin only)
app.put('/api/schemes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    
    // Remove immutable fields
    delete updates._id;
    delete updates.postedDate;
    delete updates.createdAt;
    updates.updatedAt = new Date().toISOString();
    
    const result = await schemeCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    res.json({ success: true, message: 'Scheme updated successfully' });
  } catch (error) {
    console.error('Error updating scheme:', error);
    res.status(500).json({ success: false, message: 'Failed to update scheme' });
  }
});

// 9. DELETE - Delete scheme (admin only)
app.delete('/api/schemes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    
    const result = await schemeCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    res.json({ success: true, message: 'Scheme deleted successfully' });
  } catch (error) {
    console.error('Error deleting scheme:', error);
    res.status(500).json({ success: false, message: 'Failed to delete scheme' });
  }
});

// 10. GET scheme categories (for filters)
app.get('/api/schemes/categories', async (req, res) => {
  try {
    const categories = await schemeCollection.distinct('category');
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// 11. GET scheme statistics (for dashboard)
app.get('/api/schemes/stats', async (req, res) => {
  try {
    const [total, active, expired] = await Promise.all([
      schemeCollection.countDocuments({}),
      schemeCollection.countDocuments({ status: 'active' }),
      schemeCollection.countDocuments({ status: 'expired' })
    ]);
    
    res.json({
      success: true,
      statistics: { total, active, expired }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// ==================== COMMUNITY FORUM ENDPOINTS ====================

    // Create new post
    app.post('/community-posts', async (req, res) => {
        try {
            const { title, content, category, authorEmail, authorName } = req.body;
            
            if (!title || !content || !category || !authorEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Title, content, category, and author email are required'
                });
            }
            
            const newPost = {
                title: title.trim(),
                content: content.trim(),
                category,
                authorEmail,
                authorName: authorName || authorEmail.split('@')[0],
                upvotes: 0,
                views: 0,
                commentCount: 0,
                isSolved: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const result = await communityPostCollection.insertOne(newPost);
            
            console.log(`📝 Community post created: ${title} by ${authorName}`);
            
            res.status(201).json({
                success: true,
                message: 'Post created successfully',
                postId: result.insertedId
            });
            
        } catch (error) {
            console.error('Error creating post:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create post',
                error: error.message
            });
        }
    });

    // Get all posts with filtering
    app.get('/community-posts', async (req, res) => {
        try {
            const { page = 1, limit = 20, category, sort = 'recent' } = req.query;
            
            const filter = {};
            if (category && category !== 'all') {
                filter.category = category;
            }
            
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            let sortOption = { createdAt: -1 };
            if (sort === 'popular') sortOption = { upvotes: -1 };
            if (sort === 'active') sortOption = { commentCount: -1 };
            
            const [posts, totalCount] = await Promise.all([
                communityPostCollection.find(filter)
                    .sort(sortOption)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .toArray(),
                communityPostCollection.countDocuments(filter)
            ]);
            
            res.json({
                success: true,
                posts,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPosts: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(limit))
                }
            });
            
        } catch (error) {
            console.error('Error fetching posts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch posts',
                error: error.message
            });
        }
    });

    // Get single post by ID
    app.get('/community-posts/:id', async (req, res) => {
        try {
            const postId = req.params.id;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            const post = await communityPostCollection.findOne({ _id: new ObjectId(postId) });
            
            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: 'Post not found'
                });
            }
            
            res.json({
                success: true,
                post
            });
            
        } catch (error) {
            console.error('Error fetching post:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch post',
                error: error.message
            });
        }
    });

    // Upvote post
    app.patch('/community-posts/:id/upvote', async (req, res) => {
        try {
            const postId = req.params.id;
            const { userEmail } = req.body;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            const result = await communityPostCollection.updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $inc: { upvotes: 1 },
                    $set: { updatedAt: new Date().toISOString() }
                }
            );
            
            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Post not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Post upvoted successfully'
            });
            
        } catch (error) {
            console.error('Error upvoting post:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to upvote post',
                error: error.message
            });
        }
    });

    // Increment view count
    app.patch('/community-posts/:id/view', async (req, res) => {
        try {
            const postId = req.params.id;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            await communityPostCollection.updateOne(
                { _id: new ObjectId(postId) },
                { $inc: { views: 1 } }
            );
            
            res.json({
                success: true,
                message: 'View count updated'
            });
            
        } catch (error) {
            console.error('Error updating view count:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update view count',
                error: error.message
            });
        }
    });

    // Add comment to post
    app.post('/community-posts/:id/comments', async (req, res) => {
        try {
            const postId = req.params.id;
            const { content, authorEmail, authorName } = req.body;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            if (!content || !authorEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Content and author email are required'
                });
            }
            
            const comment = {
                postId: new ObjectId(postId),
                content: content.trim(),
                authorEmail,
                authorName: authorName || authorEmail.split('@')[0],
                createdAt: new Date().toISOString()
            };
            
            const result = await communityCommentCollection.insertOne(comment);
            
            // Increment comment count on post
            await communityPostCollection.updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $inc: { commentCount: 1 },
                    $set: { updatedAt: new Date().toISOString() }
                }
            );
            
            res.status(201).json({
                success: true,
                message: 'Comment added successfully',
                commentId: result.insertedId
            });
            
        } catch (error) {
            console.error('Error adding comment:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add comment',
                error: error.message
            });
        }
    });

    // Get comments for a post
    app.get('/community-posts/:id/comments', async (req, res) => {
        try {
            const postId = req.params.id;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            const comments = await communityCommentCollection
                .find({ postId: new ObjectId(postId) })
                .sort({ createdAt: 1 })
                .toArray();
            
            res.json({
                success: true,
                comments
            });
            
        } catch (error) {
            console.error('Error fetching comments:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch comments',
                error: error.message
            });
        }
    });

    // Mark post as solved
    app.patch('/community-posts/:id/solve', async (req, res) => {
        try {
            const postId = req.params.id;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            const result = await communityPostCollection.updateOne(
                { _id: new ObjectId(postId) },
                { 
                    $set: { 
                        isSolved: true,
                        updatedAt: new Date().toISOString()
                    }
                }
            );
            
            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Post not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Post marked as solved'
            });
            
        } catch (error) {
            console.error('Error marking post as solved:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark post as solved',
                error: error.message
            });
        }
    });

    // Delete post
    app.delete('/community-posts/:id', async (req, res) => {
        try {
            const postId = req.params.id;
            const { authorEmail } = req.body;
            
            if (!ObjectId.isValid(postId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid post ID'
                });
            }
            
            const post = await communityPostCollection.findOne({ _id: new ObjectId(postId) });
            
            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: 'Post not found'
                });
            }
            
            if (post.authorEmail !== authorEmail) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to delete this post'
                });
            }
            
            await communityPostCollection.deleteOne({ _id: new ObjectId(postId) });
            await communityCommentCollection.deleteMany({ postId: new ObjectId(postId) });
            
            res.json({
                success: true,
                message: 'Post deleted successfully'
            });
            
        } catch (error) {
            console.error('Error deleting post:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete post',
                error: error.message
            });
        }
    });

    // ==================== SSLCOMMERZ PAYMENT INTEGRATION ====================
    const STORE_ID = process.env.SSLCOMMERZ_STORE_ID;
    const STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD;
    const IS_LIVE = process.env.SSLCOMMERZ_IS_LIVE === 'true';
    const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const BACKEND_URL = (process.env.BACKEND_URL || `http://localhost:${port}`).replace(/\/+$/, '');

    const sslcz = () => new SSLCommerzPayment(STORE_ID, STORE_PASSWORD, IS_LIVE);

    function sslCommerzConfigError() {
        if (!STORE_ID || !STORE_PASSWORD) {
            return 'SSLCommerz credentials are missing. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD.';
        }
        if (IS_LIVE && !/^https:\/\//i.test(BACKEND_URL)) {
            return 'BACKEND_URL must be a public HTTPS URL before enabling live SSLCommerz payments.';
        }
        if (IS_LIVE && /localhost|127\.0\.0\.1/i.test(BACKEND_URL)) {
            return 'BACKEND_URL must be public before enabling live SSLCommerz payments.';
        }
        return null;
    }

    function paymentFailureReason(response) {
        if (response instanceof Error) return response.message;
        if (!response || typeof response !== 'object') return 'SSLCommerz returned no response.';
        return response.failedreason || response.error || response.message || response.status || 'SSLCommerz did not return a gateway URL.';
    }

    function extractGatewayUrl(response) {
        if (!response || typeof response !== 'object') return '';

        const candidate =
            response.GatewayPageURL ||
            response.GatewayPageUrl ||
            response.gatewayPageURL ||
            response.gatewayPageUrl ||
            response.redirectGatewayURL ||
            response.redirectGatewayUrl ||
            response?.data?.GatewayPageURL ||
            response?.data?.GatewayPageUrl ||
            response?.data?.gatewayPageURL ||
            response?.data?.redirectGatewayURL ||
            '';

        return typeof candidate === 'string' ? candidate.trim() : '';
    }

    function getCallbackPayload(req) {
        return { ...(req.query || {}), ...(req.body || {}) };
    }

    function numberValue(value, fallback = 0) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function sslStatusIsValid(status) {
        return ['VALID', 'VALIDATED'].includes(String(status || '').toUpperCase());
    }

    async function validateSslCommerzPayment({ tran_id, val_id, amount }) {
        if (!tran_id || !val_id) {
            return { ok: false, reason: 'missing_transaction_or_validation_id' };
        }

        const payment = await paymentCollection.findOne({ transactionId: tran_id });
        if (!payment) {
            return { ok: false, reason: 'payment_not_found' };
        }

        const validation = await sslcz().validate({ val_id });
        if (!sslStatusIsValid(validation?.status)) {
            return { ok: false, reason: 'validation_failed', validation, payment };
        }

        const validatedAmount = numberValue(validation.amount ?? amount, NaN);
        const expectedAmount = numberValue(payment.orderTotal, NaN);
        if (!Number.isFinite(validatedAmount) || !Number.isFinite(expectedAmount) || Math.abs(validatedAmount - expectedAmount) > 0.01) {
            return { ok: false, reason: 'amount_mismatch', validation, payment };
        }

        if (validation.tran_id && validation.tran_id !== tran_id) {
            return { ok: false, reason: 'transaction_mismatch', validation, payment };
        }

        return { ok: true, validation, payment };
    }

    async function markSslPaymentCompleted(tran_id, payload, validation, source) {
        const now = new Date().toISOString();
        await paymentCollection.updateOne(
            { transactionId: tran_id },
            {
                $set: {
                    paymentStatus: 'completed',
                    orderStatus: 'processing',
                    paymentMethod: payload.card_type || payload.card_issuer || 'SSLCommerz',
                    paymentType: 'sslcommerz',
                    sslValidationId: payload.val_id || validation?.val_id,
                    sslBankTranId: payload.bank_tran_id || validation?.bank_tran_id,
                    sslCardType: payload.card_type || validation?.card_type,
                    sslCardIssuer: payload.card_issuer || validation?.card_issuer,
                    sslCurrency: payload.currency || validation?.currency || 'BDT',
                    sslStatus: validation?.status || payload.status,
                    sslValidationResponse: validation,
                    paidAt: now,
                    updatedAt: now,
                    lastPaymentCallback: source
                }
            }
        );
    }

    async function markSslPaymentFailed(tran_id, paymentStatus, source, reason = '') {
        if (!tran_id) return;
        await paymentCollection.updateOne(
            { transactionId: tran_id },
            {
                $set: {
                    paymentStatus,
                    orderStatus: 'cancelled',
                    paymentFailureReason: reason,
                    lastPaymentCallback: source,
                    updatedAt: new Date().toISOString()
                }
            }
        );
    }

    app.post(['/api/payment/initiate', '/create-payment'], async (req, res) => {
        try {
            const configError = sslCommerzConfigError();
            if (configError) {
                return res.status(503).json({ success: false, message: configError });
            }

            const {
                orderItems,
                amount,
                orderTotal,
                order_total,
                subtotal,
                deliveryFee,
                tax,
                customerInfo,
                productName,
                notes
            } = req.body || {};

            const resolvedOrderTotal = numberValue(orderTotal ?? order_total ?? amount, NaN);
            const normalizedOrderItems = Array.isArray(orderItems) && orderItems.length > 0
                ? orderItems
                : [{ name: productName || 'Agromart Products', quantity: 1 }];

            if (!customerInfo?.name || !customerInfo?.email || !customerInfo?.phone) {
                return res.status(400).json({ success: false, message: 'Customer info (name, email, phone) is required.' });
            }
            if (!Number.isFinite(resolvedOrderTotal) || resolvedOrderTotal <= 0) {
                return res.status(400).json({ success: false, message: 'Valid order total is required.' });
            }

            const now = new Date().toISOString();
            const transactionId = `AGM-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const productDescription = normalizedOrderItems
                .map(item => `${item.name || 'Item'} x${item.quantity || 1}`)
                .join(', ')
                .substring(0, 255);

            const data = {
                total_amount: resolvedOrderTotal,
                currency: 'BDT',
                tran_id: transactionId,
                success_url: `${BACKEND_URL}/api/payment/success`,
                fail_url: `${BACKEND_URL}/api/payment/fail`,
                cancel_url: `${BACKEND_URL}/api/payment/cancel`,
                ipn_url: `${BACKEND_URL}/api/payment/ipn`,
                emi_option: 0,

                cus_name: customerInfo.name,
                cus_email: customerInfo.email,
                cus_add1: customerInfo.address || 'N/A',
                cus_add2: customerInfo.address2 || '',
                cus_city: customerInfo.city || customerInfo.district || 'Dhaka',
                cus_state: customerInfo.district || customerInfo.city || 'Dhaka',
                cus_postcode: customerInfo.postalCode || '1000',
                cus_country: 'Bangladesh',
                cus_phone: customerInfo.phone,
                cus_fax: customerInfo.phone,

                shipping_method: 'Courier',
                num_of_item: normalizedOrderItems.length,
                ship_name: customerInfo.name,
                ship_add1: customerInfo.address || 'N/A',
                ship_add2: customerInfo.address2 || '',
                ship_city: customerInfo.city || customerInfo.district || 'Dhaka',
                ship_state: customerInfo.district || customerInfo.city || 'Dhaka',
                ship_postcode: customerInfo.postalCode || '1000',
                ship_country: 'Bangladesh',

                product_name: productDescription || 'Agromart Products',
                product_category: 'Agricultural Products',
                product_profile: 'general',
                product_amount: numberValue(subtotal, resolvedOrderTotal),
                convenience_fee: numberValue(deliveryFee, 0) + numberValue(tax, 0),

                value_a: customerInfo.email,
                value_b: String(numberValue(deliveryFee, 0)),
                value_c: String(numberValue(tax, 0)),
                value_d: 'agromart'
            };

            await paymentCollection.insertOne({
                transactionId,
                customerInfo: {
                    name: customerInfo.name,
                    email: customerInfo.email,
                    phone: customerInfo.phone,
                    address: customerInfo.address || '',
                    city: customerInfo.city || '',
                    district: customerInfo.district || '',
                    postalCode: customerInfo.postalCode || ''
                },
                orderItems: normalizedOrderItems,
                orderTotal: resolvedOrderTotal,
                subtotal: numberValue(subtotal, resolvedOrderTotal),
                deliveryFee: numberValue(deliveryFee, 0),
                tax: numberValue(tax, 0),
                paymentMethod: 'SSLCommerz',
                paymentType: 'sslcommerz',
                paymentStatus: 'pending',
                orderStatus: 'pending',
                orderDate: now,
                notes: notes || '',
                createdAt: now,
                updatedAt: now,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            });

            const apiResponse = await sslcz().init(data);
            const gatewayUrl = extractGatewayUrl(apiResponse);

            if (gatewayUrl) {
                await paymentCollection.updateOne(
                    { transactionId },
                    {
                        $set: {
                            sslSessionKey: apiResponse.sessionkey || apiResponse.session_key || '',
                            sslInitResponse: apiResponse,
                            updatedAt: new Date().toISOString()
                        }
                    }
                );

                return res.json({
                    success: true,
                    gatewayUrl,
                    url: gatewayUrl,
                    transactionId
                });
            }

            await paymentCollection.deleteOne({ transactionId });
            return res.status(502).json({
                success: false,
                message: 'SSLCommerz could not create the payment session.',
                reason: paymentFailureReason(apiResponse),
                status: apiResponse?.status || apiResponse?.STATUS || 'unknown'
            });
        } catch (error) {
            console.error('SSLCommerz initiate error:', error);
            return res.status(500).json({ success: false, message: 'Payment initiation failed.', error: error.message });
        }
    });

    app.all('/api/payment/success', async (req, res) => {
        const payload = getCallbackPayload(req);
        const { tran_id, val_id, amount } = payload;

        try {
            const result = await validateSslCommerzPayment({ tran_id, val_id, amount });
            if (!result.ok) {
                await markSslPaymentFailed(tran_id, 'failed', 'success', result.reason);
                return res.redirect(`${FRONTEND_URL}/payment/fail?tran_id=${encodeURIComponent(tran_id || '')}&reason=${encodeURIComponent(result.reason)}`);
            }

            await markSslPaymentCompleted(tran_id, payload, result.validation, 'success');
            return res.redirect(`${FRONTEND_URL}/payment/success?tran_id=${encodeURIComponent(tran_id)}&amount=${encodeURIComponent(amount || result.validation.amount || '')}`);
        } catch (error) {
            console.error('SSLCommerz success handler error:', error);
            await markSslPaymentFailed(tran_id, 'failed', 'success', 'server_error');
            return res.redirect(`${FRONTEND_URL}/payment/fail?tran_id=${encodeURIComponent(tran_id || '')}&reason=server_error`);
        }
    });

    app.all('/api/payment/fail', async (req, res) => {
        const payload = getCallbackPayload(req);
        const tran_id = payload.tran_id;
        await markSslPaymentFailed(tran_id, 'failed', 'fail', payload.error || payload.failedreason || 'payment_failed');
        return res.redirect(`${FRONTEND_URL}/payment/fail?tran_id=${encodeURIComponent(tran_id || '')}`);
    });

    app.all('/api/payment/cancel', async (req, res) => {
        const payload = getCallbackPayload(req);
        const tran_id = payload.tran_id;
        await markSslPaymentFailed(tran_id, 'cancelled', 'cancel', 'payment_cancelled');
        return res.redirect(`${FRONTEND_URL}/payment/cancel?tran_id=${encodeURIComponent(tran_id || '')}`);
    });

    app.post(['/api/payment/ipn', '/ipn'], async (req, res) => {
        const payload = getCallbackPayload(req);
        const { tran_id, val_id, amount, status } = payload;

        try {
            if (!tran_id || !val_id) {
                return res.status(400).json({ success: false, message: 'Missing tran_id or val_id' });
            }

            if (!sslStatusIsValid(status)) {
                await markSslPaymentFailed(tran_id, 'failed', 'ipn', status || 'invalid_ipn_status');
                return res.status(200).json({ success: true });
            }

            const result = await validateSslCommerzPayment({ tran_id, val_id, amount });
            if (result.ok) {
                await markSslPaymentCompleted(tran_id, payload, result.validation, 'ipn');
            } else {
                await markSslPaymentFailed(tran_id, 'failed', 'ipn', result.reason);
            }

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('SSLCommerz IPN handler error:', error);
            return res.status(500).json({ success: false });
        }
    });

    // ==================== END SSLCOMMERZ PAYMENT INTEGRATION ====================


   // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("\n✅ Pinged your deployment. You successfully connected to MongoDB!");
    console.log("✅ Seller profile endpoints are active - Individual accounts ready!");
    console.log("✅ Payment storage endpoints are active!");
    console.log("✅ Contact message system is active!");
    console.log("✅ SSLCommerz payment gateway is active!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/',(req,res)=>{
    res.send('🌾 Agromart Server with Individual Seller Accounts, 365-Day Dynamic Pricing, Payment & Contact System');
});

app.listen(port,()=>{
    console.log(`\n🚀 Server running on port ${port}`);
    console.log(`📍 API: http://localhost:${port}`);
    console.log(`✅ Individual seller accounts enabled`);
    console.log(`✅ 365-Day Real Market Simulation active`);
    console.log(`✅ Payment storage system active`);
    console.log(`✅ Contact message system active`);
    console.log(`✅ Community forum system active\n`);
});
