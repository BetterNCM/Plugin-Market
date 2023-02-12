const API_ENDPOINT = "https://betterncm.microblock.cc/api";

export type PluginDownloadInfomation = {
    name: string,
    version: string,
    count: number
}

export async function getPluginDownloads() {
    return await (await fetch(API_ENDPOINT + '/getPluginDownloads?' + new Date().getTime())).json() as PluginDownloadInfomation[]
}

export async function incPluginDownload(name: string, version: string, ncmUserID?: string) {
    try{
        // @ts-ignore
        ncmUserID??=document.querySelector(".face.u-face.j-flag").href.split('=')[1];
    }catch(e){ 
        // ignore error
    }
    return (await (await fetch(API_ENDPOINT + `/incPluginDownload?name=${encodeURIComponent(name)}&version=${version}&ncmUserID=${encodeURIComponent(ncmUserID ?? "-")}`)).text()) as "ok" | "failed"
}