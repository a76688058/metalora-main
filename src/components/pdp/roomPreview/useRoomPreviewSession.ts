import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { decodeRoomPhoto, revokeRoomPhotoUrl, RoomPhotoDecodeError } from './decodeRoomPhoto';
import {
  DEFAULT_ARTWORK_PLACEMENT,
  ROOM_PHOTO_DECODE_ERROR,
  type ArtworkPlacement,
  type RoomArtworkMode,
  type RoomPhotoDisplay,
  type RoomPreviewPhase,
} from './types';

function copyDefaultPlacement(): ArtworkPlacement {
  return { ...DEFAULT_ARTWORK_PLACEMENT };
}

export interface RoomPreviewSession {
  phase: RoomPreviewPhase;
  photo: RoomPhotoDisplay | null;
  error: string | null;
  placement: ArtworkPlacement;
  mode: RoomArtworkMode;
  ingestFile: (file: File) => Promise<void>;
  setPlacement: Dispatch<SetStateAction<ArtworkPlacement>>;
  setMode: Dispatch<SetStateAction<RoomArtworkMode>>;
  resetPlacement: () => void;
  reset: () => void;
}

export function useRoomPreviewSession(): RoomPreviewSession {
  const photoRef = useRef<RoomPhotoDisplay | null>(null);
  const [phase, setPhase] = useState<RoomPreviewPhase>('empty');
  const [photo, setPhoto] = useState<RoomPhotoDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<ArtworkPlacement>(copyDefaultPlacement);
  const [mode, setMode] = useState<RoomArtworkMode>('locked');

  const dropCurrentUrl = useCallback(() => {
    const current = photoRef.current;
    if (current?.url) revokeRoomPhotoUrl(current.url);
    photoRef.current = null;
  }, []);

  const resetPlacement = useCallback(() => {
    setPlacement(copyDefaultPlacement());
    setMode('locked');
  }, []);

  const ingestFile = useCallback(
    async (file: File) => {
      setPhase('decoding');
      setError(null);
      try {
        const decoded = await decodeRoomPhoto(file);
        const url = URL.createObjectURL(decoded.blob);
        dropCurrentUrl();
        const next: RoomPhotoDisplay = {
          url,
          width: decoded.width,
          height: decoded.height,
          sourceWidth: decoded.sourceWidth,
          sourceHeight: decoded.sourceHeight,
        };
        photoRef.current = next;
        setPhoto(next);
        setPlacement(copyDefaultPlacement());
        setMode('locked');
        setPhase('ready');
      } catch (caught) {
        const message =
          caught instanceof RoomPhotoDecodeError ? caught.message : ROOM_PHOTO_DECODE_ERROR;
        setError(message);
        setPhoto(photoRef.current);
        setPhase(photoRef.current ? 'ready' : 'empty');
      }
    },
    [dropCurrentUrl],
  );

  const reset = useCallback(() => {
    dropCurrentUrl();
    setPhoto(null);
    setPhase('empty');
    setError(null);
    setPlacement(copyDefaultPlacement());
    setMode('locked');
  }, [dropCurrentUrl]);

  useEffect(
    () => () => {
      dropCurrentUrl();
    },
    [dropCurrentUrl],
  );

  return {
    phase,
    photo,
    error,
    placement,
    mode,
    ingestFile,
    setPlacement,
    setMode,
    resetPlacement,
    reset,
  };
}
