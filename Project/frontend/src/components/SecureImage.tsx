import React, { useState, useEffect } from 'react';
import api, { API_URL } from '../api/axios';

interface SecureImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  srcKey?: string;
  fallbackSrc?: string;
}

const urlCache: Record<string, string> = {};
let imageQueue: string[] = [];
let resolvers: Record<string, ((url: string) => void)[]> = {};
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

const batchFetchImages = () => {
  if (imageQueue.length === 0) return;

  const keysToFetch = [...new Set(imageQueue)];
  imageQueue = [];
  
  const currentResolvers = resolvers;
  resolvers = {};

  api.post('/view-image/bulk', { keys: keysToFetch })
    .then(res => {
      const urls = res.data.urls || {};
      keysToFetch.forEach(key => {
        const url = urls[key];
        if (url) urlCache[key] = url;
        if (currentResolvers[key]) {
          currentResolvers[key].forEach(resolve => resolve(url));
        }
      });
    })
    .catch(err => {
      console.error('Failed bulk image fetch', err);
      keysToFetch.forEach(key => {
        if (currentResolvers[key]) {
          currentResolvers[key].forEach(resolve => resolve(''));
        }
      });
    });
};

const getSecureImageUrl = (srcKey: string): Promise<string> => {
  if (urlCache[srcKey]) {
    return Promise.resolve(urlCache[srcKey]);
  }

  return new Promise((resolve) => {
    if (!resolvers[srcKey]) {
      resolvers[srcKey] = [];
    }
    resolvers[srcKey].push(resolve);
    
    imageQueue.push(srcKey);

    if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        batchTimeout = null;
        batchFetchImages();
      }, 50);
    }
  });
};

export const SecureImage: React.FC<SecureImageProps> = ({ srcKey, fallbackSrc, className, alt, ...props }) => {
  const [imgSrc, setImgSrc] = useState<string>(fallbackSrc || '');
  const [loading, setLoading] = useState<boolean>(true);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSecureUrl = async () => {
      if (!srcKey) {
        setLoading(false);
        return;
      }

      if (srcKey.startsWith('/') || srcKey.startsWith('http') || srcKey.startsWith('data:')) {
        setImgSrc(srcKey.startsWith('/') ? `${API_URL}${srcKey}` : srcKey);
        setLoading(false);
        return;
      }

      try {
        const viewUrl = await getSecureImageUrl(srcKey);
        if (isMounted && viewUrl) {
          setImgSrc(viewUrl);
        }
      } catch (error) {
        console.error('Failed to load secure image', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSecureUrl();

    return () => {
      isMounted = false;
    };
  }, [srcKey, fallbackSrc]);

  if (loading) {
    return <div className={`animate-pulse bg-slate-200 ${className}`} {...(props as any)}></div>;
  }

  return (
    <>
      {!imageLoaded && (
        <div className={`animate-pulse bg-slate-200 ${className}`} style={props.style}></div>
      )}
      <img
        src={imgSrc || fallbackSrc}
        className={`${className} ${!imageLoaded ? 'hidden' : ''}`}
        alt={alt || 'Image'}
        onLoad={(e) => {
          setImageLoaded(true);
          if (props.onLoad) props.onLoad(e);
        }}
        {...props}
      />
    </>
  );
};
