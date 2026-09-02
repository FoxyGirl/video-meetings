'use client';

import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ProgressBar,
  Spinner,
  toast,
} from '@heroui/react';
import { CheckCircle2, Upload, XCircle } from 'lucide-react';
import { ApiError } from '@/shared/api';
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILES_PER_MEETING,
  validateFile,
  type MeetingFileMetadata,
} from '@/entities/meeting-file';
import { uploadMeetingFiles, type UploadBatchResult } from '../api';

interface StagedFile {
  file: File;
  error: string | null;
}

interface MeetingFileUploadProps {
  meetingId: string;
  onUploaded: (files: MeetingFileMetadata[]) => void;
  onSessionExpired: () => void;
}

export function MeetingFileUpload({
  meetingId,
  onUploaded,
  onSessionExpired,
}: MeetingFileUploadProps) {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [dropError, setDropError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<UploadBatchResult | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  // dragenter/dragleave fire for every child element the pointer crosses,
  // not just the drop zone's own boundary — a counter (rather than a plain
  // boolean) avoids the highlight flickering off while dragging over the
  // input or hint text nested inside the zone.
  const dragCounter = useRef(0);

  const applySelectedFiles = (selected: File[]) => {
    // The server's FilesInterceptor caps a single multipart request at
    // MAX_FILES_PER_MEETING parts under the `files` field (Multer's own
    // maxCount) — sending more than that in one request isn't reported as
    // a per-file rejection, Multer rejects the whole request before the
    // handler ever runs. Only client-valid files count toward that count
    // (files with an error below are never sent), so once that many are
    // seen, every valid file after it is staged as client-rejected too,
    // the same way a validateFile failure is, instead of being silently
    // sent anyway and blowing up the whole batch.
    let validCount = 0;
    setStagedFiles(
      selected.map((file) => {
        const error = validateFile(file);
        if (error) {
          return { file, error };
        }
        validCount += 1;
        if (validCount > MAX_FILES_PER_MEETING) {
          return {
            file,
            error: `Only ${MAX_FILES_PER_MEETING} files can be uploaded at once. Upload the rest in a separate batch.`,
          };
        }
        return { file, error: null };
      }),
    );
    setDropError(null);
    setUploadError(null);
    setBatchResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applySelectedFiles(Array.from(e.target.files ?? []));
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isUploading) {
      return;
    }
    dragCounter.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Required even though dragenter already fired — without it the
    // browser rejects the drop and treats it as a navigation attempt.
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isUploading) {
      return;
    }
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragActive(false);
    if (isUploading) {
      return;
    }

    const { files } = e.dataTransfer;
    if (files.length === 0) {
      setStagedFiles([]);
      setUploadError(null);
      setBatchResult(null);
      setDropError(
        'No files detected in the drop. Please drop one or more files.',
      );
      return;
    }
    applySelectedFiles(Array.from(files));
  };

  const handleUpload = async () => {
    const validFiles = stagedFiles
      .filter((staged) => !staged.error)
      .map((staged) => staged.file);
    const clientRejected = stagedFiles
      .filter((staged) => staged.error)
      .map((staged) => ({
        originalName: staged.file.name,
        reason: staged.error as string,
      }));

    // Nothing staged passed client-side validation — nothing worth a round
    // trip, but the rejections still deserve the same per-file feedback a
    // server response would give.
    if (validFiles.length === 0) {
      setBatchResult({ accepted: [], rejected: clientRejected });
      setStagedFiles([]);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setBatchResult(null);
    setProgress(0);
    try {
      const result = await uploadMeetingFiles(
        meetingId,
        validFiles,
        setProgress,
      );
      const combined: UploadBatchResult = {
        accepted: result.accepted,
        rejected: [...clientRejected, ...result.rejected],
      };
      setBatchResult(combined);
      setStagedFiles([]);
      if (combined.accepted.length > 0) {
        onUploaded(combined.accepted);
      }
      // One combined toast (not just the inline list, and not one toast per
      // outcome) — accepting even one file in this batch can push the
      // meeting to the 10-file cap, which unmounts this whole card on the
      // very next render (the page only renders it below the cap), so a
      // rejection reason shown only inline would vanish before anyone
      // could read it; a second, separate toast risks the toast library
      // replacing the first before it's seen.
      if (combined.accepted.length > 0 || combined.rejected.length > 0) {
        const acceptedSummary =
          combined.accepted.length === 1
            ? 'Recording uploaded'
            : combined.accepted.length > 1
              ? `${combined.accepted.length} recordings uploaded`
              : null;
        const rejectedSummary =
          combined.rejected.length === 1
            ? 'One file was rejected'
            : combined.rejected.length > 1
              ? `${combined.rejected.length} files were rejected`
              : null;
        const title = [acceptedSummary, rejectedSummary]
          .filter((part): part is string => part !== null)
          .join(', ');
        const description = [
          ...combined.accepted.map((file) => file.originalName),
          ...combined.rejected.map(
            (rejection) => `${rejection.originalName}: ${rejection.reason}`,
          ),
        ].join('; ');
        const notify =
          combined.rejected.length > 0 ? toast.danger : toast.success;
        notify(title, { description });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired();
        return;
      }
      setUploadError(
        error instanceof ApiError
          ? error.message
          : 'Upload failed. Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const hasUploadableFile = stagedFiles.some((staged) => !staged.error);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Upload a recording</Card.Title>
        <Card.Description>
          Upload one or more meeting recordings.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <div
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
            isUploading
              ? 'cursor-not-allowed border-zinc-200 opacity-50 dark:border-zinc-800'
              : isDragActive
                ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                : 'border-zinc-200 dark:border-zinc-800'
          }`}
          data-testid="upload-drop-zone"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300 dark:hover:file:bg-indigo-900"
            disabled={isUploading}
            multiple
            type="file"
            onChange={handleFileChange}
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            or drag and drop one or more files here
          </p>
        </div>

        {dropError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{dropError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {stagedFiles.length > 0 ? (
          <ul
            className="flex flex-col gap-1 text-sm"
            data-testid="staged-file-list"
          >
            {stagedFiles.map(({ file, error }, index) => (
              <li
                key={`${index}-${file.name}`}
                className={
                  error
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-zinc-600 dark:text-zinc-400'
                }
              >
                {error ? `${file.name}: ${error}` : file.name}
              </li>
            ))}
          </ul>
        ) : null}

        {uploadError ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{uploadError}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : null}

        {isUploading ? (
          <ProgressBar aria-label="Upload progress" value={progress}>
            <ProgressBar.Output />
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        ) : null}

        <Button
          fullWidth
          isDisabled={stagedFiles.length === 0 || !hasUploadableFile}
          isPending={isUploading}
          onPress={handleUpload}
        >
          {isUploading ? (
            <Spinner color="current" size="sm" />
          ) : (
            <Upload size={16} />
          )}
          {isUploading ? 'Uploading…' : 'Upload'}
        </Button>

        {batchResult ? (
          <ul
            className="flex flex-col gap-1 text-sm"
            data-testid="upload-batch-result"
          >
            {batchResult.accepted.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"
              >
                <CheckCircle2 size={16} />
                {file.originalName} uploaded successfully
              </li>
            ))}
            {batchResult.rejected.map((rejection, index) => (
              <li
                key={`${index}-${rejection.originalName}`}
                className="flex items-center gap-2 text-red-600 dark:text-red-400"
              >
                <XCircle size={16} />
                {rejection.originalName}: {rejection.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </Card.Content>
    </Card>
  );
}
