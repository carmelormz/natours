/**
 * Method that centralize try catch blocks, receives function to wrap
 * @param {*} func
 */
module.exports = (func) => (req, res, next) => func(req, res, next).catch(next);
