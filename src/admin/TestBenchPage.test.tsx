import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestBenchPage } from './TestBenchPage';
import {
  uploadAdminImage,
  fetchAllStyles,
  apiAdminTestBenchGenerate,
  getImageUrl,
} from '../firebase/api';
import { useAdminAuth } from './useAdminAuth';
import type { Style } from '../domain/types';
import type { UseAdminAuth } from './useAdminAuth';

vi.mock('../firebase/api', () => ({
  uploadAdminImage: vi.fn(),
  fetchAllStyles: vi.fn(),
  apiAdminTestBenchGenerate: vi.fn(),
  getImageUrl: vi.fn(),
}));

vi.mock('./useAdminAuth', () => ({
  useAdminAuth: vi.fn(),
}));

const mockedUploadAdminImage = vi.mocked(uploadAdminImage);
const mockedFetchAllStyles = vi.mocked(fetchAllStyles);
const mockedApiAdminTestBenchGenerate = vi.mocked(apiAdminTestBenchGenerate);
const mockedGetImageUrl = vi.mocked(getImageUrl);
const mockedUseAdminAuth = vi.mocked(useAdminAuth);

// jsdom doesn't implement createObjectURL — stub it so preview-URL creation
// doesn't blow up.
beforeAll(() => {
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

function makeStyles(): Style[] {
  const recipe = { description: '', materials: '', palette: '', furniture: '', avoid: '' };
  return [
    { slug: 'scandinavian', name: 'Scandinavian', description: '', galleryImages: [], recipe, sortOrder: 1, active: true },
    { slug: 'midcentury', name: 'Mid-century', description: '', galleryImages: [], recipe, sortOrder: 2, active: true },
  ];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TestBenchPage />
    </MemoryRouter>,
  );
}

describe('TestBenchPage', () => {
  beforeEach(() => {
    mockedUploadAdminImage.mockReset();
    mockedFetchAllStyles.mockReset();
    mockedApiAdminTestBenchGenerate.mockReset();
    mockedGetImageUrl.mockReset();
    mockedUseAdminAuth.mockReturnValue({
      user: { uid: 'admin1' },
      loading: false,
      isAdmin: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as UseAdminAuth);
    mockedFetchAllStyles.mockResolvedValue(makeStyles());
    mockedUploadAdminImage.mockResolvedValue('testbench/admin1/123-photo.png');
    mockedApiAdminTestBenchGenerate.mockResolvedValue({
      generationId: 'g1',
      outputPhotoPath: 'testbench/results/1.png',
    });
    mockedGetImageUrl.mockResolvedValue('https://fake.example/testbench/results/1.png');
  });

  test('generate is disabled until a photo is uploaded and a style is chosen', async () => {
    renderPage();
    await screen.findByLabelText(/^style$/i);

    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });

  test('uploads a photo, picks a style, generates, and shows the result image', async () => {
    const user = userEvent.setup();
    renderPage();

    const file = new File(['fake'], 'photo.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText(/upload a test photo/i) as HTMLInputElement;
    await user.upload(fileInput, file);

    await waitFor(() => expect(mockedUploadAdminImage).toHaveBeenCalledTimes(1));
    const [uploadPath] = mockedUploadAdminImage.mock.calls[0];
    expect(uploadPath).toMatch(/^testbench\/admin1\//);

    const styleSelect = await screen.findByLabelText(/^style$/i);
    await user.selectOptions(styleSelect, 'midcentury');

    const generateButton = screen.getByRole('button', { name: /generate/i });
    await waitFor(() => expect(generateButton).not.toBeDisabled());
    await user.click(generateButton);

    await waitFor(() => expect(mockedApiAdminTestBenchGenerate).toHaveBeenCalledTimes(1));
    expect(mockedApiAdminTestBenchGenerate).toHaveBeenCalledWith({
      inputPhotoPath: 'testbench/admin1/123-photo.png',
      styleSlug: 'midcentury',
    });

    const resultImage = await screen.findByAltText('Mid-century');
    expect(resultImage).toHaveAttribute('src', 'https://fake.example/testbench/results/1.png');
  });
});
