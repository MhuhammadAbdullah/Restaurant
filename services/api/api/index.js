// Vercel function entry: loads the compiled Nest app produced by `nest build`.
module.exports = require("../dist/serverless").default;
