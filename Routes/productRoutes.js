const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// 1. GET: Saare products fetch karne ke liye (supports ?isNewArrival=true/false)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.isNewArrival !== undefined) {
      filter.isNewArrival = req.query.isNewArrival === 'true';
    }
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET: Dedicated New Arrivals endpoint (HAMESHA /:id se UPAR)
router.get('/new-arrivals', async (req, res) => {
  try {
    const products = await Product.find({ isNewArrival: true }).sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. DELETE ALL: Saare purane products ek sath delete karne ke liye (HAMESHA /:id se UPAR)
router.delete('/delete-all-products', async (req, res) => {
  try {
    const result = await Product.deleteMany({});
    res.status(200).json({ 
      success: true, 
      message: `All old products deleted successfully! (${result.deletedCount} items removed)` 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST (Single): Ek product add karne ke liye
router.post('/add', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    const savedProduct = await newProduct.save();
    res.status(201).json({ success: true, product: savedProduct });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. POST (Bulk): Ek sath multiple products add karne ke liye
router.post('/bulk', async (req, res) => {
  try {
    const savedProducts = await Product.insertMany(req.body);
    res.status(201).json({ 
      success: true,
      message: `${savedProducts.length} products added successfully!`, 
      products: savedProducts 
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5. GET (Single): Single product detail dekhne ke liye (Product Details page ke liye)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    res.status(200).json(product);
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid product ID" });
  }
});

// 6. PUT: Product update karne ke liye
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
    res.status(200).json({ success: true, message: "Product updated successfully!", updatedProduct });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7. DELETE (Single): Specific product ID se delete karne ke liye
router.delete('/:id', async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    res.status(200).json({ success: true, message: "Product deleted successfully!", deletedProduct });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;