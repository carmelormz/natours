const mongoose = require('mongoose');
const slugify = require('slugify');
//const User = require('./userModel');

const model = {
  name: {
    type: String,
    required: [true, 'A tour must have a name'],
    unique: true,
    maxlength: [40, 'A tour name must be less or equal than 40 characters.'],
    minlength: [10, 'A tour name must be at least 10 characters'],
  },
  slug: String,
  duration: {
    type: Number,
    required: [true, 'A tour must have a duration'],
  },
  maxGroupSize: {
    type: Number,
    required: [true, 'A tour must have a group size'],
  },
  difficulty: {
    type: String,
    required: [true, 'A tour must have a difficulty'],
    enum: {
      values: ['easy', 'medium', 'difficult'],
      message:
        'A tour difficulty must be one of the following values: easy, medium or difficult',
    },
  },
  price: {
    type: Number,
    required: [true, 'A tour must have a price'],
  },
  ratingsAverage: {
    type: Number,
    default: 4.5,
    min: [1, 'A tour rating must be above 0.0'],
    max: [5, 'A tour rating must be at most 5.0'],
    set: (val) => Math.round(val * 10) / 10,
  },
  ratingsQuantity: {
    type: Number,
    default: 0,
  },
  priceDiscount: {
    type: Number,
    validate: {
      message:
        'A tour price discount ({VALUE}) cannot be greater than the tour price',
      /* Validators only work when a NEW document is created, really ?????*/
      validator: function (val) {
        return val < this.price;
      },
    },
  },
  summary: {
    type: String,
    trim: true,
    required: [true, 'A tour must have a summary'],
  },
  description: {
    type: String,
    trim: true,
  },
  imageCover: {
    type: String,
    required: [true, 'A tour must have a cover image'],
  },
  images: [String],
  createdAt: {
    type: Date,
    default: Date.now(),
    select: false,
  },
  startDates: [Date],
  secretTour: {
    type: Boolean,
    default: false,
  },
  startLocation: {
    //GeoJSON
    type: {
      type: String,
      default: 'Point',
      enum: ['Point'],
    },
    // LAT - LONG
    coordinates: [Number],
    address: String,
    description: String,
  },
  locations: [
    {
      type: {
        type: String,
        default: 'Point',
        enum: ['Point'],
      },
      coordinates: [Number],
      address: String,
      description: String,
      day: Number,
    },
  ],
  // WHEN EMBEDDING -> guides: Array,
  // By Referencing
  guides: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
};

const options = {
  toJSON: {
    virtuals: true,
  },
  toObject: {
    virtuals: true,
  },
};

const tourSchema = new mongoose.Schema(model, options);

tourSchema.index({ price: 1, ratingsAverage: -1 });
tourSchema.index({ slug: 1 });
tourSchema.index({ startLocation: '2dsphere' });

/**
 * VIRTUAL PROPERTY
 * NOT persisted in DB. Cannot be used for querying DB
 */
tourSchema.virtual('durationWeeks').get(function () {
  return this.duration / 7;
});

/**
 * Virtual Populate
 */
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour',
  localField: '_id',
});

/**
 * DOCUMENT MIDDLWARE
 * Runs BEFORE an event, only works for .save() and .create() event
 */
tourSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

/*
EXAMPLE ON EMBEDDING USERS INTO TOURS
tourSchema.pre('save', async function (next) {
  const guidesPromises = this.guides.map(async (id) => await User.findById(id));
  this.guides = await Promise.all(guidesPromises);
  next();
});
*/

/*tourSchema.post('save', function (doc, next) {
  console.log(doc);
  next();
});*/

/**
 * QUERY MIDDLEWARE
 * Runs BEFORE any query that starts with "find", doesn't returns secrete tours
 */
tourSchema.pre(/^find/g, function (next) {
  this.find({ secretTour: { $ne: true } });
  next();
});

tourSchema.pre(/^find/, function (next) {
  // 'this' points to the current query
  this.populate({
    path: 'guides',
    select: '-__v -passwordChangedAt',
  });
  next();
});

/**
 * AGGREGATION MIDDLEWARE
 * Hide secrete tours before running any aggregation pipeline
 */
/* tourSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({ $match: { secretTour: { $ne: true } } });
  next();
}); */

const Tour = mongoose.model('Tour', tourSchema);

module.exports = Tour;
