import { useCallback, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { validatePhotoMeta, validateDimensions } from '../domain/uploadValidation';
import { readImageDimensions } from './imageDimensions';
import { ensureAnonymousAuth } from '../firebase/client';
import { apiCreateLead, apiAttachPhoto, uploadOriginalPhoto } from '../firebase/api';

const GENERIC_ERROR = "Something went wrong uploading your photo — please try again.";
const CONVERSION_ERROR = "We couldn't read that photo — please try a JPEG or PNG instead.";

/**
 * Funnel step 1: pick a room photo. Validates type/size client-side,
 * converts HEIC/HEIF to JPEG, checks minimum dimensions, then creates the
 * lead, uploads the photo to Storage, and records the path on the lead
 * before moving on to the questionnaire.
 */
export function UploadStep() {
  const navigate = useNavigate();
  const { setLeadId, setUid, setOriginalPhotoPreviewUrl } = useFunnelState();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      const meta = validatePhotoMeta(file);
      if (!meta.ok) {
        setError(meta.error ?? 'Please choose a different photo.');
        return;
      }

      let workingFile = file;
      if (meta.needsConversion) {
        try {
          // Loaded lazily: heic2any pulls in a worker-based codec that only
          // needs to exist for the (uncommon) HEIC/HEIF upload path, and it
          // assumes browser globals (Worker) that aren't available in
          // non-browser test environments unless a HEIC file is uploaded.
          const { default: heic2any } = await import('heic2any');
          const converted = await heic2any({ blob: file, toType: 'image/jpeg' });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          workingFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: 'image/jpeg',
          });
        } catch {
          setError(CONVERSION_ERROR);
          return;
        }
      }

      try {
        const { width, height } = await readImageDimensions(workingFile);
        const dim = validateDimensions(width, height);
        if (!dim.ok) {
          setError(dim.error ?? 'This photo is a little small — a larger, clearer shot works best.');
          return;
        }
      } catch {
        // If we can't read dimensions in this environment, don't block the
        // upload on it — server-side/CDN checks can catch true edge cases.
      }

      setIsUploading(true);
      try {
        const uid = await ensureAnonymousAuth();
        const { leadId } = await apiCreateLead();
        setLeadId(leadId);
        setUid(uid);
        setOriginalPhotoPreviewUrl(URL.createObjectURL(workingFile));

        const path = await uploadOriginalPhoto(uid, workingFile);
        await apiAttachPhoto(leadId, path);

        navigate('/questionnaire');
      } catch {
        setError(GENERIC_ERROR);
      } finally {
        setIsUploading(false);
      }
    },
    [navigate, setLeadId, setUid, setOriginalPhotoPreviewUrl]
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  return (
    <FunnelLayout step={1} totalSteps={5}>
      <section>
        <h1>Upload a photo of your room</h1>
        <p>One clear, well-lit photo is all we need to get started.</p>

        <label
          htmlFor="photo-upload"
          className="card"
          style={{
            display: 'block',
            cursor: isUploading ? 'default' : 'pointer',
            textAlign: 'center',
            padding: 'var(--space-6)',
            opacity: isUploading ? 0.7 : 1,
          }}
        >
          <span>{isUploading ? 'Uploading…' : 'Tap to choose a photo'}</span>
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            onChange={onChange}
            disabled={isUploading}
            style={{ display: 'none' }}
          />
        </label>

        {isUploading && (
          <p role="status" className="text-muted" style={{ marginTop: 'var(--space-3)' }}>
            Uploading your photo — just a moment…
          </p>
        )}

        {error && (
          <p role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={() => document.getElementById('photo-upload')?.click()}
          disabled={isUploading}
          style={{ marginTop: 'var(--space-4)' }}
        >
          Choose a photo
        </Button>
      </section>
    </FunnelLayout>
  );
}
