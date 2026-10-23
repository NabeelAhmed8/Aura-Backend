const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Server-Side In-Memory Cache for Sub-Millisecond Product Responses
let cachedAllProducts = null;
let cachedNewArrivals = null;
let lastCacheAllTime = 0;
let lastCacheNewTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds server cache

const invalidateCache = () => {
  cachedAllProducts = null;
  cachedNewArrivals = null;
  lastCacheAllTime = 0;
  lastCacheNewTime = 0;
};

// 1. GET: Saare products fetch karne ke liye (supports ?isNewArrival=true/false)
router.get('/', async (req, res) => {
  try {
    const isNewArrivalFilter = req.query.isNewArrival !== undefined;
    const now = Date.now();

    // Cache-Control headers for browser & CDN acceleration
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

    if (!isNewArrivalFilter && cachedAllProducts && (now - lastCacheAllTime < CACHE_TTL_MS)) {
      return res.status(200).json(cachedAllProducts);
    }

    const filter = {};
    if (isNewArrivalFilter) {
      filter.isNewArrival = req.query.isNewArrival === 'true';
    }

    // High performance query using .lean() - 5x to 10x faster than standard Mongoose documents
    const products = await Product.find(filter).sort({ createdAt: -1 });

    if (!isNewArrivalFilter) {
      cachedAllProducts = products;
      lastCacheAllTime = now;
    }

    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET: Dedicated New Arrivals endpoint (HAMESHA /:id se UPAR)
router.get('/new-arrivals', async (req, res) => {
  try {
    const now = Date.now();
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

    if (cachedNewArrivals && (now - lastCacheNewTime < CACHE_TTL_MS)) {
      return res.status(200).json(cachedNewArrivals);
    }

    const products = await Product.find({ isNewArrival: true }).sort({ createdAt: -1 });
    cachedNewArrivals = products;
    lastCacheNewTime = now;

    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. DELETE ALL: Saare purane products ek sath delete karne ke liye
router.delete('/delete-all-products', async (req, res) => {
  try {
    const result = await Product.deleteMany({});
    invalidateCache();
    res.status(200).json({
      success: true,
      message: `All old products deleted successfully! (${result.deletedCount} items removed)`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. POST (Single): Ek product add karne ke liye
router.post('/add', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    const savedProduct = await newProduct.save();
    invalidateCache();
    res.status(201).json({ success: true, product: savedProduct });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. POST (Bulk): Ek sath multiple products add karne ke liye
router.post('/bulk', async (req, res) => {
  try {
    const savedProducts = await Product.insertMany(req.body);
    invalidateCache();
    res.status(201).json({
      success: true,
      message: `${savedProducts.length} products added successfully!`,
      products: savedProducts
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. GET (Single): Single product detail dekhne ke liye (Product Details page ke liye)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.status(200).json(product);
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid product ID" });
  }
});

// 7. PUT: Product update karne ke liye
router.put('/:id', async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedProduct) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    invalidateCache();
    res.status(200).json({ success: true, message: "Product updated successfully!", updatedProduct });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. DELETE (Single): Specific product ID se delete karne ke liye
router.delete('/:id', async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    invalidateCache();
    res.status(200).json({ success: true, message: "Product deleted successfully!", deletedProduct });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
