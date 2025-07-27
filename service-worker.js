const CACHE_NAME = 'mfpt-cache-v1';
const CACHE_VERSION = '1.0.0';

// 本地资源预缓存列表
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/dist/style.css',
    '/assets/css/theme-transitions.css',
    '/assets/js/ui.js',
    '/assets/js/core.js',
    '/assets/js/storage.js',
    '/assets/js/timer.js',
    '/assets/js/charts.js',
    '/assets/js/constants.js',
    '/assets/js/theme-manager.js',
    '/assets/icons/android-chrome-192x192.png',
    '/assets/icons/android-chrome-512x512.png',
    '/assets/icons/apple-touch-icon.png',
    '/assets/icons/favicon-16x16.png',
    '/assets/icons/favicon-32x32.png',
    '/assets/icons/favicon.ico'
];

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
    's4.zstatic.net': { // 添加或修改此条目以匹配 cdn.staticfile.org
        maxAge: 30 * 24 * 60 * 60 * 1000,  // 30天
        paths: [
            '/echarts/'  // 匹配 ECharts 路径
        ]
    }
};

const LOCAL_ASSET_MAX_AGE = 24 * 60 * 60 * 1000; // 24小时 (毫秒)
let hasUpdatesAvailable = false;
let updateCheckInProgress = false;

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app assets...');
                return Promise.allSettled(
                    ASSETS_TO_CACHE.map(url => {
                        return cache.add(url).catch(error => {
                            console.warn('Failed to cache:', url, error);
                            return Promise.resolve();
                        });
                    })
                );
            })
            .then(() => {
                console.log('Assets cached successfully');
                return self.skipWaiting();
            })
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

// 检查本地资源是否需要更新
async function checkForUpdates() {
    if (updateCheckInProgress) {
        console.log('更新检查已在进行中，跳过');
        return;
    }
    // 在检查更新之前，先确认是否在线
    if (!navigator.onLine) {
        console.log('浏览器离线，跳过更新检查');
        return;
    }
    updateCheckInProgress = true;
    
    try {
        const cache = await caches.open(CACHE_NAME);
        const updatedResources = [];
        
        console.log('开始检查本地资源更新...', ASSETS_TO_CACHE.length, '个资源');
        
        // 优化：先用 HEAD 请求比对资源头部，只有有更新时才用 GET 请求下载完整内容
        for (const url of ASSETS_TO_CACHE) {
            try {
                const cachedResponse = await cache.match(url);
                let headResponse;
                try {
                    headResponse = await fetch(url, { method: 'HEAD', cache: 'no-cache', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
                } catch (e) {
                    console.warn(`HEAD 请求失败，尝试 GET: ${url}`);
                    headResponse = await fetch(url, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
                }
                if (!headResponse.ok) continue;

                // 如果没有缓存，说明是新资源，需要缓存
                if (!cachedResponse) {
                    console.log(`发现新资源: ${url}`);
                    // 新资源需要完整下载
                    const networkResponse = await fetch(url, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
                    if (networkResponse.ok) {
                        updatedResources.push({ url, response: networkResponse });
                    }
                    continue;
                }

                // 比较ETag或Last-Modified
                const cachedETag = cachedResponse.headers.get('etag');
                const networkETag = headResponse.headers.get('etag');
                const cachedLastModified = cachedResponse.headers.get('last-modified');
                const networkLastModified = headResponse.headers.get('last-modified');

                let isUpdated = false;
                if (cachedETag && networkETag) {
                    isUpdated = cachedETag !== networkETag;
                } else if (cachedLastModified && networkLastModified) {
                    isUpdated = cachedLastModified !== networkLastModified;
                } else {
                    // 如果没有ETag或Last-Modified，比较内容长度
                    const cachedLength = cachedResponse.headers.get('content-length');
                    const networkLength = headResponse.headers.get('content-length');
                    if (cachedLength && networkLength) {
                        isUpdated = cachedLength !== networkLength;
                    }
                }

                if (isUpdated) {
                    console.log(`发现更新: ${url}`);
                    // 有更新时才完整下载
                    const networkResponse = await fetch(url, { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
                    if (networkResponse.ok) {
                        updatedResources.push({ url, response: networkResponse });
                    }
                }
            } catch (error) {
                console.warn(`检查更新失败 ${url}:`, error);
            }
        }
        
        // 如果有更新的资源，批量下载并缓存所有更新资源
        if (updatedResources.length > 0) {
            console.log(`发现 ${updatedResources.length} 个资源需要更新，开始下载...`);
            
            // 批量缓存所有更新的资源
            const cachePromises = updatedResources.map(async ({ url, response }) => {
                try {
                    const clonedResponse = response.clone();
                    const headers = new Headers(clonedResponse.headers);
                    headers.set('sw-fetched-on', new Date().toISOString());
                    headers.set('sw-cache-max-age', LOCAL_ASSET_MAX_AGE.toString());
                    
                    const responseToCache = new Response(clonedResponse.body, {
                        status: clonedResponse.status,
                        statusText: clonedResponse.statusText,
                        headers: headers
                    });
                    
                    await cache.put(url, responseToCache);
                    console.log(`缓存更新完成: ${url}`);
                } catch (error) {
                    console.error(`缓存更新失败 ${url}:`, error);
                    throw error;
                }
            });
            
            // 等待所有资源缓存完成
            await Promise.all(cachePromises);
            
            hasUpdatesAvailable = true;
            console.log('所有资源更新下载完成，通知用户');
            
            // 通知所有客户端有更新可用
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'UPDATE_AVAILABLE',
                    message: '应用已更新并下载完成，刷新页面即可使用最新版本',
                    updatedCount: updatedResources.length
                });
            });
        } else if (updatedResources.length === 0) {
            console.log('未发现资源更新');
        }
    } catch (error) {
        console.error('检查更新时出错:', error);
    } finally {
        updateCheckInProgress = false;
    }
}

// 监听客户端消息
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        checkForUpdates();
    }
});

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
    } catch (e) {
        console.log('Invalid URL:', url, e);
    }
    // 如果不是已配置的 CDN，返回默认策略
    return {
        isCDN: false,
        maxAge: 0
    };
}

self.addEventListener('fetch', (event) => {
    // 只缓存 GET 请求
    if (event.request.method !== 'GET' || !isRequestCacheable(event.request.url)) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 对所有 GET 请求应用 Cache-First 策略
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                // 如果有缓存，直接返回缓存
                if (cachedResponse) {
                    // console.log(`[Cache] 从缓存中提供: ${event.request.url}`);
                    return cachedResponse;
                }

                // 如果没有缓存，从网络获取
                console.log(`[Network] 缓存中未找到，从网络获取: ${event.request.url}`);
                return fetch(event.request).then(networkResponse => {
                    if (networkResponse && networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        cache.put(event.request, responseToCache);
                        // console.log(`[Network] 获取并缓存成功: ${event.request.url}`);
                    }
                    return networkResponse;
                }).catch(error => {
                    console.error('网络请求失败:', event.request.url, error);
                    // 可选：返回一个通用的离线占位响应
                    return new Response('网络错误，无法加载资源', {
                        status: 408,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            });
        })
    );
});