const path = require('path');
const request = require('supertest');
const { expect } = require('chai');
const { connect, disconnect, waitFor } = require('./helpers');
const app = require('../src/app');
const Policy = require('../src/models/policy');

describe('Upload API', () => {
  before(connect);
  after(disconnect);

  it('imports CSV in the background and reports a summary', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', path.join(__dirname, 'fixtures', 'sample.csv'));

    expect(res.status).to.equal(202);
    expect(res.body.jobId).to.exist;

    // Wait for the worker thread to finish
    let job;
    await waitFor(async () => {
      job = (await request(app).get(`/api/upload/${res.body.jobId}`)).body;
      return job.status !== 'processing';
    }, 15000);

    expect(job.status).to.equal('completed');
    expect(job.result).to.deep.include({
      totalRows: 3,
      imported: 2,
      skippedRows: [4],
      agents: 1,
      lobs: 2,
      carriers: 2,
      users: 1,
    });
    expect(await Policy.countDocuments()).to.equal(2);
  });

  it('returns 400 when no file is sent', async () => {
    const res = await request(app).post('/api/upload');
    expect(res.status).to.equal(400);
  });

  it('returns 400 for a non-CSV/XLSX file', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('hello'), 'notes.txt');
    expect(res.status).to.equal(400);
  });

  it('returns 400 for an invalid job ID and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/upload/abc')).status).to.equal(400);
    expect((await request(app).get('/api/upload/507f1f77bcf86cd799439011')).status).to.equal(404);
  });
});