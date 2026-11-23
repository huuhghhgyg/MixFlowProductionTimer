const CACHE_NAME = 'mfpt-cache-v2';

// 本地资源预缓存列表
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'manifest.json',
    'dist/style.css',
    'dist/m3e.js',
    'assets/css/theme-transitions.css',
    'assets/js/ui.js',
    'assets/js/core.js',
    'assets/js/storage.js',
    'assets/js/timer.js',
    'assets/js/charts.js',
    'assets/js/constants.js',
    'assets/js/theme-manager.js',
    'assets/js/echarts.min.js',
    'assets/icons/android-chrome-192x192.png',
    'assets/icons/android-chrome-512x512.png',
    'assets/icons/android-chrome-maskable-192x192.png',
    'assets/icons/android-chrome-maskable-512x512.png',
    'assets/icons/apple-touch-icon.png',
    'assets/icons/favicon-16x16.png',
    'assets/icons/favicon-32x32.png',
    'assets/icons/favicon.ico'
].map(path => new URL(path, self.registration.scope).href);

const LOCAL_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
let updateCheckInProgress = false;

function cacheAppShell(cache) {
    // Keep the HTML, CSS and modules together if any request fails.
    return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cacheAppShell).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.filter(name =>
            name.startsWith('mfpt-cache-') && name !== CACHE_NAME
        ).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function hasAssetChanged(cache, url) {
    const cached = await cache.match(url);
    if (!cached) return true;

    const network = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!network.ok) return false;
    for (const header of ['etag', 'last-modified', 'content-length']) {
        const previous = cached.headers.get(header);
        const current = network.headers.get(header);
        if (current) return previous !== current;
    }
    return false;
}

async function checkForUpdates() {
    if (updateCheckInProgress || !navigator.onLine) return;
    updateCheckInProgress = true;
    try {
        const cache = await caches.open(CACHE_NAME);
        const checks = await Promise.all(ASSETS_TO_CACHE.map(url => hasAssetChanged(cache, url)));
        const updatedCount = checks.filter(Boolean).length;
        if (!updatedCount) return;

        await cacheAppShell(cache);
        for (const client of await self.clients.matchAll()) {
            client.postMessage({
                type: 'UPDATE_AVAILABLE',
                message: '应用已更新并下载完成，刷新页面即可使用最新版本',
                updatedCount
            });
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    } finally {
        updateCheckInProgress = false;
    }
}

self.addEventListener('message', (event) => {
    if (event.data?.type === 'CHECK_UPDATE') event.waitUntil(checkForUpdates());
});

async function fetchLocalAppAsset(request) {
    // Live Server serves the current files even when an older app shell is cached.
    try {
        return await fetch(request, { cache: 'no-cache' });
    } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
    }
}

async function fetchCachedFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone()).catch(error => {
            console.warn('缓存资源失败:', request.url, error);
        });
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || !['http:', 'https:'].includes(url.protocol)) return;

    const localAppAsset = LOCAL_DEV && url.origin === self.location.origin &&
        (request.mode === 'navigate' || ASSETS_TO_CACHE.includes(url.origin + url.pathname));
    const response = localAppAsset ? fetchLocalAppAsset(request) : fetchCachedFirst(request);
    event.respondWith(response.catch(error => {
        console.error('网络请求失败:', request.url, error);
        return new Response('网络错误，无法加载资源', {
            status: 408,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }));
});
