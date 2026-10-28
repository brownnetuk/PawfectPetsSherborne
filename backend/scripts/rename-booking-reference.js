// One-off fix-up: renames a Boarding & Day Care booking's reference (e.g. a
// booking that got BK01000 because Settings > Booking reference's "Next
// reference" was set to 1000 by mistake) and every place that reference was
// copied into as text. Invoices, payments etc. link to the booking by id, so
// they follow automatically; the Activity log is left as history.
//
// Dry run by default -- prints what it would change. Add --apply to write.
//
// Usage: node scripts/rename-booking-reference.js BK01000 BK00015 [--next 16] [--apply]
//   --next N  also sets Settings > Booking reference's "Next reference" to N
//             (refused if a booking already uses that number or higher).
require('dotenv').config({ quiet: true });
const dns = require('dns');
const mongoose = require('mongoose');

// Some local/ISP DNS resolvers don't support the SRV/TXT lookups that
// mongodb+srv:// URIs rely on — see backend/README.md.
dns.setServers(['1.1.1.1', '8.8.8.8']);

function parseArgs(argv) {
  const args = { apply: false, next: undefined, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') args.apply = true;
    else if (argv[i] === '--next') args.next = Number(argv[++i]);
    else args.positional.push(argv[i]);
  }
  return args;
}

// Replaces every occurrence of `from` in any string nested inside `value`.
function replaceDeep(value, from, to) {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((v) => replaceDeep(v, from, to));
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceDeep(v, from, to)]));
  }
  return value;
}

// The trailing digits of a reference, e.g. BK01000 -> 1000.
function seqOf(reference) {
  const m = /(\d+)$/.exec(reference || '');
  return m ? Number(m[1]) : undefined;
}

async function main() {
  const { apply, next, positional } = parseArgs(process.argv.slice(2));
  const [from, to] = positional;
  if (!from || !to || (next !== undefined && !(Number.isInteger(next) && next >= 1))) {
    console.error('Usage: node scripts/rename-booking-reference.js <old-ref> <new-ref> [--next N] [--apply]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set (check your .env file).');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const bookings = db.collection('boardingbookings');
  const submissions = db.collection('formsubmissions');
  const notifications = db.collection('customernotifications');
  const auditLog = db.collection('auditlogentries');
  const businessInfo = db.collection('businessinfos');

  const booking = await bookings.findOne({ reference: from });
  if (!booking) throw new Error(`No booking with reference ${from}.`);
  if (await bookings.findOne({ reference: to })) throw new Error(`${to} is already used by another booking.`);

  console.log(apply ? 'APPLYING changes' : 'DRY RUN (add --apply to write)');
  console.log(`Booking ${booking._id}: ${from} -> ${to}`);

  // The "confirmation sent" tick is back-filled from the Activity log by
  // matching the reference, so pin it on the booking before the rename.
  let sentAt = booking.confirmationSentAt;
  if (!sentAt) {
    const entry = await auditLog.findOne(
      { customer: booking.customer, title: 'Booking confirmation emailed', description: { $regex: `^${from} ` } },
      { sort: { createdAt: -1 } },
    );
    sentAt = entry?.createdAt;
    if (sentAt) console.log(`  confirmationSentAt back-filled from Activity log: ${sentAt.toISOString()}`);
  }

  // Form submissions tied to this booking (pre-check-in, check-in/out,
  // incident reports) carry the reference in their name and field labels.
  const submissionIds = [
    booking.preCheckInSubmission,
    booking.checkInSubmission,
    booking.checkOutSubmission,
    ...(booking.incidentReports || []),
  ].filter(Boolean);
  const subs = await submissions
    .find({ $or: [{ _id: { $in: submissionIds } }, { forBooking: booking._id }] })
    .toArray();
  const subUpdates = [];
  for (const s of subs) {
    const set = {};
    for (const key of ['formName', 'formDescription', 'formFieldsSnapshot']) {
      if (s[key] === undefined) continue;
      const replaced = replaceDeep(s[key], from, to);
      if (JSON.stringify(replaced) !== JSON.stringify(s[key])) set[key] = replaced;
    }
    if (Object.keys(set).length) {
      subUpdates.push({ _id: s._id, set });
      console.log(`  form submission ${s._id} "${s.formName}": ${Object.keys(set).join(', ')}`);
    }
  }

  const notes = await notifications.find({ customer: booking.customer, reference: from }).toArray();
  for (const n of notes) console.log(`  customer notification ${n._id}`);

  // Counter check: what's the highest number any other booking already uses?
  const info = await businessInfo.findOne({});
  const others = await bookings.find({ _id: { $ne: booking._id } }, { projection: { reference: 1 } }).toArray();
  const maxOther = Math.max(0, ...others.map((b) => seqOf(b.reference) || 0));
  const highest = Math.max(maxOther, seqOf(to) || 0);
  console.log(`  current "Next reference": ${info?.bookingRefNextNumber}, highest in use after rename: ${highest}`);
  if (next !== undefined && next <= highest) {
    throw new Error(`--next ${next} would reissue an existing number (highest in use is ${highest}).`);
  }
  if (next !== undefined) console.log(`  "Next reference" -> ${next}`);
  else if ((info?.bookingRefNextNumber || 1) <= highest) {
    console.log(`  WARNING: "Next reference" is not above ${highest} -- pass --next ${highest + 1}.`);
  }

  if (!apply) {
    console.log('Nothing written.');
    return;
  }

  await bookings.updateOne(
    { _id: booking._id },
    { $set: { reference: to, ...(sentAt && !booking.confirmationSentAt ? { confirmationSentAt: sentAt } : {}) } },
  );
  for (const u of subUpdates) await submissions.updateOne({ _id: u._id }, { $set: u.set });
  if (notes.length) await notifications.updateMany({ _id: { $in: notes.map((n) => n._id) } }, { $set: { reference: to } });
  if (next !== undefined) await businessInfo.updateOne({ _id: info._id }, { $set: { bookingRefNextNumber: next } });
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
