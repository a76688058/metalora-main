import { useEffect, useRef, useState } from 'react';
import { resolveVideoHeroMedia, type VideoHeroMediaConfig } from './videoHeroConfig';
import './videoHero.css';

function useMatch(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const apply = () => setMatches(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [query]);
  return matches;
}

type VideoHeroProps = {
  media?: Partial<VideoHeroMediaConfig> | null;
  /** Render only the frame so a parent carousel owns the outer hero box. */
  embedded?: boolean;
  /** When false inside a carousel, pause and keep the current frame. */
  active?: boolean;
  onEnded?: () => void;
  onBlocked?: () => void;
};

export default function VideoHero({ media, embedded = false, active = true, onEnded, onBlocked }: VideoHeroProps) {
  const reduce = useMatch('(prefers-reduced-motion: reduce)');
  const config = resolveVideoHeroMedia(media);
  const videoRef = useRef<HTMLVideoElement>(null);
  const finishedRef = useRef(false);
  const restartingRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const showVideo = Boolean(config.src) && !failed;
  const onBlockedRef = useRef(onBlocked);
  const onEndedRef = useRef(onEnded);
  onBlockedRef.current = onBlocked;
  onEndedRef.current = onEnded;

  useEffect(() => {
    finishedRef.current = false;
    setFailed(false);
    setPlaying(false);
    setHeld(false);
    setNeedsGesture(false);
  }, [config.src]);

  useEffect(() => {
    if (!embedded || !active || showVideo || !failed) return;
    onBlockedRef.current?.();
  }, [embedded, active, showVideo, failed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;
    if (!active) {
      video.pause();
      return;
    }
    let cancelled = false;
    video.muted = true;
    const start = () => {
      if (cancelled) return;
      if (reduce) {
        setNeedsGesture(true);
        return;
      }
      if (finishedRef.current || video.ended) {
        finishedRef.current = false;
        restartingRef.current = true;
        try { video.currentTime = 0; } catch { /* seek can throw before metadata */ }
      }
      const pending = video.play();
      pending?.catch((error: DOMException) => {
        if (cancelled || error?.name === 'AbortError') return;
        if (error?.name === 'NotAllowedError') {
          setNeedsGesture(true);
          return;
        }
        setFailed(true);
      });
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) start();
    else video.addEventListener('loadeddata', start, { once: true });
    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', start);
    };
  }, [showVideo, active, config.src, reduce]);

  const playFromGesture = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const pending = video.play();
    pending?.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  };

  const finishEmbedded = () => {
    const video = videoRef.current;
    if (!embedded || !active || finishedRef.current) return;
    finishedRef.current = true;
    if (video && !video.paused) video.pause();
    onEndedRef.current?.();
  };

  const frame = (
    <div className="n75-video-frame">
      {showVideo && config.src ? (
        <video
          ref={videoRef}
          className={`n75-video-media${playing ? ' is-playing' : ''}${held ? ' is-held' : ''}`}
          muted
          autoPlay={!reduce && active}
          playsInline
          loop={!embedded}
          preload="auto"
          src={config.src}
          controls={false}
          disablePictureInPicture
          aria-hidden={needsGesture ? undefined : true}
          onPlaying={() => {
            setPlaying(true);
            setHeld(true);
            setNeedsGesture(false);
          }}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (restartingRef.current) {
              if (video.currentTime > 0.2) restartingRef.current = false;
              return;
            }
            if (!embedded || !active || finishedRef.current || reduce) return;
            if (!Number.isFinite(video.duration) || video.duration <= 0) return;
            if (video.duration - video.currentTime > 0.3) return;
            finishEmbedded();
          }}
          onEnded={finishEmbedded}
          onError={() => setFailed(true)}
        />
      ) : null}
      {needsGesture ? (
        <button type="button" className="n75-video-play" onClick={playFromGesture}>
          영상 재생
        </button>
      ) : null}
    </div>
  );

  if (embedded) return frame;

  return (
    <section className="n75-video-hero" aria-label="미리보기 영상">
      {frame}
    </section>
  );
}
