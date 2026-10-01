const request = require('supertest');
const { expect } = require('chai');
const { connect, disconnect, sleep, waitFor } = require('./helpers');
const app = require('../src/app');
const ScheduledMessage = require('../src/models/scheduledMessage');
const Message = require('../src/models/message');
const { startScheduler } = require('../src/services/scheduler');

describe('Messages', () => {
  before(connect);
  after(disconnect);

  describe('Schedule message API', () => {
    it('schedules a valid future message', async () => {
      const res = await request(app)
        .post('/api/messages/schedule')
        .send({ message: 'Hello', day: '2030-01-01', time: '10:00' });

      expect(res.status).to.equal(201);
      expect(res.body.status).to.equal('pending');
      expect(await ScheduledMessage.countDocuments()).to.equal(1);
    });

    // Same check for several bad inputs
    const badInputs = [
      ['past time', { message: 'Hi', day: '2020-01-01', time: '10:00' }],
      ['invalid date', { message: 'Hi', day: '2030-02-30', time: '10:00' }],
      ['wrong time format', { message: 'Hi', day: '2030-01-01', time: '9:5' }],
      ['empty message', { message: '', day: '2030-01-01', time: '10:00' }],
    ];

    badInputs.forEach(([name, body]) => {
      it(`returns 400 for ${name}`, async () => {
        const res = await request(app).post('/api/messages/schedule').send(body);
        expect(res.status).to.equal(400);
      });
    });
  });

  describe('Scheduler', () => {
    it('inserts a due message exactly once, even with two schedulers running', async () => {
      const job = await ScheduledMessage.create({
        message: 'Due now',
        scheduledAt: new Date(Date.now() - 1000), // already due
      });

      // Simulate two cluster workers running the scheduler at the same time
      const s1 = startScheduler({ intervalMs: 200 });
      const s2 = startScheduler({ intervalMs: 200 });

      await waitFor(async () => (await ScheduledMessage.findById(job._id)).status === 'done');
      s1.stop();
      s2.stop();
      await sleep(300); // let any running round finish

      expect(await Message.countDocuments({ scheduledMessageId: job._id })).to.equal(1);
    });
  });
});