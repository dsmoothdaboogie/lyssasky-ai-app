import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StyleEditPage } from './StyleEditPage';
import { fetchStyle, apiAdminSaveStyle, uploadAdminImage, getImageUrl } from '../firebase/api';
import type { Style } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchStyle: vi.fn(),
  apiAdminSaveStyle: vi.fn(),
  uploadAdminImage: vi.fn(),
  getImageUrl: vi.fn(),
}));

const mockedFetchStyle = vi.mocked(fetchStyle);
const mockedApiAdminSaveStyle = vi.mocked(apiAdminSaveStyle);
const mockedUploadAdminImage = vi.mocked(uploadAdminImage);
const mockedGetImageUrl = vi.mocked(getImageUrl);

function makeStyle(overrides: Partial<Style> = {}): Style {
  return {
    slug: 'scandinavian',
    name: 'Scandinavian',
    description: 'Light woods, airy neutrals.',
    galleryImages: ['https://fake.example/existing.jpg'],
    recipe: {
      description: 'Airy, minimal, functional.',
      materials: 'oak, linen',
      palette: 'warm neutrals',
      furniture: 'low-profile sofas',
      avoid: 'ornate carving',
    },
    sortOrder: 1,
    active: true,
    ...overrides,
  };
}

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/styles/new" element={<StyleEditPage />} />
        <Route path="/admin/styles/:slug" element={<StyleEditPage />} />
        <Route path="/admin/styles" element={<div>styles-list-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StyleEditPage', () => {
  beforeEach(() => {
    mockedFetchStyle.mockReset();
    mockedApiAdminSaveStyle.mockReset();
    mockedUploadAdminImage.mockReset();
    mockedGetImageUrl.mockReset();
    mockedApiAdminSaveStyle.mockResolvedValue({ ok: true });
    mockedGetImageUrl.mockImplementation(async (path: string) => `https://fake.example/${path}`);
  });

  describe('create mode', () => {
    test('slug is editable', () => {
      renderPage('/admin/styles/new');

      expect(screen.getByLabelText(/^slug$/i)).not.toBeDisabled();
    });

    test('shows the allowed slug-format hint', () => {
      renderPage('/admin/styles/new');

      expect(
        screen.getByText(/lowercase letters, numbers, hyphens/i),
      ).toBeInTheDocument();
    });

    test('fills in fields and submits, saving a matching Style and navigating to the list', async () => {
      const user = userEvent.setup();
      renderPage('/admin/styles/new');

      await user.type(screen.getByLabelText(/^slug$/i), 'midcentury');
      await user.type(screen.getByLabelText(/^name$/i), 'Mid-century');
      await user.type(screen.getByLabelText(/^description$/i), 'Clean lines, warm woods.');
      await user.type(screen.getByLabelText(/recipe description/i), 'Warm, sculptural, functional.');
      await user.type(screen.getByLabelText(/^materials$/i), 'walnut, brass');
      await user.type(screen.getByLabelText(/^palette$/i), 'mustard and olive');
      await user.type(screen.getByLabelText(/^furniture$/i), 'tapered wooden legs');
      await user.type(screen.getByLabelText(/^avoid$/i), 'no glossy finishes');

      await user.click(screen.getByRole('button', { name: /save style/i }));

      await waitFor(() => expect(mockedApiAdminSaveStyle).toHaveBeenCalledTimes(1));
      const savedStyle = mockedApiAdminSaveStyle.mock.calls[0][0];
      expect(savedStyle.slug).toBe('midcentury');
      expect(savedStyle.name).toBe('Mid-century');
      expect(savedStyle.description).toBe('Clean lines, warm woods.');
      expect(savedStyle.recipe).toEqual({
        description: 'Warm, sculptural, functional.',
        materials: 'walnut, brass',
        palette: 'mustard and olive',
        furniture: 'tapered wooden legs',
        avoid: 'no glossy finishes',
      });

      expect(await screen.findByText('styles-list-page')).toBeInTheDocument();
    });

    test('does not save when required fields are missing', async () => {
      const user = userEvent.setup();
      renderPage('/admin/styles/new');

      await user.click(screen.getByRole('button', { name: /save style/i }));

      expect(mockedApiAdminSaveStyle).not.toHaveBeenCalled();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    test('adding an image by URL appends it to the gallery list', async () => {
      const user = userEvent.setup();
      renderPage('/admin/styles/new');

      await user.type(screen.getByLabelText(/add image by url/i), 'https://example.com/pic.jpg');
      await user.click(screen.getByRole('button', { name: /^add$/i }));

      expect(screen.getByText('https://example.com/pic.jpg')).toBeInTheDocument();
    });

    test('uploading a file calls uploadAdminImage with a styles/{slug}/ path and appends the resolved URL', async () => {
      mockedUploadAdminImage.mockResolvedValue('styles/midcentury/123-photo.png');
      const user = userEvent.setup();
      renderPage('/admin/styles/new');

      await user.type(screen.getByLabelText(/^slug$/i), 'midcentury');

      const file = new File(['fake'], 'photo.png', { type: 'image/png' });
      const input = screen.getByLabelText(/upload an image/i) as HTMLInputElement;
      await user.upload(input, file);

      await waitFor(() => expect(mockedUploadAdminImage).toHaveBeenCalledTimes(1));
      const [path] = mockedUploadAdminImage.mock.calls[0];
      expect(path).toMatch(/^styles\/midcentury\//);

      await waitFor(() =>
        expect(mockedGetImageUrl).toHaveBeenCalledWith('styles/midcentury/123-photo.png'),
      );
      expect(
        await screen.findByText('https://fake.example/styles/midcentury/123-photo.png'),
      ).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    test('prefills fields from fetchStyle and locks the slug field', async () => {
      mockedFetchStyle.mockResolvedValue(makeStyle());
      renderPage('/admin/styles/scandinavian');

      const nameInput = await screen.findByLabelText(/^name$/i);
      expect(nameInput).toHaveValue('Scandinavian');

      const slugInput = screen.getByLabelText(/^slug$/i);
      expect(slugInput).toHaveValue('scandinavian');
      expect(slugInput).toBeDisabled();

      expect(screen.getByLabelText(/^description$/i)).toHaveValue('Light woods, airy neutrals.');
      expect(screen.getByLabelText(/recipe description/i)).toHaveValue('Airy, minimal, functional.');
      expect(screen.getByLabelText(/^materials$/i)).toHaveValue('oak, linen');
      expect(screen.getByLabelText(/^palette$/i)).toHaveValue('warm neutrals');
      expect(screen.getByLabelText(/^furniture$/i)).toHaveValue('low-profile sofas');
      expect(screen.getByLabelText(/^avoid$/i)).toHaveValue('ornate carving');
      expect(mockedFetchStyle).toHaveBeenCalledWith('scandinavian');
    });

    test('shows a not-found state when the style does not exist', async () => {
      mockedFetchStyle.mockResolvedValue(undefined);
      renderPage('/admin/styles/nope');

      await screen.findByText(/not found/i);
    });

    test('submitting saves the edited style, keeping the locked slug', async () => {
      mockedFetchStyle.mockResolvedValue(makeStyle());
      const user = userEvent.setup();
      renderPage('/admin/styles/scandinavian');

      await screen.findByLabelText(/^name$/i);
      const nameInput = screen.getByLabelText(/^name$/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Scandi Redux');

      await user.click(screen.getByRole('button', { name: /save style/i }));

      await waitFor(() => expect(mockedApiAdminSaveStyle).toHaveBeenCalledTimes(1));
      const savedStyle = mockedApiAdminSaveStyle.mock.calls[0][0];
      expect(savedStyle.slug).toBe('scandinavian');
      expect(savedStyle.name).toBe('Scandi Redux');

      expect(await screen.findByText('styles-list-page')).toBeInTheDocument();
    });
  });
});
