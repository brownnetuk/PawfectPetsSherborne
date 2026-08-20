// One-off bootstrap: creates (or updates the password of) a staff login.
// There's no open self-registration endpoint — new staff accounts are added
// by an already-logged-in staff member via the dashboard, and the very first
// account is created by running this script directly on the server.
//
// Usage: node scripts/seed-staff.js "Jane Staff" jane@pawfectpets.example "some-password"
require('dotenv').config({ quiet: true });
const dns = require('dns');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Some local/ISP DNS resolvers don't support the SRV/TXT lookups that
// mongodb+srv:// URIs rely on — see backend/README.md.
dns.setServers(['1.1.1.1', '8.8.8.8']);

async function main() {
  const [, , name, email, password] = process.argv;
  if (!name || !email || !password) {
    console.error('Usage: node scripts/seed-staff.js "<name>" <email> <password>');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set (check your .env file).');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const staffSchema = new mongoose.Schema(
    { name: String, email: { type: String, unique: true, lowercase: true }, passwordHash: String },
    { timestamps: true },
  );
  const Staff = mongoose.model('Staff', staffSchema);

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await Staff.findOneAndUpdate(
    { email: email.toLowerCase() },
    { name, email: email.toLowerCase(), passwordHash },
    { upsert: true, returnDocument: 'after' },
  );

  console.log(`Staff account ready: ${staff.email} (${staff._id})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
