// Centralized app configuration and constants

const REQUIRED_PORT = 3009;

function getRequiredPort() {
  const port = process.env.PORT || REQUIRED_PORT;
  return Number(port);
}

function validateRequiredPortOrExit() {
  const port = getRequiredPort();
  if (port !== REQUIRED_PORT) {
    console.error(`ERROR: This application MUST run on port ${REQUIRED_PORT}. Attempted port: ${port}`);
    console.error('Portfolio app requires fixed port 3009 for proper operation.');
    process.exit(1);
  }
  return port;
}

function isMarketEnabled() {
  return process.env.MARKET_ENABLE === '1';
}

function getSessionSecretOrExit() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error('SESSION_SECRET is required');
    process.exit(1);
  }
  return secret;
}

const CACHE_TTL = Object.freeze({
  stock: 15 * 60 * 1000, // 15 minutes
  fx: 5 * 60 * 1000, // 5 minutes
});

module.exports = {
  REQUIRED_PORT,
  getRequiredPort,
  validateRequiredPortOrExit,
  isMarketEnabled,
  getSessionSecretOrExit,
  CACHE_TTL,
};

