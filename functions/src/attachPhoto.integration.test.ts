import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';
import { attachPhotoDoc } from './leads';

describe('attachPhotoDoc', () => {
  it('sets the originalPhotoPath for the owner and logs photo_uploaded', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await attachPhotoDoc(leadId, 'owner1', 'leads/owner1/original.jpg');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.originalPhotoPath).toBe('leads/owner1/original.jpg');

    const events = await db.collection('events').where('leadId', '==', leadId).get();
    const types = events.docs.map((d) => d.data().type);
    expect(types).toContain('photo_uploaded');
  });

  it('rejects a non-owner', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await expect(attachPhotoDoc(leadId, 'intruder', 'leads/intruder/original.jpg')).rejects.toThrow(
      /permission/i
    );
  });

  it('rejects attaching a photo to a non-existent lead', async () => {
    await expect(attachPhotoDoc('does-not-exist', 'u', 'leads/u/original.jpg')).rejects.toThrow(
      /not.?found/i
    );
  });
});
