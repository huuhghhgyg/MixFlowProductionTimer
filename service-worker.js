const CACHE_NAME = 'mfpt-cache-v1';
const CACHE_VERSION = '1.0.0';

// 清空预缓存列表，因为我们现在只希望缓存CDN资源
const ASSETS_TO_CACHE = [];

const CDN_RESOURCES = {
    'fonts.googleapis.com': {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
        paths: [
            '/css2',  // Material Icons 和 Google Sans 字体的 CSS
        ]
    },
    'fonts.gstatic.com': {
        maxAge: 30 * 24 * 60 * 60 * 1000,  // 30天
        paths: [
            '/s/materialsymbolsrounded',  // Material Icons 字体文件
            '/s/googlesansdisplay',       // Google Sans Display 字体文件
            '/s/googlesanstext'           // Google Sans Text 字体文件
        ]
    },
    'bootcdn.net': {
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7天
        paths: [
            '/ajax/libs/echarts/'  // ECharts 库
        ]
    }
};

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
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

// 检查外部资源并获取其缓存策略
function getExternalResourceStrategy(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname;
        
        // 检查是否是已配置的 CDN
        const cdnConfig = CDN_RESOURCES[hostname];
        if (cdnConfig) {
            // 检查路径是否匹配
            if (cdnConfig.paths.some(path => pathname.startsWith(path))) {
                return {
                    isCDN: true,
                    maxAge: cdnConfig.maxAge
                };
            }
        }
        
        return {
            isCDN: false,
            maxAge: 0
        };
    } catch (e) {
        return {
            isCDN: false,
            maxAge: 0
        };
    }
}

self.addEventListener('fetch', (event) => {
    // 检查请求是否来自已配置的 CDN
    const strategy = getExternalResourceStrategy(event.request.url);
    
    if (strategy.isCDN) {
        // 对于 CDN 资源，使用 stale-while-revalidate 策略
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.ok) {
                            // 克隆响应，因为它只能使用一次
                            const clonedResponse = networkResponse.clone();
                            
                            // 设置缓存的过期时间
                            const headers = new Headers(clonedResponse.headers);
                            headers.set('sw-fetched-on', new Date().toISOString());
                            headers.set('sw-cache-max-age', strategy.maxAge);
                            
                            const responseToCache = new Response(clonedResponse.body, {
                                status: clonedResponse.status,
                                statusText: clonedResponse.statusText,
                                headers: headers
                            });
                            
                            cache.put(event.request, responseToCache);
                        }
                        return networkResponse;
                    });

                    // 如果有缓存且未过期，返回缓存
                    if (cachedResponse) {
                        const fetchedOn = new Date(cachedResponse.headers.get('sw-fetched-on'));
                        const maxAge = parseInt(cachedResponse.headers.get('sw-cache-max-age'));
                        if (fetchedOn && maxAge && (Date.now() - fetchedOn.getTime() < maxAge)) {
                            return cachedResponse;
                        }
                    }

                    // 否则返回网络请求，同时在后台更新缓存
                    return fetchPromise.catch(() => cachedResponse || new Response('Network error', {
                        status: 408,
                        headers: { 'Content-Type': 'text/plain' }
                    }));
                });
            })
        );
        return;
    }

    // 对于本地资源，不再使用 Cache First 策略，而是直接从网络获取
    // 这样可以确保本地的 HTML, CSS, JS 文件不会被 Service Worker 缓存
    event.respondWith(fetch(event.request));
});