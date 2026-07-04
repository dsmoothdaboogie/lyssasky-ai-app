import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '../components/Button';
import {
  apiAdminTestBenchGenerate,
  fetchAllStyles,
  getImageUrl,
  uploadAdminImage,
} from '../firebase/api';
import type { AdminTestBenchGenerateInput } from '../firebase/api';
import { useAdminAuth } from './useAdminAuth';
import type { Style, StyleRecipe } from '../domain/types';

type RecipeSource = 'style' | 'inline';

interface ResultItem {
  generationId: string;
  outputUrl: string;
  inputThumbUrl: string | null;
  label: string;
}

function emptyRecipe(): StyleRecipe {
  return { description: '', materials: '', palette: '', furniture: '', avoid: '' };
}

/**
 * Employee-only tool at `/admin/testbench` for iterating on a recipe against
 * a real photo before publishing a style, or for spot-checking a published
 * style's output. Runs go through the same generation pipeline as the
 * customer funnel (`adminTestBenchGenerate` writes a GenerationRecord with
 * source: 'testbench') but are never attached to a Lead.
 *
 * Results accumulate in local component state only — the point is quick
 * side-by-side visual comparison across recipe tweaks within a single
 * session, not a persisted history. Reloading the page clears the strip.
 */
export function TestBenchPage() {
  const { user } = useAdminAuth();
  const adminUid = user?.uid ?? 'anon';

  const [styles, setStyles] = useState<Style[]>([]);
  const [stylesLoading, setStylesLoading] = useState(true);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [source, setSource] = useState<RecipeSource>('style');
  const [styleSlug, setStyleSlug] = useState('');
  const [styleName, setStyleName] = useState('');
  const [recipe, setRecipe] = useState<StyleRecipe>(emptyRecipe());

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAllStyles()
      .then((fetched) => {
        if (!cancelled) setStyles(fetched);
      })
      .finally(() => {
        if (!cancelled) setStylesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Local object URLs are only useful for the lifetime of this page; revoke
  // the previous preview whenever a new photo replaces it or the page unmounts.
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const updateRecipeField =
    (field: keyof StyleRecipe) => (e: ChangeEvent<HTMLTextAreaElement>) => {
      setRecipe((r) => ({ ...r, [field]: e.target.value }));
    };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setUploadedPath(null);
    setUploadError(null);
    setUploading(true);
    try {
      const path = `testbench/${adminUid}/${Date.now()}-${file.name}`;
      const storedPath = await uploadAdminImage(path, file);
      setUploadedPath(storedPath);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  };

  const inlineValid =
    styleName.trim() !== '' &&
    recipe.description.trim() !== '' &&
    recipe.materials.trim() !== '' &&
    recipe.palette.trim() !== '' &&
    recipe.furniture.trim() !== '' &&
    recipe.avoid.trim() !== '';

  const canGenerate =
    uploadedPath !== null &&
    !uploading &&
    !generating &&
    (source === 'style' ? styleSlug !== '' : inlineValid);

  const handleGenerate = async () => {
    if (!canGenerate || !uploadedPath) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const input: AdminTestBenchGenerateInput =
        source === 'style'
          ? { inputPhotoPath: uploadedPath, styleSlug }
          : { inputPhotoPath: uploadedPath, inlineRecipe: recipe, styleName: styleName.trim() };
      const { generationId, outputPhotoPath } = await apiAdminTestBenchGenerate(input);
      const outputUrl = await getImageUrl(outputPhotoPath);
      const label =
        source === 'style'
          ? (styles.find((s) => s.slug === styleSlug)?.name ?? styleSlug)
          : styleName.trim();
      setResults((prev) => [
        ...prev,
        { generationId, outputUrl, inputThumbUrl: photoPreviewUrl, label },
      ]);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <h1>Test bench</h1>
      <p className="text-muted">
        Try a recipe against a real photo before publishing it, or spot-check a published style.
      </p>

      <section className="card admin-form-section">
        <h2>1. Test photo</h2>
        <div className="admin-form-field">
          <label htmlFor="testbench-photo">Upload a test photo</label>
          <input
            id="testbench-photo"
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
        {uploading && <p role="status">Uploading…</p>}
        {uploadError && <p role="alert">{uploadError}</p>}
        {photoPreviewUrl && (
          <img src={photoPreviewUrl} alt="Test photo preview" className="admin-gallery-thumb" />
        )}
      </section>

      <section className="card admin-form-section">
        <h2>2. Recipe source</h2>
        <div className="admin-form-field admin-form-field-checkbox">
          <label>
            <input
              type="radio"
              name="testbench-recipe-source"
              value="style"
              checked={source === 'style'}
              onChange={() => setSource('style')}
            />
            Existing style
          </label>
          <label>
            <input
              type="radio"
              name="testbench-recipe-source"
              value="inline"
              checked={source === 'inline'}
              onChange={() => setSource('inline')}
            />
            Inline recipe
          </label>
        </div>

        {source === 'style' ? (
          <div className="admin-form-field">
            <label htmlFor="testbench-style-select">Style</label>
            <select
              id="testbench-style-select"
              value={styleSlug}
              onChange={(e) => setStyleSlug(e.target.value)}
              disabled={stylesLoading}
            >
              <option value="">Select a style…</option>
              {styles.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="admin-form-field">
              <label htmlFor="testbench-style-name">Style name</label>
              <input
                id="testbench-style-name"
                type="text"
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor="testbench-recipe-description">Recipe description</label>
              <textarea
                id="testbench-recipe-description"
                value={recipe.description}
                onChange={updateRecipeField('description')}
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor="testbench-recipe-materials">Materials</label>
              <textarea
                id="testbench-recipe-materials"
                value={recipe.materials}
                onChange={updateRecipeField('materials')}
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor="testbench-recipe-palette">Palette</label>
              <textarea
                id="testbench-recipe-palette"
                value={recipe.palette}
                onChange={updateRecipeField('palette')}
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor="testbench-recipe-furniture">Furniture</label>
              <textarea
                id="testbench-recipe-furniture"
                value={recipe.furniture}
                onChange={updateRecipeField('furniture')}
              />
            </div>
            <div className="admin-form-field">
              <label htmlFor="testbench-recipe-avoid">Avoid</label>
              <textarea
                id="testbench-recipe-avoid"
                value={recipe.avoid}
                onChange={updateRecipeField('avoid')}
              />
            </div>
          </>
        )}
      </section>

      <section className="card admin-form-section">
        <h2>3. Generate</h2>
        <Button onClick={() => void handleGenerate()} disabled={!canGenerate}>
          {generating ? 'Generating…' : 'Generate'}
        </Button>
        {generateError && <p role="alert">{generateError}</p>}
      </section>

      <section className="admin-form-section">
        <h2>Results</h2>
        {results.length === 0 ? (
          <p className="text-muted">No generations yet.</p>
        ) : (
          <ul className="testbench-results-strip">
            {results.map((r, i) => (
              <li key={`${r.generationId}-${i}`} className="card testbench-result-card">
                {r.inputThumbUrl && (
                  <img
                    src={r.inputThumbUrl}
                    alt={`Input photo for ${r.label}`}
                    className="admin-gallery-thumb"
                  />
                )}
                <img src={r.outputUrl} alt={r.label} className="testbench-result-image" />
                <p>{r.label}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
