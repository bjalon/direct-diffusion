import { useEffect, useRef, useState } from 'react';

const FACEBOOK_SDK_ID = 'facebook-jssdk';
const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/fr_FR/sdk.js#xfbml=1&version=v23.0';

let facebookSdkPromise = null;

function loadFacebookSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('facebook-sdk-window-unavailable'));
  }
  if (window.FB?.XFBML) {
    return Promise.resolve(window.FB);
  }
  if (facebookSdkPromise) {
    return facebookSdkPromise;
  }

  facebookSdkPromise = new Promise((resolve, reject) => {
    const resolveIfReady = () => {
      if (window.FB?.XFBML) {
        window.clearTimeout(timeoutId);
        window.clearInterval(pollId);
        resolve(window.FB);
        return true;
      }
      return false;
    };

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(pollId);
      facebookSdkPromise = null;
      reject(new Error('facebook-sdk-load-timeout'));
    }, 10000);

    const pollId = window.setInterval(() => {
      resolveIfReady();
    }, 100);

    const existingScript = document.getElementById(FACEBOOK_SDK_ID);
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = FACEBOOK_SDK_ID;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.src = FACEBOOK_SDK_SRC;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        window.clearInterval(pollId);
        facebookSdkPromise = null;
        reject(new Error('facebook-sdk-load-failed'));
      };
      script.onload = () => {
        resolveIfReady();
      };
      document.body.appendChild(script);
      return;
    }

    resolveIfReady();
  });

  return facebookSdkPromise;
}

function createFallbackIframe({ fallbackSrc, width, height }) {
  return (
    <iframe
      src={fallbackSrc}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      scrolling="no"
      frameBorder="0"
      allowFullScreen
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
    />
  );
}

export default function FacebookVideoEmbed({
  embedKey,
  videoUrl,
  width,
  height,
  fallbackSrc,
  autoplay = true,
  loop = true,
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const endedListenerRef = useRef(null);
  const [sdkFailed, setSdkFailed] = useState(false);
  const embedId = `fb-video-${embedKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  useEffect(() => {
    let active = true;
    let readyHandler = null;

    const releasePlayer = () => {
      endedListenerRef.current?.release?.();
      endedListenerRef.current = null;
      playerRef.current = null;
    };

    setSdkFailed(false);

    loadFacebookSdk()
      .then((FB) => {
        if (!active || !hostRef.current) {
          return;
        }

        readyHandler = (msg) => {
          if (!active || msg.type !== 'video' || msg.id !== embedId) {
            return;
          }

          releasePlayer();
          playerRef.current = msg.instance;

          if (loop) {
            endedListenerRef.current = msg.instance.subscribe('finishedPlaying', () => {
              try {
                msg.instance.seek(0);
              } catch {}
              try {
                msg.instance.play();
              } catch {}
            });
          }

          if (autoplay) {
            try {
              msg.instance.play();
            } catch {}
          }
        };

        FB.Event.subscribe('xfbml.ready', readyHandler);

        hostRef.current.textContent = '';
        const playerNode = document.createElement('div');
        playerNode.id = embedId;
        playerNode.className = 'fb-video facebook-video-embed';
        playerNode.setAttribute('data-href', videoUrl);
        playerNode.setAttribute('data-width', String(width));
        playerNode.setAttribute('data-autoplay', autoplay ? 'true' : 'false');
        playerNode.setAttribute('data-allowfullscreen', 'true');
        playerNode.setAttribute('data-show-text', 'false');
        playerNode.setAttribute('data-show-captions', 'false');

        hostRef.current.appendChild(playerNode);
        FB.XFBML.parse(hostRef.current);
      })
      .catch(() => {
        if (active) {
          setSdkFailed(true);
        }
      });

    return () => {
      active = false;
      releasePlayer();
      if (window.FB && readyHandler) {
        window.FB.Event.unsubscribe('xfbml.ready', readyHandler);
      }
      if (hostRef.current) {
        hostRef.current.textContent = '';
      }
    };
  }, [autoplay, embedId, loop, videoUrl, width]);

  if (sdkFailed || !videoUrl) {
    return createFallbackIframe({ fallbackSrc, width, height });
  }

  return <div ref={hostRef} className="facebook-video-host" />;
}
