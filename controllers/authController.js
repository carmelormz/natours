const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  res.cookie('jwt', token, cookieOptions);

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

/**
 * Route hanlder that sign up a new user into the DB.
 * Returns new JWT token
 */
exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);
  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 201, res);
});

/**
 * Route handler to login user
 * Creates new JWT
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  //1. Check if email and password exists
  if (!email || !password) {
    return next(new AppError('Please provide an email and password'));
  }

  //2. Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.isCorrectPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password.', 401));
  }
  //3. If everything okay, send token to client
  createSendToken(user, 200, res);
});

/**
 * Auth Middleware that validates if user is correctly authenticated by validating JWT
 */
exports.protect = catchAsync(async (req, res, next) => {
  // 1. Getting token and check if exists
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('User not logged in! Please log in to get access.', 401)
    );
  }

  // 2. Verify token
  const payloadDecoded = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET
  );

  // 3. Check if user still exists
  const user = await User.findById(payloadDecoded.id);

  if (!user) {
    return next(
      new AppError(
        'The user belonging to this token does not longer exist',
        401
      )
    );
  }

  // 4. Check if user changed passwords after the token was issued
  if (user.hasPasswordChangedAfter(payloadDecoded.iat)) {
    return next(
      new AppError('User recenlty changed password. Please log in again.', 401)
    );
  }

  //Grant access to protected route
  req.user = user;
  res.locals.user = user;
  next();
});

/**
 * Auth Middleware that validates if user is logged in
 * Only for rednered pages
 */
exports.isLoggedIn = async (req, res, next) => {
  // 1. Getting token and check if exists
  if (req.cookies.jwt) {
    try {
      // 2. Verify token
      const payloadDecoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 3. Check if user still exists
      const user = await User.findById(payloadDecoded.id);

      if (!user) {
        return next();
      }

      // 4. Check if user changed passwords after the token was issued
      if (user.hasPasswordChangedAfter(payloadDecoded.iat)) {
        return next();
      }

      // There is a logged user
      res.locals.user = user;
      return next();
    } catch (err) {
      return next();
    }
  }

  next();
};

/**
 * Controller method to logout user
 * @param {*} req
 * @param {*} res
 */
exports.logout = (req, res) => {
  res.cookie('jwt', '', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({ status: 'success' });
};

/**
 * Middleware that returns route hanlder to restrict access to resources to certain user's roles
 * @param  {...any} roles
 * @returns
 */
exports.restrictTo = (...roles) => (req, res, next) => {
  //Role is inside user object because it was defined before on the protect middleware.
  if (!roles.includes(req.user.role)) {
    return next(
      new AppError('User does not have permission to perform this action', 403)
    );
  }

  next();
};

/**
 * Forgot password function that creates a random tokena and sends it to the user's email.
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1. Get user based on POST email
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(
      new AppError('There is no user with the provided email address.', 404)
    );
  }

  // 2. Generate randome reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3. Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to user email.',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Try again later.',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1. Get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2. If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired.', 400));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();
  // 3. Update changePasswordAt property for the user

  // 4. Log the user in, send JWT
  createSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1. Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2. Check if password is correct
  if (
    !(await user.isCorrectPassword(req.body.passwordCurrent, user.password))
  ) {
    return next(new AppError('Incorrect password.', 401));
  }

  // 3. If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4. Log user in, send JWT
  createSendToken(user, 200, res);
});
