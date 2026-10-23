const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Product = require('./models/Product');

// MongoDB Connection string (Atlas Cloud or Local)
const MONGO_URI = process.env.ATLAS_URI || process.env.MONGO_URI;

// Curated Luxury Products for AURA Atelier
const sampleProducts = [
  {
    name: "Oversized Wool Trench Coat",
    price: 340,
    category: "Men",
    image: "https://images.unsplash.com/photo-1544441893-675973e31985?q=80&w=900&auto=format&fit=crop",
    description: "Tailored from heavy Italian virgin wool with a relaxed silhouette, storm flap, and horn buttons.",
    stock: 12,
    inStock: true,
    isNewArrival: true
  },
  {
    name: "Sculpted Atelier Blazer",
    price: 280,
    category: "Women",
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=900&auto=format&fit=crop",
    description: "Sharp, defined shoulders with a subtly nipped waist and minimalist peak lapels.",
    stock: 15,
    inStock: true,
    isNewArrival: true
  },
  {
    name: "Heavyweight Boxy Hoodie",
    price: 160,
    category: "Men",
    image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?q=80&w=900&auto=format&fit=crop",
    description: "500 GSM French terry cotton with drop shoulders and hidden kangaroo pocket construction.",
    stock: 20,
    inStock: true,
    isNewArrival: false
  },
  {
    name: "Silk Charmeuse Evening Gown",
    price: 390,
    category: "Women",
    image: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?q=80&w=900&auto=format&fit=crop",
    description: "100% Mulberry silk slip dress with fluid drape, cowl neckline, and subtle side slit.",
    stock: 8,
    inStock: true,
    isNewArrival: true
  },
  {
    name: "Pleated Wide-Leg Trousers",
    price: 195,
    category: "Men",
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?q=80&w=900&auto=format&fit=crop",
    description: "Double front pleats with extended waistband tabs cut in breathable tropical wool.",
    stock: 18,
    inStock: true,
    isNewArrival: false
  },
  {
    name: "Cashmere Ribbed Knit",
    price: 240,
    category: "Women",
    image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=900&auto=format&fit=crop",
    description: "Ultra-soft Mongolian grade-A cashmere in an effortless boxy fit with ribbed hems.",
    stock: 10,
    inStock: true,
    isNewArrival: false
  },
  {
    name: "Full-Grain Leather Minimalist Tote",
    price: 320,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=900&auto=format&fit=crop",
    description: "Vegetable-tanned calfskin with hand-painted raw edges and magnetic closure.",
    stock: 14,
    inStock: true,
    isNewArrival: true
  },
  {
    name: "Brushed Solid Signet Ring",
    price: 110,
    category: "Accessories",
    image: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=900&auto=format&fit=crop",
    description: "Handcrafted 925 sterling silver with a satin brushed rectangular face.",
    stock: 25,
    inStock: true,
    isNewArrival: false
  }
];

async function seedDatabase() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('MongoDB Atlas Connected Successfully!');

    console.log('Clearing existing products in database...');
    await Product.deleteMany({});

    console.log(`Inserting ${sampleProducts.length} AURA products into Atlas...`);
    const inserted = await Product.insertMany(sampleProducts);
    console.log(`Successfully added ${inserted.length} products to MongoDB Atlas!`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error.message);
    process.exit(1);
  }
}

seedDatabase();
