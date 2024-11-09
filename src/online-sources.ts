const localSources = [
    {
        "name": "Default",
        "baseURL": "https://bncm-plugin.microblock.cc/",
        "trustable": true
    },
    {
        "name": "Unpkg",
        "baseURL": "https://unpkg.com/betterncm-packed-plugins/plugins.json",
        "trustable": true
    },
    {
        "name": "Github (UserContent)",
        "baseURL": "https://raw.githubusercontent.com/BetterNCM/BetterNCM-Packed-Plugins/master/",
        "trustable": true
    },
    {
        "name": "Github (Raw)",
        "baseURL": "https://github.com/BetterNCM/BetterNCM-Packed-Plugins/raw/master/",
        "trustable": true
    },
    {
        "name": "MicroBlock (Cloudflare)",
        "baseURL": "https://bncm-plugin.microblock.cc/",
        "trustable": true
    }
]

export type RemoteSource = typeof localSources[number]

const remoteSource = 'https://ganbei-hot-update-1258625969.file.myqcloud.com/betterncm-data/sources.json'

var React: any;
let _onlineSourcesPromiseCache: Promise<typeof localSources> = null, loaded: typeof localSources = null

export const fetchOnlineSources = async () => {
    if (_onlineSourcesPromiseCache) return _onlineSourcesPromiseCache
    _onlineSourcesPromiseCache = fetch(remoteSource).then(res => res.json()).then(v => {
        loaded = v
        return v
    })
    return _onlineSourcesPromiseCache
}

export const getOnlineSourcesCachedOrLocal = () => {
    if (loaded) return loaded
    return localSources
}

export const usePluginSources: () => typeof localSources = () => {
    // @ts-ignore
    const [sources, setSources] = globalThis.React.useState(localSources)
    // @ts-ignore
    globalThis.React.useEffect(() => {
        fetchOnlineSources().then(setSources)
    }, [])
    return sources
}
