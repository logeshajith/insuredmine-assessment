const User = require('../models/user');
const Policy = require('../models/policy');
const Account = require('../models/account');
const Lob = require('../models/lob');
const Carrier = require('../models/carrier');
const Agent = require('../models/agent');

// Makes special characters safe inside a search (e.g. "O'Neil", "A+B")
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/policies/search?username=Lura
exports.searchByUsername = async (req, res) => {
  const username = (req.query.username || '').trim();
  if (username.length < 2) {
    return res.status(400).json({ error: 'Query parameter "username" is required (min 2 characters)' });
  }

  // 1) Find matching users (case-insensitive, partial match)
  const users = await User.find({ firstName: { $regex: escapeRegex(username), $options: 'i' } })
    .limit(50)
    .lean();

  if (!users.length) {
    return res.status(404).json({ error: `No user found matching "${username}"` });
  }

  const userIds = users.map((u) => u._id);

  // 2) Get their policies and accounts, with names instead of just IDs
  const [policies, accounts] = await Promise.all([
    Policy.find({ userId: { $in: userIds } })
      .populate('categoryId', 'category_name')
      .populate('companyId', 'company_name')
      .populate('agentId', 'agentName')
      .sort({ policyStartDate: 1 })
      .lean(),
    Account.find({ userId: { $in: userIds } }).lean(),
  ]);

  // 3) Group policies and accounts under each user
  const results = users.map((user) => ({
    user: {
      id: user._id,
      firstName: user.firstName,
      email: user.email,
      dob: user.dob,
      phone: user.phone,
      address: user.address,
      state: user.state,
      zip: user.zip,
      gender: user.gender,
      userType: user.userType,
    },
    accounts: accounts
      .filter((a) => String(a.userId) === String(user._id))
      .map((a) => a.accountName),
    policies: policies
      .filter((p) => String(p.userId) === String(user._id))
      .map((p) => ({
        policyNumber: p.policyNumber,
        policyStartDate: p.policyStartDate,
        policyEndDate: p.policyEndDate,
        premiumAmount: p.premiumAmount,
        category: p.categoryId?.category_name || null,
        company: p.companyId?.company_name || null,
        agent: p.agentId?.agentName || null,
      })),
  }));

  res.json({ count: results.length, results });
};

// GET /api/policies/summary?page=1&limit=20
exports.aggregateByUser = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const [output] = await Policy.aggregate([
    // Join category and company names (like SQL JOIN)
    { $lookup: { from: 'lobs', localField: 'categoryId', foreignField: '_id', as: 'category' } },
    { $lookup: { from: 'carriers', localField: 'companyId', foreignField: '_id', as: 'company' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },

    // Group all policies by user (like SQL GROUP BY)
    {
      $group: {
        _id: '$userId',
        totalPolicies: { $sum: 1 },
        totalPremium: { $sum: '$premiumAmount' },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            category: '$category.category_name',
            company: '$company.company_name',
            policyStartDate: '$policyStartDate',
            policyEndDate: '$policyEndDate',
            premiumAmount: '$premiumAmount',
          },
        },
      },
    },

    // Add user details
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },

    { $sort: { totalPolicies: -1, 'user.firstName': 1 } },

    // Total count + one page of data, in a single query
    {
      $facet: {
        meta: [{ $count: 'totalUsers' }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              userId: '$_id',
              firstName: '$user.firstName',
              email: '$user.email',
              totalPolicies: 1,
              totalPremium: { $round: ['$totalPremium', 2] },
              policies: 1,
            },
          },
        ],
      },
    },
  ]);

  const totalUsers = output.meta[0]?.totalUsers || 0;

  res.json({
    page,
    limit,
    totalUsers,
    totalPages: Math.ceil(totalUsers / limit),
    data: output.data,
  });
};