const fs = require("fs");

const envFile = `
window.__ENV = {
  SUPABASE_URL: "${process.env.SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY}"
};
`;

fs.writeFileSync("./env.js", envFile);

if (process.env.TURNLY_EMAIL_SETUP_CHECK === '1') {
  require('./scripts/check-referral-email.cjs')().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
