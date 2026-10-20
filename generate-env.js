const fs = require("fs");

const envFile = `
window.__ENV = {
  SUPABASE_URL: "${process.env.SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${process.env.SUPABASE_ANON_KEY}"
};
`;

fs.writeFileSync("./env.js", envFile);
fs.mkdirSync('./assets/vendor',{recursive:true});
fs.copyFileSync('./node_modules/@twilio/voice-sdk/dist/twilio.min.js','./assets/vendor/twilio-voice-2.18.5.min.js');

if (process.env.TURNLY_EMAIL_SETUP_CHECK === '1') {
  require('./scripts/check-referral-email.cjs')().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
