// @ts-nocheck

import { incPluginDownload } from "./analyze";

export const baseURL = "https://gitee.com/microblock/BetterNCMPluginsMarketData/raw/master/";

export async function installPlugin(plugin, onlinePlugins) {
    incPluginDownload(plugin.slug,plugin.version);
    
	for (let requirement of (plugin.requirements ?? [])) {
		if (loadedPlugins[requirement]) continue;

		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			const result = await installPlugin(requiredPlugin);
			if (result != "success") return result;
		} else {
			return `${plugin.name} 的依赖 ${requiredPlugin} 解析失败！插件将不会安装`;
		}
	}

	await betterncm.fs.writeFile("./plugins/" + plugin.file, await (await fetch(baseURL + plugin['file-url'])).blob());

	return "success";
}

export async function deletePlugin(plugin) {
	if (!loadedPlugins[plugin.slug]) {
		if (await betterncm.fs.exists("./plugins/" + plugin.file)) {
			await betterncm.fs.remove("./plugins/" + plugin.file);
			return "success";
		}
		return "插件未安装";
	}
	let path = await betterncm.fs.readFileText(loadedPlugins[plugin.slug].pluginPath + "/.plugin.path.meta");
	if (path) {
		await betterncm.fs.remove(path);
		return "success";
	}
	return "未找到插件路径，卸载失败";
}

export const loadOnlinePlugins = async () => {
	return await (await fetch(baseURL + "plugins.json?" + new Date().getTime())).json();
}

