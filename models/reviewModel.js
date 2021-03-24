const mongoose = require('mongoose');
const Tour = require('./tourModel');

const model = {
  review: {
    type: String,
    required: [true, 'A review can not be empty'],
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  tour: {
    type: mongoose.Schema.ObjectId,
    ref: 'Tour',
    required: [true, 'Review must belong to a tour'],
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Review must belong to a user'],
  },
};

const options = {
  toJSON: {
    virtuals: true,
  },
  toObject: {
    virtuals: true,
  },
};

const reviewSchema = mongoose.Schema(model, options);

// We created this index to avoid user to create several reviews on a tour, the tour-user combination must be unique
reviewSchema.index({ tour: 1, user: 1 }, { unique: true });

reviewSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name photo',
  });

  next();
});

/* STATIC METHOD */
reviewSchema.statics.calcAverageRatings = async function (tourId) {
  //In static method, 'this' points to the model not an instance
  const stats = await this.aggregate([
    {
      $match: { tour: tourId }, // Get tours that match by a id
    },
    {
      $group: {
        _id: 'tour',
        nRatings: { $sum: 1 }, //Count of ratings
        avgRating: { $avg: '$rating' }, //average of the ratings values
      },
    },
  ]);

  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRatings,
      ratingsAverage: stats[0].avgRating,
    });
  } else {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: 0,
      ratingsAverage: 4.5,
    });
  }
};

/**
 * Document Middleware
 * Used to calculate Tour's Ratings average and quantity after a new tour is CREATED
 */
reviewSchema.post('save', function () {
  // 'this' points to current review
  this.constructor.calcAverageRatings(this.tour);
});

/**
 * Query Middleware
 * Used to calculate Tour's Ratings average and quantity after a review is UPDATE/DELETED
 * Created new 'r' property on document to store current document, which will be processed by 'post' middleware stage
 * Can't use calcAverageRatings in this stage becasue the document doesnt have the updated data, it has the old one
 */
reviewSchema.pre(/^findOneAnd/, async function (next) {
  this.r = await this.findOne();
  next();
});

reviewSchema.post(/^findOneAnd/, async function () {
  await this.r.constructor.calcAverageRatings(this.r.tour);
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
