const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  streetAddress: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, default: '' },
  postalCode: { type: String, default: '' },
  country: { type: String, default: 'Pakistan' },
  isDefault: { type: Boolean, default: false }
});

const paymentMethodSchema = new mongoose.Schema({
  methodType: { type: String, required: true }, // 'JazzCash', 'EasyPaisa', 'BankTransfer', 'Stripe', 'COD'
  title: { type: String, default: '' },          // e.g. 'JazzCash Mobile Account', 'Meezan Bank 1Link'
  accountNumber: { type: String, required: true }, // Mobile #, IBAN, or Card Number
  accountHolder: { type: String, default: '' },
  isDefault: { type: Boolean, default: false }
});

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  products: [{
    productId: String,
    title: String,
    quantity: Number,
    size: String,
    color: String,
    price: Number
  }],
  totalAmount: Number,
  orderDate: { type: Date, default: Date.now },
  orderStatus: { type: String, default: 'Processing' }, // Processing, Shipped, Delivered, Cancelled
  shippingAddress: addressSchema,
  trackingNumber: String,
  paymentStatus: { type: String, default: 'Paid' },
  refundStatus: { type: String, default: 'None' }
});

const userSchema = new mongoose.Schema({
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  
  addresses: [addressSchema],
  
  shoppingPreferences: {
    savedSizes: { type: [String], default: [] },
    savedColors: { type: [String], default: [] },
    recentlyViewed: { type: [String], default: [] }
  },

  orders: [orderSchema],

  paymentMethods: [paymentMethodSchema],

  settings: {
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    newsletter: { type: Boolean, default: true },
    language: { type: String, default: 'English' },
    currency: { type: String, default: 'USD' }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);