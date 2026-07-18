const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    requesterUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requesterUsername: { type: String, trim: true },
    sessionDateTime: { type: Date, required: true },
    service: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', BookingSchema);
