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
  /** When false inside a carousel, pause and unmount playback. */
  active?: boolean;
  onEnded?: () => void;
  onBlocked?: () => void;
};

export default function VideoHero({ media, embedded = false, active = true, onEnded, onBlocked }: VideoHeroProps) {
  const reduce = useMatch('(prefers-reduced-motion: reduce)');
  const config = resolveVideoHeroMedia(media);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const showVideo = Boolean(config.src) && !failed && active;
  const onBlockedRef = useRef(onBlocked);
  onBlockedRef.current = onBlocked;

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
    setNeedsGesture(false);
  }, [config.src, active]);

  useEffect(() => {
    if (!embedded || !active || showVideo || !failed) return;
    onBlockedRef.current?.();
  }, [embedded, active, showVideo, failed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;
    let cancelled = false;
    video.muted = true;
    const start = () => {
      if (cancelled) return;
      if (reduce) {
        setNeedsGesture(true);
        return;
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
    const arm = () => {
      if (cancelled) return;
      if (video.currentTime > 0.05) {
        try { video.currentTime = 0; } catch { /* seek can throw before metadata */ }
      }
      start();
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) arm();
    else video.addEventListener('loadeddata', arm, { once: true });
    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', arm);
      video.pause();
    };
  }, [showVideo, config.src, reduce]);

  const playFromGesture = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const pending = video.play();
    pending?.then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
  };

  const frame = (
    <div className="n75-video-frame">
      {showVideo && config.src ? (
        <video
          ref={videoRef}
          className={`n75-video-media${playing ? ' is-playing' : ''}`}
          muted
          autoPlay={!reduce}
          playsInline
          loop={!embedded}
          preload="auto"
          src={config.src}
          controls={false}
          disablePictureInPicture
          aria-hidden={needsGesture ? undefined : true}
          onPlaying={() => {
            setPlaying(true);
            setNeedsGesture(false);
          }}
          onEnded={() => onEnded?.()}
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
