const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const Agent = require('../models/agent');
const LOB = require('../models/lob');
const Carrier = require('../models/carrier');
const User = require('../models/user');
const Account = require('../models/account');
const Policy = require('../models/policy');

// Helpers to clean values from the file
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
const toDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
};
const userKey = (email, firstName) => `${email}|${firstName}`;

// Save unique names (agents, LOBs, carriers) and return a map: name -> _id
async function upsertByName(Model, field, values) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length) {
    await Model.bulkWrite(
      unique.map((v) => ({
        updateOne: { filter: { [field]: v }, update: { $setOnInsert: { [field]: v } }, upsert: true },
      })),
      { ordered: false }
    );
  }
  const docs = await Model.find({ [field]: { $in: unique } }).lean();
  return new Map(docs.map((d) => [d[field], d._id]));
}

async function run() {
  const { filePath, mongoUri } = workerData;

  // A worker thread needs its own DB connection
  await mongoose.connect(mongoUri);

  // Read the file (CSV or XLSX)
  const isCsv = path.extname(filePath).toLowerCase() === '.csv';
  const workbook = XLSX.readFile(filePath, { raw: isCsv, cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  // Clean each row and skip rows missing required values
  const rows = [];
  const skippedRows = [];
  rawRows.forEach((r, index) => {
    const row = {
      agent: clean(r.agent),
      firstName: clean(r.firstname),
      email: clean(r.email).toLowerCase(),
      accountName: clean(r.account_name),
      category: clean(r.category_name),
      company: clean(r.company_name),
      policyNumber: clean(r.policy_number),
      startDate: toDate(r.policy_start_date),
      endDate: toDate(r.policy_end_date),
      premium: Number(r.premium_amount) || 0,
      dob: toDate(r.dob),
      address: clean(r.address),
      phone: clean(r.phone),
      state: clean(r.state),
      zip: clean(r.zip),
      gender: clean(r.gender) || null,
      userType: clean(r.userType),
    };
    const valid = row.firstName && row.policyNumber && row.category && row.company && row.startDate && row.endDate;
    if (valid) rows.push(row);
    else skippedRows.push(index + 2); // +2 = header row + 1-based line number
  });

  // 1) Small lookup collections first
  const agentMap = await upsertByName(Agent, 'agentName', rows.map((r) => r.agent));
  const lobMap = await upsertByName(LOB, 'category_name', rows.map((r) => r.category));
  const carrierMap = await upsertByName(Carrier, 'company_name', rows.map((r) => r.company));

  // 2) Users (unique by email + firstName)
  await User.bulkWrite(
    rows.map((r) => ({
      updateOne: {
        filter: { email: r.email, firstName: r.firstName },
        update: {
          $set: {
            dob: r.dob, address: r.address, phone: r.phone, state: r.state,
            zip: r.zip, gender: r.gender, userType: r.userType,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  const users = await User.find({}, { email: 1, firstName: 1 }).lean();
  const userMap = new Map(users.map((u) => [userKey(u.email, u.firstName), u._id]));

  // 3) Accounts (linked to user)
  const accountOps = rows
    .filter((r) => r.accountName)
    .map((r) => {
      const userId = userMap.get(userKey(r.email, r.firstName));
      return {
        updateOne: {
          filter: { accountName: r.accountName, userId },
          update: { $setOnInsert: { accountName: r.accountName, userId } },
          upsert: true,
        },
      };
    });
  if (accountOps.length) await Account.bulkWrite(accountOps, { ordered: false });

  // 4) Policies (linked to category, company, user, agent)
  await Policy.bulkWrite(
    rows.map((r) => ({
      updateOne: {
        filter: { policyNumber: r.policyNumber },
        update: {
          $set: {
            policyStartDate: r.startDate,
            policyEndDate: r.endDate,
            premiumAmount: r.premium,
            categoryId: lobMap.get(r.category),
            companyId: carrierMap.get(r.company),
            userId: userMap.get(userKey(r.email, r.firstName)),
            agentId: agentMap.get(r.agent),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await mongoose.disconnect();

  return {
    totalRows: rawRows.length,
    imported: rows.length,
    skippedRows,
    agents: agentMap.size,
    lobs: lobMap.size,
    carriers: carrierMap.size,
    users: userMap.size,
  };
}

run()
  .then((summary) => parentPort.postMessage({ ok: true, summary }))
  .catch((err) => parentPort.postMessage({ ok: false, error: err.message }))
  .finally(() => fs.unlink(workerData.filePath, () => {})); // delete the uploaded file after use