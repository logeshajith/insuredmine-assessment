const request = require('supertest');
const { expect } = require('chai');
const { connect, disconnect } = require('./helpers');
const app = require('../src/app');
const LOB = require('../src/models/lob');
const Carrier = require('../src/models/carrier');
const Agent = require('../src/models/agent');
const User = require('../src/models/user');
const Account = require('../src/models/account');
const Policy = require('../src/models/policy');

describe('Policy APIs', () => {
  before(async () => {
    await connect();

    // Add known test data directly into the test database
    const lob = await LOB.create({ category_name: 'Commercial Auto' });
    const carrier = await Carrier.create({ company_name: 'Test Carrier' });
    const agent = await Agent.create({ agentName: 'Alex Watson' });
    const lura = await User.create({ firstName: 'Lura Lucca', email: 'lura@example.com' });
    const torie = await User.create({ firstName: 'Torie Buchanan', email: 'torie@example.com' });
    await Account.create({ accountName: 'Lura Account', userId: lura._id });

    const base = {
      policyStartDate: new Date('2018-01-01'),
      policyEndDate: new Date('2019-01-01'),
      categoryId: lob._id,
      companyId: carrier._id,
      agentId: agent._id,
    };
    await Policy.create([
      { ...base, policyNumber: 'P1', premiumAmount: 100.5, userId: lura._id },
      { ...base, policyNumber: 'P2', premiumAmount: 200.25, userId: lura._id },
      { ...base, policyNumber: 'P3', premiumAmount: 50, userId: torie._id },
    ]);
  });

  after(disconnect);

  describe('Search API', () => {
    it('finds a user and their policies (case-insensitive, partial name)', async () => {
      const res = await request(app).get('/api/policies/search?username=lura');
      expect(res.status).to.equal(200);
      expect(res.body.count).to.equal(1);

      const [result] = res.body.results;
      expect(result.user.firstName).to.equal('Lura Lucca');
      expect(result.accounts).to.deep.equal(['Lura Account']);
      expect(result.policies).to.have.lengthOf(2);
      expect(result.policies[0]).to.deep.include({
        category: 'Commercial Auto',
        company: 'Test Carrier',
        agent: 'Alex Watson',
      });
    });

    it('returns 404 when no user matches', async () => {
      const res = await request(app).get('/api/policies/search?username=zzzz');
      expect(res.status).to.equal(404);
    });

    it('returns 400 when username is missing', async () => {
      const res = await request(app).get('/api/policies/search');
      expect(res.status).to.equal(400);
    });
  });

  describe('Summary API', () => {
    it('groups policies by user with count and total premium', async () => {
      const res = await request(app).get('/api/policies/summary');
      expect(res.status).to.equal(200);
      expect(res.body.totalUsers).to.equal(2);

      // Sorted by most policies first
      const [first] = res.body.data;
      expect(first.firstName).to.equal('Lura Lucca');
      expect(first.totalPolicies).to.equal(2);
      expect(first.totalPremium).to.equal(300.75);
    });

    it('supports pagination', async () => {
      const res = await request(app).get('/api/policies/summary?page=1&limit=1');
      expect(res.body.data).to.have.lengthOf(1);
      expect(res.body.totalPages).to.equal(2);
    });
  });
});