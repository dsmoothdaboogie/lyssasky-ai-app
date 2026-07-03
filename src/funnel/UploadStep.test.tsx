import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { UploadStep } from './UploadStep';
import { apiCreateLead, apiAttachPhoto, uploadOriginalPhoto } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import { readImageDimensions } from './imageDimensions';
import heic2any from 'heic2any';

vi.mock('../firebase/api', () => ({
  apiCreateLead: vi.fn().mockResolvedValue({ leadId: 'l1', leadToken: 't' }),
  uploadOriginalPhoto: vi.fn().mockResolvedValue('leads/u1/l1/original.jpg'),
  apiAttachPhoto: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

vi.mock('./imageDimensions', () => ({
  readImageDimensions: vi.fn().mockResolvedValue({ width: 1024, height: 1024 }),
}));

vi.mock('heic2any', () => ({
  default: vi.fn(),
}));

// jsdom doesn't implement createObjectURL — stub it so preview-URL creation
// doesn't blow up.
beforeAll(() => {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

function renderUpload() {
  return render(
    <MemoryRouter initialEntries={['/upload']}>
      <FunnelProvider>
        <Routes>
          <Route path="/upload" element={<UploadStep />} />
          <Route path="/questionnaire" element={<p>Questionnaire screen</p>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('UploadStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ensureAnonymousAuth as ReturnType<typeof vi.fn>).mockResolvedValue('u1');
    (apiCreateLead as ReturnType<typeof vi.fn>).mockResolvedValue({ leadId: 'l1', leadToken: 't' });
    (uploadOriginalPhoto as ReturnType<typeof vi.fn>).mockResolvedValue('leads/u1/l1/original.jpg');
    (apiAttachPhoto as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (readImageDimensions as ReturnType<typeof vi.fn>).mockResolvedValue({ width: 1024, height: 1024 });
    (heic2any as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['converted-bytes'], { type: 'image/jpeg' })
    );
  });

  it('rejects a non-image file with a friendly message and does not create a lead', async () => {
    renderUpload();

    // Use fireEvent (not user-event) here: user-event mimics the native
    // file-picker's own `accept` filtering, which would silently refuse to
    // "select" a mismatched file before our code ever runs. We still want
    // to verify our own validation rejects it (e.g. a file dropped in via
    // drag-and-drop, which isn't filtered by `accept`).
    const pdf = new File(['%PDF-1.4'], 'floorplan.pdf', { type: 'application/pdf' });
    fireEvent.change(getFileInput(), { target: { files: [pdf] } });

    expect(await screen.findByText(/please upload a photo/i)).toBeInTheDocument();
    expect(apiCreateLead).not.toHaveBeenCalled();
  });

  it('uploads a valid JPEG, attaches the path, and navigates to the questionnaire', async () => {
    const user = userEvent.setup();
    renderUpload();

    const jpeg = new File(['fake-image-bytes'], 'room.jpg', { type: 'image/jpeg' });
    await user.upload(getFileInput(), jpeg);

    await waitFor(() => expect(apiCreateLead).toHaveBeenCalled());
    expect(uploadOriginalPhoto).toHaveBeenCalledWith('u1', 'l1', expect.any(File));
    expect(apiAttachPhoto).toHaveBeenCalledWith('l1', 'leads/u1/l1/original.jpg');

    await waitFor(() => expect(screen.getByText('Questionnaire screen')).toBeInTheDocument());
  });

  it('converts a HEIC photo to JPEG before uploading', async () => {
    const user = userEvent.setup();
    renderUpload();

    const heic = new File(['heic-bytes'], 'room.heic', { type: 'image/heic' });
    await user.upload(getFileInput(), heic);

    await waitFor(() => expect(heic2any).toHaveBeenCalled());
    await waitFor(() => expect(uploadOriginalPhoto).toHaveBeenCalled());
    const uploadedFile = (uploadOriginalPhoto as ReturnType<typeof vi.fn>).mock.calls[0][2] as File;
    expect(uploadedFile.type).toBe('image/jpeg');

    await waitFor(() => expect(screen.getByText('Questionnaire screen')).toBeInTheDocument());
  });

  it('shows a friendly message when the photo is too small', async () => {
    (readImageDimensions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ width: 100, height: 100 });
    const user = userEvent.setup();
    renderUpload();

    const jpeg = new File(['fake-image-bytes'], 'room.jpg', { type: 'image/jpeg' });
    await user.upload(getFileInput(), jpeg);

    expect(await screen.findByText(/a little small/i)).toBeInTheDocument();
    expect(apiCreateLead).not.toHaveBeenCalled();
  });
});
