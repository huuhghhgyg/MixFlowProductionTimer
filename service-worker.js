const CACHE_NAME = 'mfpt-cache-v1';
const CACHE_VERSION = '1.0.0';

const ASSETS_TO_CACHE = [
    '.',
    'index.html',
    'style.css',
    'manifest.json',
    'assets/js/charts.js',
    'assets/js/constants.js',
    'assets/js/core.js',
    'assets/js/storage.js',
    'assets/js/timer.js',
    'assets/js/ui.js',
    'assets/icons/android-chrome-192x192.png',
    'assets/icons/android-chrome-512x512.png',
    'assets/icons/apple-touch-icon.png',
    'assets/icons/favicon-16x16.png',
    'assets/icons/favicon-32x32.png',
    'assets/icons/favicon.ico'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return Promise.all(
                    ASSETS_TO_CACHE.map(url => {
                        return cache.add(url).catch(error => {
                            console.error('Failed to cache:', url, error);
                            return Promise.resolve();
                        });
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return clients.claim();
        })
    );
});

// 检查 URL 是否可缓存
function isRequestCacheable(url) {
    try {
        const urlObj = new URL(url);
        // 允许缓存本地资源和指定的 CDN 资源
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// 检查是否是外部资源
function isExternalResource(url) {
    return url.includes('bootcdn.net') || 
           url.includes('fonts.googleapis.com') || 
           url.includes('gstatic.com');
}

self.addEventListener('fetch', (event) => {
    // 对于外部资源（CDN），优先使用网络请求，失败时再使用缓存
    if (isExternalResource(event.request.url)) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 对于本地资源，优先使用缓存，同时在后台更新缓存
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    // 如果有缓存就先返回缓存
                    fetch(event.request)
                        .then(networkResponse => {
                            if (networkResponse && networkResponse.ok && isRequestCacheable(event.request.url)) {
                                caches.open(CACHE_NAME)
                                    .then(cache => cache.put(event.request, networkResponse));
                            }
                        })
                        .catch(() => {});
                    return response;
                }

                // 如果没有缓存，发起网络请求
                return fetch(event.request)
                    .then(networkResponse => {
                        if (!networkResponse || !networkResponse.ok) {
                            return networkResponse;
                        }

                        if (isRequestCacheable(event.request.url)) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, responseToCache));
                        }

                        return networkResponse;
                    });
            })
    );
});