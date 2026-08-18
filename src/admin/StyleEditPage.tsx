import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { apiAdminSaveStyle, fetchStyle, getImageUrl, uploadAdminImage } from '../firebase/api';
import type { Style, StyleRecipe } from '../domain/types';

const GENERIC_ERROR = "Something went wrong saving this style — please try again.";
const REQUIRED_FIELDS_ERROR =
  'Please fill in the slug, name, and all five recipe fields before saving.';

function emptyRecipe(): StyleRecipe {
  return { description: '', materials: '', palette: '', furniture: '', avoid: '' };
}

/**
 * Admin create/edit form for a single style, at `/admin/styles/new` (create)
 * or `/admin/styles/:slug` (edit). The slug doubles as the Firestore doc id,
 * so it's only editable in create mode — changing it in edit mode would
 * silently create a second doc rather than rename the existing one.
 *
 * The recipe fields feed the AI generation prompt (see StyleRecipe in
 * domain/types.ts) and are kept separate from the customer-facing
 * name/description. Gallery images are stored as a flat list of resolvable
 * URLs (matched by QuestionnaireStep, which uses galleryImages[0] directly
 * as an <img> src) — so an uploaded file's Storage path is resolved via
 * getImageUrl before being added to the list, rather than storing the raw
 * path.
 */
export function StyleEditPage() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const isCreate = !routeSlug || routeSlug === 'new';

  const [loading, setLoading] = useState(!isCreate);
  const [notFound, setNotFound] = useState(false);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [recipe, setRecipe] = useState<StyleRecipe>(emptyRecipe());
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (isCreate || !routeSlug) return;
    let cancelled = false;
    setLoading(true);
    fetchStyle(routeSlug).then((style) => {
      if (cancelled) return;
      if (!style) {
        setNotFound(true);
      } else {
        setSlug(style.slug);
        setName(style.name);
        setDescription(style.description);
        setActive(style.active);
        setSortOrder(style.sortOrder);
        setRecipe(style.recipe);
        setGalleryImages(style.galleryImages);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isCreate, routeSlug]);

  const updateRecipeField =
    (field: keyof StyleRecipe) => (e: ChangeEvent<HTMLTextAreaElement>) => {
      setRecipe((r) => ({ ...r, [field]: e.target.value }));
    };

  const isValid =
    slug.trim() !== '' &&
    name.trim() !== '' &&
    recipe.description.trim() !== '' &&
    recipe.materials.trim() !== '' &&
    recipe.palette.trim() !== '' &&
    recipe.furniture.trim() !== '' &&
    recipe.avoid.trim() !== '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setSaveError(REQUIRED_FIELDS_ERROR);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const style: Style = {
      slug: slug.trim(),
      name: name.trim(),
      description: description.trim(),
      galleryImages,
      recipe,
      sortOrder,
      active,
    };
    try {
      await apiAdminSaveStyle(style);
      navigate('/admin/styles');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const handleAddImageUrl = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    setGalleryImages((imgs) => [...imgs, trimmed]);
    setNewImageUrl('');
  };

  const handleRemoveImage = (index: number) => {
    setGalleryImages((imgs) => imgs.filter((_, i) => i !== index));
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const filename = `${Date.now()}-${file.name}`;
      const path = `styles/${slug.trim() || 'untitled'}/${filename}`;
      const storedPath = await uploadAdminImage(path, file);
      const url = await getImageUrl(storedPath);
      setGalleryImages((imgs) => [...imgs, url]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading style…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="admin-shell admin-shell-centered">
        <div className="card">
          <p role="alert">Style not found.</p>
          <Link to="/admin/styles">Back to styles</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p>
        <Link to="/admin/styles">&larr; Back to styles</Link>
      </p>
      <h1>{isCreate ? 'New style' : `Edit ${name || slug}`}</h1>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <section className="card admin-form-section">
          <h2>Details</h2>

          <div className="admin-form-field">
            <label htmlFor="style-slug">Slug</label>
            <input
              id="style-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!isCreate}
              aria-describedby="style-slug-hint"
            />
            <p id="style-slug-hint" className="text-muted">
              Lowercase letters, numbers, hyphens, and underscores only. Used as
              the URL identifier — it can&rsquo;t be changed after the style is
              created.
            </p>
          </div>

          <div className="admin-form-field">
            <label htmlFor="style-name">Name</label>
            <input id="style-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="admin-form-field">
            <label htmlFor="style-description">Description</label>
            <textarea
              id="style-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="admin-form-field admin-form-field-checkbox">
            <label htmlFor="style-active">
              <input
                id="style-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="admin-form-field">
            <label htmlFor="style-sort-order">Sort order</label>
            <input
              id="style-sort-order"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
        </section>

        <section className="card admin-form-section">
          <h2>Recipe</h2>
          <p className="text-muted">
            Feeds the AI generation prompt — not shown to customers verbatim.
          </p>

          <div className="admin-form-field">
            <label htmlFor="recipe-description">Recipe description</label>
            <textarea
              id="recipe-description"
              value={recipe.description}
              onChange={updateRecipeField('description')}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="recipe-materials">Materials</label>
            <textarea
              id="recipe-materials"
              value={recipe.materials}
              onChange={updateRecipeField('materials')}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="recipe-palette">Palette</label>
            <textarea
              id="recipe-palette"
              value={recipe.palette}
              onChange={updateRecipeField('palette')}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="recipe-furniture">Furniture</label>
            <textarea
              id="recipe-furniture"
              value={recipe.furniture}
              onChange={updateRecipeField('furniture')}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="recipe-avoid">Avoid</label>
            <textarea id="recipe-avoid" value={recipe.avoid} onChange={updateRecipeField('avoid')} />
          </div>
        </section>

        <section className="card admin-form-section">
          <h2>Gallery images</h2>

          {galleryImages.length === 0 ? (
            <p className="text-muted">No images yet.</p>
          ) : (
            <ul className="admin-gallery-list">
              {galleryImages.map((img, index) => (
                <li key={`${img}-${index}`}>
                  <img src={img} alt="" className="admin-gallery-thumb" />
                  <span className="admin-gallery-url">{img}</span>
                  <Button variant="secondary" onClick={() => handleRemoveImage(index)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="admin-gallery-add">
            <div className="admin-form-field">
              <label htmlFor="style-new-image-url">Add image by URL</label>
              <input
                id="style-new-image-url"
                type="text"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://… or data:image/…"
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleAddImageUrl}>
              Add
            </Button>
          </div>

          <div className="admin-form-field">
            <label htmlFor="style-image-upload">Or upload an image</label>
            <input
              id="style-image-upload"
              type="file"
              accept="image/*"
              onChange={(e) => void handleFileChange(e)}
              disabled={uploading}
            />
            {uploading && <p role="status">Uploading…</p>}
            {uploadError && <p role="alert">{uploadError}</p>}
          </div>
        </section>

        {saveError && <p role="alert">{saveError}</p>}

        <div className="admin-form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save style'}
          </Button>
          <Link to="/admin/styles" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
