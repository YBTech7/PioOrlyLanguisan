import postgres from 'postgres';
import { expect, it } from 'vitest';
import { openInbox } from '../consultation';
import type { InquiryRecord } from '../src/types';

it.skipIf(!process.env.TEST_CONSULTATION_DATABASE_URL)('stores structured inquiries and recovers older string-encoded inquiries', async () => {
  const url = process.env.TEST_CONSULTATION_DATABASE_URL!;
  const inbox = openInbox(url);
  const oldServer = postgres(url);
  const inquiry: InquiryRecord = {
    id: 'INQ-TEST', name: 'Test Visitor', email: 'test@example.com',
    company: 'Test Organization', tier: 'startup', serviceDomain: 'technical-support',
    timeline: 'Within 30 days', message: 'A test consultation request.',
    status: 'New', createdAt: '2026-01-01T00:00:00.000Z',
  };
  const key = 'ae901555-d79b-4ece-96dc-063bd9a0f6b1';
  const recovered = openInbox(url);
  try {
    expect(await inbox.save(inquiry, key)).toEqual(inquiry);
    expect(await inbox.save({ ...inquiry, message: 'A different consultation request.' }, key)).toBeNull();
    expect(await inbox.update(inquiry.id, { status: 'In Review' })).toMatchObject({ status: 'In Review' });
    expect(await inbox.save(inquiry, key)).toMatchObject({ id: inquiry.id, status: 'In Review' });
    await oldServer`UPDATE consultation_inbox
      SET inquiry = ${oldServer.json(JSON.stringify(inquiry))}, email_state = 'review'
      WHERE id = ${inquiry.id}`;
    expect(await recovered.claim()).toMatchObject({ inquiry, attempts: 1 });
    expect(await recovered.save({ ...inquiry, id: 'INQ-RETRY' }, key)).toEqual(inquiry);
  } finally {
    await oldServer`DELETE FROM consultation_inbox WHERE id = ${inquiry.id}`;
    await Promise.all([oldServer.end(), inbox.close(), recovered.close()]);
  }
});
