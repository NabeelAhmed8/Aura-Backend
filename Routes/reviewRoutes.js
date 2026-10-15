const express = require('express');
const router = express.Router();
const Review = require('../models/Review');

// 1. GET: Fetch all reviews for a product
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    const reviews = await Review.find({ productId }).sort({ createdAt: -1 });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? (reviews.reduce((acc, rev) => acc + (rev.rating || 5), 0) / totalReviews).toFixed(1)
      : '0.0';

    res.status(200).json({
      success: true,
      totalReviews,
      averageRating: Number(averageRating),
      reviews,
    });
  } catch (error) {
    console.error('Fetch Reviews Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. POST: Submit a new review
router.post('/', async (req, res) => {
  try {
    const { productId, author, rating, comment, verified } = req.body;

    if (!productId || !author || !rating || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, author name, rating (1-5), and review comment are required.',
      });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5.',
      });
    }

    const newReview = new Review({
      productId,
      author: author.trim(),
      rating: Math.round(numRating),
      comment: comment.trim(),
      verified: verified !== undefined ? Boolean(verified) : true,
    });

    const savedReview = await newReview.save();

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully!',
      review: savedReview,
    });
  } catch (error) {
    console.error('Submit Review Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. DELETE: Remove a review
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }
    res.status(200).json({ success: true, message: 'Review deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
