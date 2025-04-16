const CACHE_NAME = 'mfpt-cache-v1';
const CACHE_VERSION = '1.0.0'; // 添加版本号，每次更新时修改这个值

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200',
    'https://fonts.googleapis.com/css2?family=Google+Sans+Display:wght@400;500;700&family=Google+Sans+Text:wght@400;500&display=swap',
    'https://cdn.bootcdn.net/ajax/libs/echarts/5.4.3/echarts.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting()) // 强制新 Service Worker 立即激活
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName); // 删除旧版本缓存
                    }
                })
            );
        }).then(() => {
            // 立即控制所有页面
            return clients.claim();
        })
    );
});

// 检查 URL 是否可缓存
function isRequestCacheable(url) {
    try {
        const urlObj = new URL(url);
        // 只缓存 http/https 协议的请求
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果找到缓存的响应，先返回缓存
                if (response) {
                    // 同时发起网络请求以更新缓存
                    if (isRequestCacheable(event.request.url)) {
                        fetch(event.request).then((networkResponse) => {
                            if (networkResponse && networkResponse.ok) {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(event.request, networkResponse);
                                });
                            }
                        }).catch(() => {
                            // 忽略更新缓存时的错误
                        });
                    }
                    return response;
                }

                // 如果没有缓存，发起网络请求
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || !networkResponse.ok) {
                        return networkResponse;
                    }

                    // 只缓存可缓存的请求
                    if (isRequestCacheable(event.request.url)) {
                        // 克隆响应，因为响应流只能被读取一次
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }

                    return networkResponse;
                });
            })
    );
});