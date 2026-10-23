const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String },
  stock: {
    type: Number,
    default: 10,
    min: [0, 'Stock cannot be negative']
  },
  inStock: {
    type: Boolean,
    default: true
  },
  isNewArrival: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for high-speed queries and sorting
productSchema.index({ createdAt: -1 });
productSchema.index({ isNewArrival: 1, createdAt: -1 });
productSchema.index({ category: 1 });

// Agar stock 0 ho toh inStock ko automatically false set karein
productSchema.pre('save', function (next) {
  if (typeof this.stock === 'number' && this.stock <= 0) {
    this.inStock = false;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
